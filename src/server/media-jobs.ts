import { LedgerKind, Prisma, ReservationStatus } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { isWorkspaceObjectKey, verifyUploadedObject } from "./storage";
import { renderLocally } from "./local-renderer";
import { providerApiError, requestProvider } from "./provider-http";
import { enforceWorkspaceSpendCap } from "./spending";
import { runAssetGate } from "./asset-intelligence";

type RenderOutput = {
  assetId?: unknown;
  name?: unknown;
  mimeType?: unknown;
  objectKey?: unknown;
  contentHash?: unknown;
  width?: unknown;
  height?: unknown;
  metadata?: unknown;
};

type CompositionLayer = {
  id: string;
  kind: string;
  text: string;
  x: number;
  y: number;
};

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function rendererEndpoint() {
  return process.env.MEDIA_RENDERER_URL;
}

function estimateUnits(kind: string, sourceCount: number) {
  const base =
    {
      "composition.render": 2,
      "video.merge": 4,
      "captions.render": 1,
      "audio.mix": 3,
      upscale: 2,
      "video.lipsync": 8,
    }[kind] ?? 2;
  return Math.max(1, base + Math.max(0, sourceCount - 1));
}

function outputList(value: unknown): RenderOutput[] {
  return Array.isArray(value)
    ? value.filter((item): item is RenderOutput =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function slotRule(schema: Record<string, unknown>, kind: string) {
  const slots = record(schema.slots);
  return record(slots[kind]);
}

async function validateCompositionConfig(
  context: RequestContext,
  sourceConfig: Record<string, unknown>,
) {
  const templateId =
    typeof sourceConfig.templateId === "string" ? sourceConfig.templateId.trim() : "";
  if (!templateId)
    throw new ApiError(
      400,
      "INVALID_COMPOSITION_TEMPLATE",
      "A composition templateId is required.",
    );
  const layers = sourceConfig.layers;
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > 20)
    throw new ApiError(
      400,
      "INVALID_COMPOSITION_LAYERS",
      "A composition must contain between 1 and 20 layers.",
    );
  const normalizedLayers = layers.map((layer): CompositionLayer => {
    if (!layer || typeof layer !== "object" || Array.isArray(layer))
      throw new ApiError(
        400,
        "INVALID_COMPOSITION_LAYER",
        "Each composition layer must be an object.",
      );
    const candidate = layer as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.kind !== "string" ||
      typeof candidate.text !== "string" ||
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      candidate.x < 0 ||
      candidate.x > 100 ||
      candidate.y < 0 ||
      candidate.y > 100
    )
      throw new ApiError(
        400,
        "INVALID_COMPOSITION_LAYER",
        "Composition layers require id, kind, text, and x/y percentages between 0 and 100.",
      );
    return {
      id: candidate.id.trim(),
      kind: candidate.kind.trim(),
      text: candidate.text.trim(),
      x: candidate.x,
      y: candidate.y,
    };
  });
  if (new Set(normalizedLayers.map((layer) => layer.id)).size !== normalizedLayers.length)
    throw new ApiError(400, "INVALID_COMPOSITION_LAYER", "Composition layer IDs must be unique.");

  const template = await db.templateDefinition.findFirst({
    where: {
      workspaceId: context.workspaceId,
      OR: [{ id: templateId }, { name: templateId }],
    },
  });
  if (!template) {
    if (process.env.NODE_ENV === "production")
      throw new ApiError(
        409,
        "APPROVED_TEMPLATE_REQUIRED",
        "Production composition rendering requires an approved workspace template.",
      );
    return {
      ...sourceConfig,
      layers: normalizedLayers,
      templateStatus: "development-fallback",
      safeArea: { left: 6, top: 6, right: 6, bottom: 6 },
    };
  }
  if (template.status !== "APPROVED")
    throw new ApiError(
      409,
      "TEMPLATE_NOT_APPROVED",
      "Only approved templates may render client assets.",
    );
  const schema = record(template.schema);
  const safeArea = record(schema.safeArea);
  const left = Number(safeArea.left ?? 6);
  const top = Number(safeArea.top ?? 6);
  const right = Number(safeArea.right ?? 6);
  const bottom = Number(safeArea.bottom ?? 6);
  const lockedLayers = strings(template.lockedLayers);
  for (const locked of lockedLayers) {
    if (!normalizedLayers.some((layer) => layer.kind === locked))
      throw new ApiError(
        409,
        "LOCKED_TEMPLATE_LAYER_MISSING",
        `The approved template requires its locked ${locked} layer.`,
      );
  }
  for (const layer of normalizedLayers) {
    if (layer.x < left || layer.x > 100 - right || layer.y < top || layer.y > 100 - bottom)
      throw new ApiError(
        409,
        "COMPOSITION_SAFE_AREA_VIOLATION",
        `${layer.kind} is outside the approved template safe area.`,
      );
    const rule = slotRule(schema, layer.kind);
    const maxChars = Number(rule.maxChars ?? (layer.kind === "headline" ? 72 : 180));
    if (Number.isFinite(maxChars) && layer.text.length > maxChars)
      throw new ApiError(
        409,
        "COMPOSITION_TEXT_OVERFLOW",
        `${layer.kind} exceeds the approved template character limit.`,
      );
    if (rule.editable === false && typeof rule.value === "string" && rule.value !== layer.text)
      throw new ApiError(
        409,
        "LOCKED_TEMPLATE_LAYER_MUTATED",
        `${layer.kind} is locked by the approved template and cannot be changed.`,
      );
  }
  const formats = strings(template.supportedFormats);
  const ratio = typeof sourceConfig.ratio === "string" ? sourceConfig.ratio : "";
  if (formats.length && ratio && !formats.includes(ratio))
    throw new ApiError(
      409,
      "TEMPLATE_FORMAT_UNSUPPORTED",
      `The approved template does not support ${ratio}.`,
    );
  return {
    ...sourceConfig,
    templateId: template.id,
    templateVersion: template.version,
    templateStatus: template.status,
    layers: normalizedLayers,
    lockedLayers,
    safeArea: { left, top, right, bottom },
  };
}

async function releaseReservation(
  workspaceId: string,
  jobId: string,
  reason: string,
  code: string,
) {
  return db.$transaction(async (tx) => {
    const job = await tx.mediaJob.findFirst({
      where: { id: jobId, workspaceId },
      include: { reservation: true },
    });
    if (!job) throw new ApiError(404, "MEDIA_JOB_NOT_FOUND", "The media job was not found.");
    const reservation = job.reservation;
    if (reservation?.status === ReservationStatus.RESERVED) {
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.RELEASED, settledAt: new Date() },
      });
      await tx.creditAccount.update({
        where: { workspaceId },
        data: { reserved: { decrement: reservation.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId,
          reservationId: reservation.id,
          kind: LedgerKind.RELEASE,
          amount: 0,
          reason,
          idempotencyKey: `${jobId}:${reservation.id}:release`,
        },
      });
    }
    return tx.mediaJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: { code, message: reason } },
    });
  });
}

export async function createMediaJob(
  context: RequestContext,
  input: {
    kind: string;
    sourceAssetIds: string[];
    runId?: string;
    config: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const allowed = new Set([
    "composition.render",
    "video.merge",
    "captions.render",
    "audio.mix",
    "upscale",
    "video.lipsync",
  ]);
  if (!allowed.has(input.kind))
    throw new ApiError(
      400,
      "UNSUPPORTED_MEDIA_JOB",
      "The requested media job kind is not supported.",
    );
  const sourceAssetIds = [...new Set(input.sourceAssetIds.filter(Boolean))];
  if (sourceAssetIds.length === 0)
    throw new ApiError(400, "MEDIA_SOURCE_REQUIRED", "At least one source asset is required.");
  const assets = await db.asset.findMany({
    where: { workspaceId: context.workspaceId, id: { in: sourceAssetIds }, deletedAt: null },
    select: { id: true, status: true, mimeType: true, objectKey: true, name: true },
  });
  if (assets.length !== sourceAssetIds.length)
    throw new ApiError(
      404,
      "MEDIA_SOURCE_NOT_FOUND",
      "Every source asset must belong to this workspace.",
    );
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const orderedAssets = sourceAssetIds.map((assetId) => assetsById.get(assetId)!);
  if (assets.some((asset) => asset.status === "UPLOADING" || asset.status === "QUARANTINED"))
    throw new ApiError(
      409,
      "MEDIA_SOURCE_NOT_READY",
      "Every source asset must be verified before processing.",
    );
  await Promise.all(sourceAssetIds.map((assetId) => runAssetGate(context, assetId)));
  if (
    ["video.merge", "video.lipsync", "captions.render"].includes(input.kind) &&
    !assets.some((asset) => asset.mimeType.startsWith("video/"))
  )
    throw new ApiError(
      409,
      "VIDEO_SOURCE_REQUIRED",
      "This media job requires at least one verified video source asset.",
    );
  if (
    input.kind === "audio.mix" &&
    !assets.some(
      (asset) => asset.mimeType.startsWith("audio/") || asset.mimeType.startsWith("video/"),
    )
  )
    throw new ApiError(
      409,
      "AUDIO_SOURCE_REQUIRED",
      "Audio mixing requires a verified audio or video source asset.",
    );
  const config =
    input.kind === "composition.render"
      ? await validateCompositionConfig(context, input.config)
      : input.config;
  if (input.kind === "composition.render") {
    if (!assets.some((asset) => asset.mimeType.startsWith("image/")))
      throw new ApiError(
        409,
        "COMPOSITION_IMAGE_REQUIRED",
        "Deterministic composition requires at least one verified image source asset.",
      );
  }
  if (
    input.runId &&
    !(await db.workflowRun.findFirst({
      where: { id: input.runId, workspaceId: context.workspaceId },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "RUN_NOT_FOUND", "The media job run was not found in this workspace.");
  if (input.kind === "video.lipsync") {
    const consentSubject =
      typeof input.config.consentSubject === "string" ? input.config.consentSubject : "";
    if (!consentSubject)
      throw new ApiError(409, "CONSENT_REQUIRED", "Lip-sync requires a consentSubject.");
    const consent = await db.consentRecord.findFirst({
      where: {
        workspaceId: context.workspaceId,
        subject: consentSubject,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!consent)
      throw new ApiError(
        409,
        "CONSENT_REQUIRED",
        "No active likeness or voice consent exists for this media job.",
      );
  }
  const existing = await db.mediaJob.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { reservation: true },
  });
  if (existing) return { job: existing, deduplicated: true };
  const estimatedUnits = estimateUnits(input.kind, sourceAssetIds.length);
  const job = await db.$transaction(
    async (tx) => {
      const account = await tx.creditAccount.findUnique({
        where: { workspaceId: context.workspaceId },
      });
      if (!account)
        throw new ApiError(
          409,
          "CREDIT_ACCOUNT_NOT_READY",
          "The workspace credit account is not configured.",
        );
      if (estimatedUnits > account.balance - account.reserved)
        throw new ApiError(
          402,
          "INSUFFICIENT_CREDITS",
          `This media job needs ${estimatedUnits} credits.`,
        );
      await enforceWorkspaceSpendCap(context.workspaceId, estimatedUnits, tx);
      const created = await tx.mediaJob.create({
        data: {
          workspaceId: context.workspaceId,
          runId: input.runId,
          createdBy: context.userId,
          kind: input.kind,
          sourceAssetIds: json(sourceAssetIds),
          config: json(config),
          estimatedUnits,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const reservation = await tx.creditReservation.create({
        data: {
          workspaceId: context.workspaceId,
          mediaJobId: created.id,
          runId: input.runId,
          amount: estimatedUnits,
          status: ReservationStatus.RESERVED,
        },
      });
      await tx.creditAccount.update({
        where: { workspaceId: context.workspaceId },
        data: { reserved: { increment: estimatedUnits } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          reservationId: reservation.id,
          runId: input.runId,
          kind: LedgerKind.RESERVE,
          amount: estimatedUnits,
          reason: `Reserved for ${input.kind}`,
          idempotencyKey: `${input.idempotencyKey}:reserve`,
        },
      });
      return tx.mediaJob.findUnique({ where: { id: created.id }, include: { reservation: true } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (!job) throw new ApiError(500, "MEDIA_JOB_NOT_CREATED", "The media job could not be created.");
  const endpoint = rendererEndpoint();
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") {
      const failed = await releaseReservation(
        context.workspaceId,
        job.id,
        "MEDIA_RENDERER_URL must be configured for production media rendering.",
        "MEDIA_RENDERER_NOT_CONFIGURED",
      );
      throw new ApiError(
        503,
        "MEDIA_RENDERER_NOT_CONFIGURED",
        "MEDIA_RENDERER_URL must be configured for production media rendering.",
        { jobId: failed.id },
      );
    }
    try {
      const body = await renderLocally({
        workspaceId: context.workspaceId,
        jobId: job.id,
        kind: input.kind,
        sourceAssets: orderedAssets,
        config,
      });
      const result = await settleMediaJob(context, input, job, body);
      return { job: result, deduplicated: false };
    } catch (error) {
      const failed = await releaseReservation(
        context.workspaceId,
        job.id,
        error instanceof Error ? error.message : "The local media renderer failed.",
        "MEDIA_RENDERER_FAILED",
      );
      throw new ApiError(
        502,
        "MEDIA_RENDERER_FAILED",
        failed.error
          ? String(
              (failed.error as { message?: unknown }).message ?? "The local media renderer failed.",
            )
          : "The local media renderer failed.",
        { jobId: failed.id },
      );
    }
  }
  try {
    const { body } = await requestProvider<Record<string, unknown>>({
      provider: "media-renderer",
      endpoint,
      headers: process.env.MEDIA_RENDERER_API_KEY
        ? { authorization: `Bearer ${process.env.MEDIA_RENDERER_API_KEY}` }
        : undefined,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 300_000,
      body: {
        jobId: job.id,
        kind: input.kind,
        sourceAssetIds,
        config,
        runId: input.runId,
      },
    });
    const outputs = outputList(body.outputs);
    if (outputs.length === 0) throw new Error("Media renderer returned no verified outputs.");
    const result = await settleMediaJob(context, input, job, {
      provider: typeof body.provider === "string" ? body.provider : "configured-renderer",
      actualUnits: typeof body.actualUnits === "number" ? body.actualUnits : job.estimatedUnits,
      outputs,
    });
    return { job: result, deduplicated: false };
  } catch (error) {
    await releaseReservation(
      context.workspaceId,
      job.id,
      error instanceof Error ? error.message : "The media renderer failed.",
      "MEDIA_RENDERER_FAILED",
    );
    if (error instanceof ApiError) throw error;
    throw providerApiError(error, "MEDIA_RENDERER_FAILED", "The media renderer failed.");
  }
}

async function settleMediaJob(
  context: RequestContext,
  input: { kind: string; runId?: string; idempotencyKey: string },
  job: { id: string; estimatedUnits: number },
  body: { provider?: string; actualUnits?: number; outputs: RenderOutput[] },
) {
  return db.$transaction(async (tx) => {
    const assetIds: string[] = [];
    for (const [index, output] of body.outputs.entries()) {
      const assetId =
        typeof output.assetId === "string" ? output.assetId : `${job.id}-asset-${index}`;
      const objectKey = typeof output.objectKey === "string" ? output.objectKey : "";
      const contentHash = typeof output.contentHash === "string" ? output.contentHash : "";
      const mimeType = typeof output.mimeType === "string" ? output.mimeType : "";
      if (!objectKey || !contentHash || !mimeType)
        throw new Error("Media renderer output is missing storage provenance.");
      if (!isWorkspaceObjectKey(context.workspaceId, objectKey))
        throw new Error("Media renderer output object key is outside the workspace namespace.");
      const stored = await verifyUploadedObject({ objectKey });
      const existingAsset = await tx.asset.findUnique({
        where: { id: assetId },
        select: { id: true, workspaceId: true },
      });
      if (existingAsset && existingAsset.workspaceId !== context.workspaceId)
        throw new Error("Media renderer returned a cross-workspace asset.");
      const existingByHash = existingAsset
        ? null
        : await tx.asset.findUnique({
            where: {
              workspaceId_contentHash: {
                workspaceId: context.workspaceId,
                contentHash,
              },
            },
            select: { id: true, workspaceId: true },
          });
      const reusableAsset = existingAsset ?? existingByHash;
      const persistedAsset = await (reusableAsset
        ? tx.asset.update({
            where: { id: reusableAsset.id },
            data: {
              status: "READY",
              name: typeof output.name === "string" ? output.name : `media-${index + 1}`,
              objectKey,
              contentHash,
              mimeType,
              byteSize: stored.byteSize,
              width: typeof output.width === "number" ? output.width : undefined,
              height: typeof output.height === "number" ? output.height : undefined,
              metadata:
                output.metadata && typeof output.metadata === "object"
                  ? json(output.metadata)
                  : undefined,
            },
          })
        : tx.asset.create({
            data: {
              id: assetId,
              workspaceId: context.workspaceId,
              type: "GENERATED",
              status: "READY",
              name: typeof output.name === "string" ? output.name : `media-${index + 1}`,
              objectKey,
              contentHash,
              mimeType,
              byteSize: stored.byteSize,
              width: typeof output.width === "number" ? output.width : undefined,
              height: typeof output.height === "number" ? output.height : undefined,
              metadata:
                output.metadata && typeof output.metadata === "object"
                  ? json(output.metadata)
                  : undefined,
            },
          }));
      const persistedAssetId = persistedAsset.id;
      assetIds.push(persistedAssetId);
      if (input.runId)
        await tx.outputAsset.upsert({
          where: { id: `${job.id}-output-${index}` },
          update: {
            workspaceId: context.workspaceId,
            runId: input.runId,
            assetId: persistedAssetId,
            name: typeof output.name === "string" ? output.name : `media-${index + 1}`,
            format: mimeType.split("/")[1] ?? "bin",
            width: typeof output.width === "number" ? output.width : undefined,
            height: typeof output.height === "number" ? output.height : undefined,
            status: "DRAFT",
            metadata: {
              ...(output.metadata && typeof output.metadata === "object" ? output.metadata : {}),
              mediaJobId: job.id,
              aiEdited: true,
            },
          },
          create: {
            id: `${job.id}-output-${index}`,
            workspaceId: context.workspaceId,
            runId: input.runId,
            assetId: persistedAssetId,
            name: typeof output.name === "string" ? output.name : `media-${index + 1}`,
            format: mimeType.split("/")[1] ?? "bin",
            width: typeof output.width === "number" ? output.width : undefined,
            height: typeof output.height === "number" ? output.height : undefined,
            status: "DRAFT",
            metadata: {
              ...(output.metadata && typeof output.metadata === "object" ? output.metadata : {}),
              mediaJobId: job.id,
              aiEdited: true,
            },
          },
        });
    }
    const actualUnits = Math.min(
      job.estimatedUnits,
      typeof body.actualUnits === "number"
        ? Math.max(0, Math.floor(body.actualUnits))
        : job.estimatedUnits,
    );
    const reservation = await tx.creditReservation.findUnique({ where: { mediaJobId: job.id } });
    if (reservation?.status === ReservationStatus.RESERVED) {
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.SETTLED, settledAt: new Date() },
      });
      await tx.creditAccount.update({
        where: { workspaceId: context.workspaceId },
        data: {
          balance: { decrement: actualUnits },
          reserved: { decrement: reservation.amount },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          reservationId: reservation.id,
          runId: input.runId,
          kind: LedgerKind.CONSUME,
          amount: -actualUnits,
          reason: "Settled after media renderer completion",
          idempotencyKey: `${job.id}:${reservation.id}:consume`,
        },
      });
      if (actualUnits < reservation.amount)
        await tx.ledgerEntry.create({
          data: {
            workspaceId: context.workspaceId,
            reservationId: reservation.id,
            runId: input.runId,
            kind: LedgerKind.RELEASE,
            amount: 0,
            reason: "Released unused media reservation units",
            idempotencyKey: `${job.id}:${reservation.id}:release-unused`,
          },
        });
    }
    return tx.mediaJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        outputAssetIds: json(assetIds),
        actualUnits,
        provider: body.provider ?? "deterministic-renderer",
      },
      include: { reservation: true },
    });
  });
}

export async function listMediaJobs(context: RequestContext) {
  requireRole(context, "EDITOR");
  return db.mediaJob.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { reservation: true },
  });
}
