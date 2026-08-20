import { createHash } from "node:crypto";
import {
  LedgerKind,
  OutputStatus,
  Prisma,
  ReservationStatus,
  ReviewStatus,
  RunState,
} from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { executeCreativeRequest } from "./gateway";
import { createDownloadUrl, isWorkspaceObjectKey, verifyUploadedObject } from "./storage";
import { analyzeMediaAsset, runAssetGate } from "./asset-intelligence";
import { createMediaJob } from "./media-jobs";
import { providerApiError, requestProvider } from "./provider-http";
import { requiresProductionAuthentication } from "./runtime-config";
import { enforceWorkspaceSpendCap } from "./spending";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

async function reserveComparisonAttempt(
  context: RequestContext,
  comparisonId: string,
  modelRef: string,
) {
  return db.$transaction(
    async (tx) => {
      const idempotencyKey = `comparison:${comparisonId}:${modelRef}:reserve`;
      const existing = await tx.ledgerEntry.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId: context.workspaceId, idempotencyKey } },
      });
      if (existing) return existing.reservationId;
      const account = await tx.creditAccount.findUnique({
        where: { workspaceId: context.workspaceId },
      });
      if (!account || account.balance - account.reserved < 1)
        throw new ApiError(
          402,
          "INSUFFICIENT_CREDITS",
          "Each model comparison attempt requires one credit.",
        );
      await enforceWorkspaceSpendCap(context.workspaceId, 1, tx);
      const reservation = await tx.creditReservation.create({
        data: { workspaceId: context.workspaceId, amount: 1, status: ReservationStatus.RESERVED },
      });
      await tx.creditAccount.update({
        where: { workspaceId: context.workspaceId },
        data: { reserved: { increment: 1 } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          reservationId: reservation.id,
          kind: LedgerKind.RESERVE,
          amount: 1,
          reason: `Reserved for model comparison ${comparisonId}:${modelRef}`,
          idempotencyKey,
          metadata: json({ comparisonId, modelRef }),
        },
      });
      return reservation.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function settleComparisonAttempt(
  workspaceId: string,
  reservationId: string | null,
  comparisonId: string,
  modelRef: string,
  succeeded: boolean,
) {
  if (!reservationId) return;
  await db.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== ReservationStatus.RESERVED) return;
    const consumed = succeeded ? 1 : 0;
    await tx.creditReservation.update({
      where: { id: reservation.id },
      data: {
        status: succeeded ? ReservationStatus.SETTLED : ReservationStatus.RELEASED,
        settledAt: new Date(),
      },
    });
    await tx.creditAccount.update({
      where: { workspaceId },
      data: {
        reserved: { decrement: reservation.amount },
        ...(consumed ? { balance: { decrement: consumed } } : {}),
      },
    });
    if (consumed) {
      await tx.ledgerEntry.create({
        data: {
          workspaceId,
          reservationId: reservation.id,
          kind: LedgerKind.CONSUME,
          amount: -consumed,
          reason: `Settled model comparison ${comparisonId}:${modelRef}`,
          idempotencyKey: `comparison:${comparisonId}:${modelRef}:consume`,
        },
      });
    } else {
      await tx.ledgerEntry.create({
        data: {
          workspaceId,
          reservationId: reservation.id,
          kind: LedgerKind.RELEASE,
          amount: 0,
          reason: `Released failed model comparison ${comparisonId}:${modelRef}`,
          idempotencyKey: `comparison:${comparisonId}:${modelRef}:release`,
        },
      });
    }
  });
}

export async function createModelComparison(
  context: RequestContext,
  input: {
    prompt: string;
    modelRefs: string[];
    inputAssetIds?: string[];
    constraints?: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const modelRefs = [...new Set(input.modelRefs.map((ref) => ref.trim()).filter(Boolean))].slice(
    0,
    3,
  );
  if (!modelRefs.length)
    throw new ApiError(400, "MODEL_REQUIRED", "Select at least one model route.");
  const existing = await db.modelComparison.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { outputs: true },
  });
  if (existing) return { comparison: existing, deduplicated: true };
  const inputAssetIds = [...new Set(input.inputAssetIds ?? [])];
  const assets = inputAssetIds.length
    ? await db.asset.findMany({
        where: { workspaceId: context.workspaceId, id: { in: inputAssetIds }, deletedAt: null },
        select: { id: true },
      })
    : [];
  if (assets.length !== inputAssetIds.length)
    throw new ApiError(
      404,
      "COMPARISON_ASSET_NOT_FOUND",
      "Every comparison input asset must belong to this workspace.",
    );
  await Promise.all(inputAssetIds.map((assetId) => runAssetGate(context, assetId)));
  const comparison = await db.modelComparison.create({
    data: {
      workspaceId: context.workspaceId,
      createdBy: context.userId,
      prompt: input.prompt.trim(),
      constraints: json(input.constraints ?? {}),
      status: "RUNNING",
      idempotencyKey: input.idempotencyKey,
    },
  });
  const outputRows = await Promise.all(
    modelRefs.map(async (modelRef) => {
      const row = await db.modelComparisonOutput.create({
        data: {
          workspaceId: context.workspaceId,
          comparisonId: comparison.id,
          provider: "pending",
          model: modelRef,
          status: "RUNNING",
        },
      });
      let reservationId: string | null = null;
      try {
        reservationId = await reserveComparisonAttempt(context, comparison.id, modelRef);
        const result = await executeCreativeRequest({
          capability: "image.generate",
          inputAssets: inputAssetIds,
          prompt: `${input.prompt.trim()}\nRequested model route: ${modelRef}`,
          constraints: {
            qualityMode: "balanced",
            outputCount: 1,
            ...(input.constraints ?? {}),
          },
          workspaceId: context.workspaceId,
          idempotencyKey: `${input.idempotencyKey}:${modelRef}`,
          modelRef,
        });
        const output = result.outputs[0];
        if (
          !output?.objectKey ||
          !output.contentHash ||
          !output.mimeType ||
          !isWorkspaceObjectKey(context.workspaceId, output.objectKey)
        )
          throw new Error("The provider returned incomplete storage provenance.");
        const stored = await verifyUploadedObject({ objectKey: output.objectKey });
        const asset = await db.asset.upsert({
          where: {
            workspaceId_contentHash: {
              workspaceId: context.workspaceId,
              contentHash: output.contentHash,
            },
          },
          update: {
            status: "READY",
            name: output.name ?? `${modelRef}-comparison`,
            objectKey: output.objectKey,
            mimeType: output.mimeType,
            byteSize: stored.byteSize,
            width: output.width,
            height: output.height,
            metadata: json({
              ...(output.metadata ?? {}),
              comparisonId: comparison.id,
              modelRef,
              provider: result.provider,
            }),
          },
          create: {
            workspaceId: context.workspaceId,
            type: "GENERATED",
            status: "READY",
            name: output.name ?? `${modelRef}-comparison`,
            objectKey: output.objectKey,
            contentHash: output.contentHash,
            mimeType: output.mimeType,
            byteSize: stored.byteSize,
            width: output.width,
            height: output.height,
            metadata: json({
              ...(output.metadata ?? {}),
              comparisonId: comparison.id,
              modelRef,
              provider: result.provider,
            }),
          },
        });
        const signed = await createDownloadUrl({ objectKey: asset.objectKey, expiresIn: 900 });
        const providerCallId =
          result.providerRequestId ?? `${comparison.id}:${modelRef}:${result.provider}`;
        await db.providerCost.upsert({
          where: {
            workspaceId_providerCallId: {
              workspaceId: context.workspaceId,
              providerCallId,
            },
          },
          create: {
            workspaceId: context.workspaceId,
            provider: result.provider,
            model: result.model || modelRef,
            modelVersion: result.modelVersion,
            providerCallId,
            rawUsage: result.usage,
            costMinor: result.usage.providerCostMinor,
            currency: result.usage.currency,
          },
          update: {
            rawUsage: result.usage,
            costMinor: result.usage.providerCostMinor,
            currency: result.usage.currency,
          },
        });
        await settleComparisonAttempt(
          context.workspaceId,
          reservationId,
          comparison.id,
          modelRef,
          true,
        );
        return db.modelComparisonOutput.update({
          where: { id: row.id },
          data: {
            provider: result.provider,
            model: result.model || modelRef,
            status: "COMPLETED",
            assetId: asset.id,
            quote: json({
              providerCostMinor: result.usage.providerCostMinor,
              currency: result.usage.currency,
              warnings: result.warnings,
            }),
            metadata: json({
              downloadUrl: signed.url,
              expiresIn: signed.expiresIn,
              contentHash: asset.contentHash,
            }),
          },
        });
      } catch (error) {
        await settleComparisonAttempt(
          context.workspaceId,
          reservationId,
          comparison.id,
          modelRef,
          false,
        );
        return db.modelComparisonOutput.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            error: json({
              message: error instanceof Error ? error.message : "Comparison route failed.",
            }),
          },
        });
      }
    }),
  );
  const successful = outputRows.filter((row) => row.status === "COMPLETED");
  const updated = await db.modelComparison.update({
    where: { id: comparison.id },
    data: { status: successful.length ? "COMPLETED" : "FAILED" },
    include: { outputs: true },
  });
  return { comparison: updated, deduplicated: false };
}

export async function commitModelComparison(
  context: RequestContext,
  comparisonId: string,
  outputId: string,
) {
  requireRole(context, "EDITOR");
  return db.$transaction(async (tx) => {
    const comparison = await tx.modelComparison.findFirst({
      where: { id: comparisonId, workspaceId: context.workspaceId },
      include: { outputs: true },
    });
    if (!comparison)
      throw new ApiError(404, "COMPARISON_NOT_FOUND", "The model comparison was not found.");
    const output = comparison.outputs.find(
      (item) => item.id === outputId && item.status === "COMPLETED",
    );
    if (!output)
      throw new ApiError(
        404,
        "COMPARISON_OUTPUT_NOT_FOUND",
        "The comparison output was not found.",
      );
    if (comparison.winnerId === output.id) return output;
    const account = await tx.creditAccount.findUnique({
      where: { workspaceId: context.workspaceId },
    });
    if (!account || account.balance - account.reserved < 1)
      throw new ApiError(
        402,
        "INSUFFICIENT_CREDITS",
        "At least one credit is required to commit a comparison output.",
      );
    await tx.creditAccount.update({
      where: { workspaceId: context.workspaceId },
      data: { balance: { decrement: 1 } },
    });
    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        kind: "CONSUME",
        amount: -1,
        reason: `Committed model comparison ${comparison.id}`,
        idempotencyKey: `comparison:${comparison.id}:commit:${output.id}`,
        metadata: json({ outputId }),
      },
    });
    await tx.modelComparison.update({
      where: { id: comparison.id },
      data: { winnerId: output.id },
    });
    return output;
  });
}

function productFacts(value: unknown) {
  const facts = object(value);
  return Object.entries(facts)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("; ");
}

export async function createUGCProject(
  context: RequestContext,
  input: {
    name: string;
    campaignId?: string;
    productId?: string;
    sourceAssetIds: string[];
    audience: string;
    problem: string;
    proof: string;
    offer: string;
    forbiddenClaims?: string[];
    language?: string;
    channel?: string;
    durationSec?: number;
    persona?: string;
    consentSubject?: string;
  },
) {
  requireRole(context, "EDITOR");
  const name = text(input.name);
  if (!name) throw new ApiError(400, "UGC_NAME_REQUIRED", "A UGC project name is required.");
  const campaign = input.campaignId
    ? await db.campaign.findFirst({
        where: { id: input.campaignId, workspaceId: context.workspaceId },
        select: { id: true },
      })
    : null;
  if (input.campaignId && !campaign)
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The selected campaign was not found.");
  const sourceAssetIds = [...new Set(input.sourceAssetIds.filter(Boolean))];
  const assets = sourceAssetIds.length
    ? await db.asset.findMany({
        where: {
          workspaceId: context.workspaceId,
          id: { in: sourceAssetIds },
          deletedAt: null,
          status: { in: ["IMMUTABLE", "READY", "DERIVED"] },
        },
        select: { id: true, mimeType: true },
      })
    : [];
  if (!sourceAssetIds.length || assets.length !== sourceAssetIds.length)
    throw new ApiError(
      409,
      "UGC_SOURCE_REQUIRED",
      "UGC needs verified source footage or product assets.",
    );
  const product = input.productId
    ? await db.product.findFirst({
        where: { id: input.productId, workspaceId: context.workspaceId, deletedAt: null },
      })
    : null;
  if (input.productId && !product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "The selected product was not found.");
  if (input.consentSubject) {
    const consent = await db.consentRecord.findFirst({
      where: {
        workspaceId: context.workspaceId,
        subject: input.consentSubject,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!consent)
      throw new ApiError(
        409,
        "CONSENT_REQUIRED",
        "An active face/voice consent record is required for this UGC subject.",
      );
  }
  const duration = Math.min(Math.max(Math.floor(input.durationSec ?? 30), 6), 180);
  const facts = product
    ? productFacts(product.facts)
    : "verified product facts must be linked before approval";
  const hooks = [
    `${product?.title ?? "This product"} made for ${input.audience}`,
    `Still dealing with ${input.problem}?`,
    `Here is the proof behind ${product?.title ?? "the product"}.`,
  ];
  const plan = {
    schemaVersion: 1,
    objective: {
      audience: input.audience,
      problem: input.problem,
      proof: input.proof,
      offer: input.offer,
      forbiddenClaims: input.forbiddenClaims ?? [],
      language: input.language ?? "English",
      channel: input.channel ?? "short-form",
      durationSec: duration,
      persona: input.persona ?? "founder",
    },
    hooks,
    facts,
    disclosure: "AI-assisted edit; real footage and product facts are retained.",
    sourceAssetIds,
  };
  const project = await db.uGCProject.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId: campaign?.id,
      createdBy: context.userId,
      name,
      status: "PLANNED",
      brief: json({ ...input, campaignId: campaign?.id ?? null, sourceAssetIds }),
      plan: json(plan),
      disclosure: json({ required: true, text: plan.disclosure }),
      shots: {
        create: hooks.map((hook, index) => ({
          workspaceId: context.workspaceId,
          sequence: index + 1,
          kind: index === 0 ? "HOOK" : index === 1 ? "PROOF" : "CTA",
          script: `${hook} ${index === 1 ? input.proof : index === 2 ? input.offer : ""}`.trim(),
          durationSec: Math.max(2, Math.round(duration / 3)),
          sourceAssetId: sourceAssetIds[index % sourceAssetIds.length],
          consentSubject: input.consentSubject,
          status: "PLANNED",
          metadata: json({ facts, forbiddenClaims: input.forbiddenClaims ?? [] }),
        })),
      },
    },
    include: { shots: { orderBy: { sequence: "asc" } } },
  });
  if (campaign?.id)
    await db.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId: campaign.id,
        kind: "UGC_PROJECT_CREATED",
        message: "Proof-first UGC project created with campaign source and consent requirements.",
        actorId: context.userId,
        payload: json({
          projectId: project.id,
          sourceAssetIds,
          consentSubject: input.consentSubject ?? null,
        }),
      },
    });
  return project;
}

export async function getUGCProject(context: RequestContext, projectId: string) {
  requireRole(context, "VIEWER");
  const project = await db.uGCProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    include: { shots: { orderBy: { sequence: "asc" } } },
  });
  if (!project) throw new ApiError(404, "UGC_PROJECT_NOT_FOUND", "The UGC project was not found.");
  return project;
}

function analysisHasData(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  const item = object(value);
  return Boolean(
    item.status && !["UNAVAILABLE", "REQUIRES_PROVIDER", "PENDING"].includes(String(item.status)),
  );
}

export async function analyzeUGCProject(
  context: RequestContext,
  projectId: string,
  input?: { sourceAssetIds?: string[] },
) {
  requireRole(context, "EDITOR");
  const project = await getUGCProject(context, projectId);
  const brief = object(project.brief);
  const sourceAssetIds = [
    ...new Set((input?.sourceAssetIds ?? strings(brief.sourceAssetIds)).filter(Boolean)),
  ];
  if (!sourceAssetIds.length)
    throw new ApiError(409, "UGC_SOURCE_REQUIRED", "UGC analysis needs at least one source asset.");
  const analysis = await Promise.all(
    sourceAssetIds.map((assetId) => analyzeMediaAsset(context, assetId)),
  );
  const capabilities = {
    transcription: analysis.some((item) => analysisHasData(item.transcript)),
    scenes: analysis.some((item) => analysisHasData(item.scenes)),
    speakers: analysis.some((item) => analysisHasData(item.speakers)),
    faces: analysis.some((item) => analysisHasData(item.faces)),
  };
  const missing = Object.entries(capabilities)
    .filter(([, available]) => !available)
    .map(([name]) => name);
  const warnings = analysis.flatMap((item) => strings(item.warnings));
  const sceneCuts = analysis.flatMap((item) => {
    const scenes = Array.isArray(item.scenes) ? item.scenes : [];
    return scenes
      .map((scene) => object(scene))
      .filter((scene) => Object.keys(scene).length > 0)
      .slice(0, 8)
      .map((scene, index) => {
        const rawStart = Number(scene.startMs ?? scene.start ?? index * 4000);
        const rawEnd = Number(scene.endMs ?? scene.end ?? (index + 1) * 4000);
        return {
          sourceAssetId: item.assetId,
          startMs: Math.max(0, Math.floor(rawStart * (rawStart < 1000 ? 1000 : 1))),
          endMs: Math.max(0, Math.floor(rawEnd * (rawEnd < 1000 ? 1000 : 1))),
          label: text(scene.label ?? scene.description ?? scene.text),
        };
      });
  });
  const plan = {
    ...object(project.plan),
    sourceAssetIds,
    analysisIds: analysis.map((item) => item.id),
    pipeline: {
      realFootageFirst: true,
      transcription: capabilities.transcription,
      shotPlanning: capabilities.scenes,
      speakerDetection: capabilities.speakers,
      faceDetection: capabilities.faces,
      bRoll: Boolean(process.env.MEDIA_RENDERER_URL),
      lipSync: Boolean(process.env.MEDIA_RENDERER_URL),
      missingCapabilities: missing,
      sceneCuts,
    },
    warnings: [...new Set(warnings)],
  };
  const updated = await db.uGCProject.update({
    where: { id: project.id },
    data: {
      status: missing.length ? "ANALYSIS_PARTIAL" : "ANALYSIS_READY",
      plan: json(plan),
      brief: json({ ...brief, sourceAssetIds }),
    },
    include: { shots: { orderBy: { sequence: "asc" } } },
  });
  return { project: updated, analysis, capabilities, missingCapabilities: missing };
}

export async function planUGCShots(context: RequestContext, projectId: string) {
  requireRole(context, "EDITOR");
  const analyzed = await analyzeUGCProject(context, projectId);
  const project = analyzed.project;
  const plan = object(project.plan);
  const sceneCuts = Array.isArray(object(plan.pipeline).sceneCuts)
    ? (object(plan.pipeline).sceneCuts as Array<Record<string, unknown>>)
    : [];
  const objective = object(plan.objective);
  const existingLocked = project.shots.filter((shot) => shot.status === "LOCKED");
  const generated = (
    sceneCuts.length
      ? sceneCuts
      : [
          { startMs: 0, endMs: 4000, label: "Direct-to-camera hook" },
          { startMs: 4000, endMs: 9000, label: "Product proof" },
          { startMs: 9000, endMs: 14000, label: "Offer and CTA" },
        ]
  )
    .slice(0, 8)
    .map((cut, index) => {
      const kind = index === 0 ? "HOOK" : index === 1 ? "PROOF" : index === 2 ? "CTA" : "B_ROLL";
      const startMs = Math.max(0, Number(cut.startMs ?? index * 4000));
      const endMs = Math.max(startMs + 1000, Number(cut.endMs ?? startMs + 4000));
      const purpose =
        kind === "HOOK"
          ? `Hook for ${text(objective.audience) || "the intended audience"}`
          : kind === "PROOF"
            ? text(objective.proof) || "Show real product proof"
            : kind === "CTA"
              ? text(objective.offer) || "Close with the approved offer"
              : text(cut.label) || "Use as supporting b-roll";
      return {
        sequence: index + 1,
        kind,
        script: purpose,
        durationSec: Math.max(1, Math.ceil((endMs - startMs) / 1000)),
        startMs: Math.floor(startMs),
        endMs: Math.floor(endMs),
        sourceAssetId: typeof cut.sourceAssetId === "string" ? cut.sourceAssetId : undefined,
        consentSubject: text(object(project.brief).consentSubject) || undefined,
        metadata: json({
          generatedFromAnalysis: true,
          label: cut.label ?? null,
          preserveUnrelatedCuts: true,
        }),
      };
    });
  await db.$transaction(async (tx) => {
    await tx.uGCShot.deleteMany({
      where: { projectId: project.id, workspaceId: context.workspaceId, status: "PLANNED" },
    });
    const reservedSequences = new Set(existingLocked.map((shot) => shot.sequence));
    for (const shot of generated) {
      if (reservedSequences.has(shot.sequence)) continue;
      await tx.uGCShot.create({
        data: { workspaceId: context.workspaceId, projectId: project.id, ...shot },
      });
    }
    await tx.uGCProject.update({
      where: { id: project.id },
      data: {
        status: analyzed.missingCapabilities.length ? "ANALYSIS_PARTIAL" : "SHOT_PLAN_READY",
      },
    });
  });
  return getUGCProject(context, project.id);
}

export async function updateUGCShot(
  context: RequestContext,
  projectId: string,
  shotId: string,
  input: { script?: string; startMs?: number; endMs?: number; status?: string },
) {
  requireRole(context, "EDITOR");
  const shot = await db.uGCShot.findFirst({
    where: { id: shotId, projectId, workspaceId: context.workspaceId },
  });
  if (!shot) throw new ApiError(404, "UGC_SHOT_NOT_FOUND", "The UGC shot was not found.");
  const startMs =
    input.startMs === undefined ? shot.startMs : Math.max(0, Math.floor(input.startMs));
  const endMs = input.endMs === undefined ? shot.endMs : Math.max(0, Math.floor(input.endMs));
  if (startMs !== null && endMs !== null && endMs <= startMs)
    throw new ApiError(400, "INVALID_SHOT_TIMECODE", "Shot end time must be after its start time.");
  return db.uGCShot.update({
    where: { id: shot.id },
    data: {
      script: input.script?.trim() || undefined,
      startMs,
      endMs,
      status: input.status === "LOCKED" ? "LOCKED" : "EDITED",
      metadata: json({
        ...object(shot.metadata),
        preserveUnrelatedCuts: true,
        editedAt: new Date().toISOString(),
      }),
    },
  });
}

function buildUGCQualityScores(input: {
  project: { shots: Array<{ status: string; script: string }> };
  sourceAssetIds: string[];
  captions: string[];
  outputAssetIds: string[];
  consentSubject?: string;
  syntheticAvatar: boolean;
  missingCapabilities: string[];
  disclosure: Record<string, unknown>;
}) {
  const shotsLocked =
    input.project.shots.length > 0 && input.project.shots.every((shot) => shot.status === "LOCKED");
  const captionsReady =
    input.captions.length >= input.project.shots.length &&
    input.captions.every((caption) => caption.trim().length > 0);
  const disclosureReady = Boolean(
    input.disclosure.required !== false && text(input.disclosure.text),
  );
  const likenessRightsReady = !input.syntheticAvatar || Boolean(input.consentSubject);
  const analysisReady = input.missingCapabilities.length === 0;
  const outputReady = input.outputAssetIds.length > 0;
  const verdict = (passed: boolean, warning = false, repair?: string) => ({
    verdict: passed ? "pass" : warning ? "warn" : "critical",
    ...(repair ? { repair } : {}),
  });
  return {
    "Product / identity truth": verdict(
      input.sourceAssetIds.length > 0,
      false,
      "Attach verified source footage and product proof.",
    ),
    "Brand rules & typography": verdict(true),
    "Message / claim correctness": verdict(
      captionsReady,
      false,
      "Complete every shot caption from approved campaign copy.",
    ),
    "Composition & platform fit": verdict(
      shotsLocked,
      false,
      "Lock every planned shot before rendering.",
    ),
    "Temporal / audio quality": analysisReady
      ? verdict(outputReady, false, "A rendered output is required for temporal QA.")
      : verdict(
          false,
          true,
          `Media analysis is incomplete: ${input.missingCapabilities.join(", ")}.`,
        ),
    "Distinctiveness / authenticity": verdict(true),
    "Technical export / rights":
      likenessRightsReady && disclosureReady
        ? verdict(outputReady, false, "A rendered output is required for export evidence.")
        : verdict(
            false,
            false,
            "Verify likeness consent and record the required disclosure before export.",
          ),
  };
}

async function attachUGCOutputsToReview(input: {
  context: RequestContext;
  project: Awaited<ReturnType<typeof getUGCProject>>;
  outputAssetIds: string[];
  analyzed: Awaited<ReturnType<typeof analyzeUGCProject>>;
  editPlan: Record<string, unknown>;
}) {
  if (!input.project.campaignId)
    throw new ApiError(
      409,
      "UGC_CAMPAIGN_REQUIRED",
      "UGC production must be attached to a campaign before review artifacts can be created.",
    );
  const campaignId = input.project.campaignId;
  const run = await db.workflowRun.findFirst({
    where: {
      workspaceId: input.context.workspaceId,
      campaignId,
      state: { notIn: [RunState.CANCELLED, RunState.TERMINAL_FAILURE] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (!run)
    throw new ApiError(
      409,
      "UGC_REVIEW_CONTEXT_REQUIRED",
      "Create a campaign creative run before rendering UGC so the output can enter the approval queue.",
    );
  const assets = await db.asset.findMany({
    where: {
      workspaceId: input.context.workspaceId,
      id: { in: input.outputAssetIds },
      deletedAt: null,
    },
    select: { id: true, mimeType: true, name: true, metadata: true },
  });
  if (assets.length !== input.outputAssetIds.length)
    throw new ApiError(
      409,
      "UGC_OUTPUT_NOT_READY",
      "The renderer returned an output that is not available as a workspace asset.",
    );
  const brief = object(input.project.brief);
  const disclosure = object(input.project.disclosure);
  const captions = Array.isArray(input.editPlan.captions)
    ? input.editPlan.captions.filter((value): value is string => typeof value === "string")
    : [];
  const syntheticAvatar = input.editPlan.syntheticAvatar === true;
  const consentSubject = text(brief.consentSubject) || undefined;
  const qualityScores = buildUGCQualityScores({
    project: input.project,
    sourceAssetIds: strings(input.editPlan.sourceAssetIds),
    captions,
    outputAssetIds: input.outputAssetIds,
    consentSubject,
    syntheticAvatar,
    missingCapabilities: input.analyzed.missingCapabilities,
    disclosure,
  });
  const evidence = {
    serverComputed: true,
    pipeline: "real_footage_first",
    projectId: input.project.id,
    campaignId,
    sourceAssetIds: strings(input.editPlan.sourceAssetIds),
    analysisIds: input.analyzed.analysis.map((item) => item.id),
    capabilities: input.analyzed.capabilities,
    disclosure,
    consentSubject: consentSubject ?? null,
    syntheticAvatar,
    editPlan: input.editPlan,
  };
  const rows = await db.$transaction(async (tx) => {
    const existing = await tx.outputAsset.findMany({
      where: { workspaceId: input.context.workspaceId, runId: run.id, campaignId },
      select: { id: true, assetId: true, metadata: true },
    });
    const created = [] as Array<Record<string, unknown>>;
    for (const [index, asset] of assets.entries()) {
      const matching = existing.find(
        (row) => row.assetId === asset.id && object(row.metadata).ugcProjectId === input.project.id,
      );
      const data = {
        workspaceId: input.context.workspaceId,
        runId: run.id,
        campaignId,
        assetId: asset.id,
        name: `${input.project.name} · version ${index + 1}`,
        format: asset.mimeType,
        locale:
          text(
            object(input.project.plan).objective &&
              object(object(input.project.plan).objective).language,
          ) || null,
        status: OutputStatus.DRAFT,
        qualityScores: json(qualityScores),
        metadata: json({
          ...evidence,
          ugcProjectId: input.project.id,
          sourceAsset: asset.name,
          sourceMetadata: object(asset.metadata),
          outputIndex: index,
        }),
      };
      const row = matching
        ? await tx.outputAsset.update({
            where: { id: matching.id },
            data,
            select: { id: true, assetId: true, status: true, qualityScores: true, metadata: true },
          })
        : await tx.outputAsset.create({
            data,
            select: { id: true, assetId: true, status: true, qualityScores: true, metadata: true },
          });
      created.push(row as Record<string, unknown>);
    }
    const review = await tx.reviewTask.upsert({
      where: { runId: run.id },
      update: {
        workspaceId: input.context.workspaceId,
        campaignId,
        title: `${input.project.name} · UGC approval`,
        kind: "ugc",
        status: ReviewStatus.PENDING,
        decision: Prisma.JsonNull,
        verdicts: json(qualityScores),
      },
      create: {
        workspaceId: input.context.workspaceId,
        campaignId,
        runId: run.id,
        title: `${input.project.name} · UGC approval`,
        kind: "ugc",
        requiredRoles: json(["EDITOR", "REVIEWER"]),
        verdicts: json(qualityScores),
      },
    });
    await tx.workflowRun.update({
      where: { id: run.id },
      data: {
        state: RunState.AWAITING_REVIEW,
        warnings: json(
          Object.values(qualityScores).some((item) => item.verdict === "critical")
            ? ["UGC quality evidence contains a blocking result."]
            : [],
        ),
      },
    });
    await tx.campaignEvent.create({
      data: {
        workspaceId: input.context.workspaceId,
        campaignId,
        kind: "UGC_REVIEW_REQUESTED",
        message:
          "UGC outputs were attached to the campaign review queue with server-computed QA evidence.",
        actorId: input.context.userId,
        payload: json({
          projectId: input.project.id,
          runId: run.id,
          reviewTaskId: review.id,
          outputAssetIds: created.map((row) => row.id),
        }),
      },
    });
    return { review, outputs: created };
  });
  return { runId: run.id, reviewTaskId: rows.review.id, outputs: rows.outputs, qualityScores };
}

export async function renderUGCProject(
  context: RequestContext,
  projectId: string,
  input: {
    sourceAssetIds: string[];
    captions?: string[];
    bRollAssetIds?: string[];
    musicAssetId?: string;
    voiceAssetId?: string;
    coverShotId?: string;
    outputDurationsSec?: number[];
    consentSubject?: string;
    syntheticAvatar?: boolean;
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const analyzed = await analyzeUGCProject(context, projectId, {
    sourceAssetIds: input.sourceAssetIds,
  });
  const project = analyzed.project;
  if (requiresProductionAuthentication() && analyzed.missingCapabilities.length)
    throw new ApiError(
      409,
      "UGC_ANALYSIS_INCOMPLETE",
      "A configured media-analysis provider must return transcription, scenes, speakers, and faces before production UGC rendering.",
      { missingCapabilities: analyzed.missingCapabilities },
    );
  const subject = input.consentSubject ?? text(object(project.brief).consentSubject);
  if (subject) {
    const consent = await db.consentRecord.findFirst({
      where: {
        workspaceId: context.workspaceId,
        subject,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!consent)
      throw new ApiError(
        409,
        "CONSENT_REQUIRED",
        "An active consent record is required before UGC rendering.",
      );
  }
  if (input.syntheticAvatar && !subject)
    throw new ApiError(
      409,
      "CONSENT_REQUIRED",
      "Synthetic avatar rendering requires a consented subject or licensed avatar record.",
    );
  const plannedSources = project.shots
    .map((shot) => shot.sourceAssetId)
    .filter((assetId): assetId is string => Boolean(assetId));
  const sourceFootage = [...new Set(plannedSources.length ? plannedSources : input.sourceAssetIds)];
  const bRollAssetIds = [...new Set(input.bRollAssetIds ?? [])];
  const bRollAssets = bRollAssetIds.length
    ? await db.asset.findMany({
        where: {
          workspaceId: context.workspaceId,
          id: { in: bRollAssetIds },
          deletedAt: null,
          status: { in: ["IMMUTABLE", "READY", "DERIVED"] },
          mimeType: { startsWith: "video/" },
        },
        select: { id: true },
      })
    : [];
  if (bRollAssets.length !== bRollAssetIds.length)
    throw new ApiError(
      409,
      "UGC_BROLL_NOT_READY",
      "Every B-roll asset must be a verified workspace video asset.",
    );
  const sources = [...new Set([...sourceFootage, ...bRollAssetIds])];
  const requestedDurations = [...new Set(input.outputDurationsSec ?? [15, 30, 45])]
    .map((duration) => Math.floor(Number(duration)))
    .filter((duration) => Number.isFinite(duration) && duration >= 6 && duration <= 180)
    .slice(0, 3);
  const editPlan = {
    schemaVersion: 1,
    sourceOfTruth: "real_footage_first",
    sourceAssetIds: sources,
    shots: project.shots.map((shot) => ({
      id: shot.id,
      kind: shot.kind,
      sourceAssetId: shot.sourceAssetId,
      startMs: shot.startMs,
      endMs: shot.endMs,
      script: shot.script,
      preserveUnrelatedCuts: true,
    })),
    bRollAssetIds,
    coverShotId: input.coverShotId ?? project.shots[0]?.id ?? null,
    captions: input.captions ?? project.shots.map((shot) => shot.script),
    outputDurationsSec: requestedDurations.length ? requestedDurations : [30],
    disclosure: object(project.disclosure),
  };
  const merge =
    sources.length > 1
      ? await createMediaJob(context, {
          kind: "video.merge",
          sourceAssetIds: sources,
          config: {
            projectId,
            editPlan,
            durationSeconds: Math.max(...editPlan.outputDurationsSec),
          },
          idempotencyKey: `${input.idempotencyKey}:merge`,
        })
      : null;
  const mergedSources = merge ? strings(merge.job.outputAssetIds) : sources;
  const lipSync = input.syntheticAvatar
    ? await createMediaJob(context, {
        kind: "video.lipsync",
        sourceAssetIds: mergedSources,
        config: {
          projectId,
          consentSubject: subject,
          voiceAssetId: input.voiceAssetId,
          editPlan,
          disclosure: object(project.disclosure),
          analysisIds: analyzed.analysis.map((item) => item.id),
        },
        idempotencyKey: `${input.idempotencyKey}:lipsync`,
      })
    : null;
  const captionSources = lipSync ? strings(lipSync.job.outputAssetIds) : mergedSources;
  const result = await createMediaJob(context, {
    kind: "captions.render",
    sourceAssetIds: captionSources,
    config: {
      captions: editPlan.captions,
      disclosure: object(project.disclosure),
      projectId,
      analysisIds: analyzed.analysis.map((item) => item.id),
      pipeline: object(project.plan).pipeline,
      syntheticAvatar: input.syntheticAvatar === true,
      editPlan,
    },
    idempotencyKey: input.idempotencyKey,
  });
  const captionAssetIds = strings(result.job.outputAssetIds);
  const audioSources = [
    ...captionAssetIds,
    ...(input.musicAssetId ? [input.musicAssetId] : []),
    ...(input.voiceAssetId ? [input.voiceAssetId] : []),
  ];
  const mixed =
    input.musicAssetId || input.voiceAssetId
      ? await createMediaJob(context, {
          kind: "audio.mix",
          sourceAssetIds: audioSources,
          config: {
            projectId,
            editPlan,
            ducking: { voiceOverMusicDb: -14, preserveDialogue: true },
            loudnessTargetLufs: -14,
          },
          idempotencyKey: `${input.idempotencyKey}:audio-mix`,
        })
      : null;
  const outputIds = mixed ? strings(mixed.job.outputAssetIds) : captionAssetIds;
  await Promise.all(outputIds.map((assetId) => runAssetGate(context, assetId)));
  const reviewArtifacts = await attachUGCOutputsToReview({
    context,
    project,
    outputAssetIds: outputIds,
    analyzed,
    editPlan: { ...editPlan, syntheticAvatar: input.syntheticAvatar === true },
  });
  await db.uGCProject.update({
    where: { id: project.id },
    data: { status: "RENDERED", renderedAssetIds: json(outputIds) },
  });
  const campaignId = project.campaignId;
  if (campaignId)
    await db.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        kind: "UGC_RENDERED",
        message:
          "UGC output rendered from verified footage and attached to the campaign evidence trail.",
        actorId: context.userId,
        payload: json({
          projectId: project.id,
          outputAssetIds: outputIds,
          capabilities: analyzed.capabilities,
        }),
      },
    });
  return {
    ...result,
    lipSync: lipSync?.job ?? null,
    audioMix: mixed?.job ?? null,
    projectId,
    editPlan,
    analysis: analyzed.analysis,
    capabilities: analyzed.capabilities,
    reviewArtifacts,
  };
}

export async function trainCustomModel(
  context: RequestContext,
  projectId: string,
  input: { datasetId: string; idempotencyKey: string },
) {
  requireRole(context, "ADMIN");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId, status: { not: "DELETED" } },
  });
  const dataset = await db.customModelDataset.findFirst({
    where: { id: input.datasetId, projectId, workspaceId: context.workspaceId, status: "APPROVED" },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  if (!dataset)
    throw new ApiError(
      409,
      "MODEL_DATASET_NOT_READY",
      "An approved custom-model dataset is required.",
    );
  const existing = await db.customModelTrainingJob.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return { job: existing, deduplicated: true };
  const endpoint = process.env.CUSTOM_MODEL_TRAIN_URL;
  if (!endpoint && requiresProductionAuthentication())
    throw new ApiError(
      503,
      "MODEL_TRAINING_NOT_CONFIGURED",
      "CUSTOM_MODEL_TRAIN_URL must be configured before production training can start.",
    );
  const job = await db.customModelTrainingJob.create({
    data: {
      workspaceId: context.workspaceId,
      projectId,
      datasetId: dataset.id,
      provider: endpoint ? project.provider : "local-dataset-preparation",
      status: endpoint ? "SUBMITTED" : "PREPARATION_ONLY",
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (!endpoint)
    return {
      job,
      deduplicated: false,
      warning:
        "Local mode prepared a rights-checked training job manifest; it does not claim to train a model.",
    };
  let body: Record<string, unknown>;
  try {
    const response = await requestProvider<unknown>({
      provider: "custom-model-training",
      endpoint,
      headers: process.env.CUSTOM_MODEL_TRAIN_API_KEY
        ? { authorization: `Bearer ${process.env.CUSTOM_MODEL_TRAIN_API_KEY}` }
        : undefined,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 120_000,
      body: {
        jobId: job.id,
        workspaceId: context.workspaceId,
        projectId,
        datasetId: dataset.id,
        assetIds: dataset.assetIds,
        datasetHash: dataset.hash,
        purpose: project.purpose,
      },
    });
    body = object(response.body);
  } catch (error) {
    await db.customModelTrainingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: json({
          message: error instanceof Error ? error.message : "Training provider failed.",
        }),
      },
    });
    throw providerApiError(
      error,
      "MODEL_TRAINING_PROVIDER_FAILED",
      "The custom-model provider failed.",
    );
  }
  return {
    job: await db.customModelTrainingJob.update({
      where: { id: job.id },
      data: {
        status: String(body.status ?? "RUNNING"),
        externalJobId: text(body.jobId || body.id) || undefined,
        modelVersion: text(body.modelVersion) || undefined,
        progress: Number(body.progress) || 0,
        metrics: body.metrics ? json(body.metrics) : undefined,
      },
    }),
    deduplicated: false,
  };
}

export async function getCustomModelTrainingJobs(context: RequestContext, projectId: string) {
  requireRole(context, "VIEWER");
  return db.customModelTrainingJob.findMany({
    where: { workspaceId: context.workspaceId, projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getCustomModelTrainingJob(
  context: RequestContext,
  projectId: string,
  jobId: string,
) {
  requireRole(context, "VIEWER");
  const job = await db.customModelTrainingJob.findFirst({
    where: { id: jobId, projectId, workspaceId: context.workspaceId },
  });
  if (!job)
    throw new ApiError(
      404,
      "MODEL_TRAINING_JOB_NOT_FOUND",
      "The custom-model training job was not found.",
    );
  if (!job.externalJobId || ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
  const endpoint = process.env.CUSTOM_MODEL_TRAIN_STATUS_URL;
  if (!endpoint) {
    if (requiresProductionAuthentication())
      throw new ApiError(
        503,
        "MODEL_TRAINING_STATUS_NOT_CONFIGURED",
        "CUSTOM_MODEL_TRAIN_STATUS_URL must be configured to track production training jobs.",
      );
    return job;
  }
  try {
    const response = await requestProvider<unknown>({
      provider: "custom-model-training-status",
      endpoint,
      body: { workspaceId: context.workspaceId, projectId, jobId: job.externalJobId },
      idempotencyKey: `training-status:${job.id}:${job.externalJobId}`,
      timeoutMs: 30_000,
    });
    const body = object(response.body);
    const status = text(body.status, job.status).toUpperCase();
    return db.customModelTrainingJob.update({
      where: { id: job.id },
      data: {
        status,
        progress: Math.min(100, Math.max(0, Number(body.progress) || job.progress)),
        modelVersion: text(body.modelVersion) || undefined,
        metrics: body.metrics ? json(body.metrics) : undefined,
        error: body.error ? json(body.error) : undefined,
      },
    });
  } catch (error) {
    throw providerApiError(
      error,
      "MODEL_TRAINING_STATUS_FAILED",
      "The custom-model training status provider failed.",
    );
  }
}

export async function cancelCustomModelTraining(context: RequestContext, jobId: string) {
  requireRole(context, "ADMIN");
  const job = await db.customModelTrainingJob.findFirst({
    where: { id: jobId, workspaceId: context.workspaceId },
  });
  if (!job)
    throw new ApiError(
      404,
      "MODEL_TRAINING_JOB_NOT_FOUND",
      "The custom-model training job was not found.",
    );
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
  const endpoint = process.env.CUSTOM_MODEL_TRAIN_CANCEL_URL;
  if (endpoint && job.externalJobId) {
    try {
      await requestProvider({
        provider: "custom-model-training-cancel",
        endpoint,
        body: { workspaceId: context.workspaceId, jobId: job.externalJobId },
        idempotencyKey: `training-cancel:${job.id}`,
      });
    } catch (error) {
      throw providerApiError(
        error,
        "MODEL_TRAINING_CANCEL_FAILED",
        "The training provider rejected the cancellation request.",
      );
    }
  }
  return db.customModelTrainingJob.update({ where: { id: job.id }, data: { status: "CANCELLED" } });
}
