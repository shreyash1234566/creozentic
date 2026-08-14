import { createHash } from "node:crypto";
import {
  Prisma,
  RunState,
  ReviewStatus,
  LedgerKind,
  NodeState,
  OutputStatus,
  ReservationStatus,
  type PrismaClient,
} from "@prisma/client";
import { quoteProductLock, type ProductLockBrief, type QualityMode } from "../domain";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { createDownloadUrl } from "./storage";
import { enforceWorkspaceSpendCap } from "./spending";
import { workflowNodePlan, workflowReviewAndExportKeys } from "./workflow-catalog";

type DbClient = Prisma.TransactionClient | PrismaClient;
type RunWithRelations = Prisma.WorkflowRunGetPayload<{
  include: { reviewTask: true; outputs: true; nodes: true };
}>;

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function now() {
  return new Date();
}

function versionNumber(version: string) {
  const match = version.match(/v?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function isTransactionRace(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    ((error as { code?: string }).code === "P2002" ||
      (error as { code?: string }).code === "P2034"),
  );
}

function requestHash(input: { title: string; brief: unknown }) {
  return createHash("sha256")
    .update(JSON.stringify({ title: input.title.trim(), brief: input.brief }))
    .digest("hex");
}

async function addEvent(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    runId?: string;
    eventType: string;
    correlationId: string;
    idempotencyKey: string;
    payload: unknown;
  },
) {
  return tx.outboxEvent.create({
    data: {
      workspaceId: input.workspaceId,
      runId: input.runId,
      eventType: input.eventType,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      payload: json(input.payload),
    },
  });
}

async function addAudit(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId: string;
    correlationId: string;
    idempotencyKey?: string;
    metadata?: unknown;
  },
) {
  return tx.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata === undefined ? undefined : json(input.metadata),
    },
  });
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, "INVALID_BRIEF", `${field} is required.`);
  return value.trim();
}

function requiredCount(value: unknown) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 12)
    throw new ApiError(400, "INVALID_BRIEF", "count must be an integer between 1 and 12.");
  return count;
}

function parseBrief(input: unknown): ProductLockBrief {
  if (!input || typeof input !== "object")
    throw new ApiError(400, "INVALID_BRIEF", "A structured brief is required.");
  const value = input as Record<string, unknown>;
  const mode = value.mode === "creative" ? "creative" : "lock";
  const qualityMode: QualityMode =
    value.qualityMode === "fast" || value.qualityMode === "quality"
      ? value.qualityMode
      : "balanced";
  const outputFormats = Array.isArray(value.outputFormats)
    ? value.outputFormats.filter((format): format is string => typeof format === "string")
    : [];
  if (outputFormats.length === 0)
    throw new ApiError(400, "INVALID_BRIEF", "At least one output format is required.");
  const optionalText = (field: string) =>
    typeof value[field] === "string" && value[field].trim() ? value[field].trim() : undefined;
  return {
    product: requiredText(value.product, "product"),
    sku: requiredText(value.sku, "sku"),
    scene: requiredText(value.scene, "scene"),
    count: requiredCount(value.count),
    mode,
    qualityMode,
    outputFormats,
    audience: requiredText(value.audience, "audience"),
    language: requiredText(value.language, "language"),
    cta: requiredText(value.cta, "cta"),
    headline: optionalText("headline"),
    body: optionalText("body"),
    altText: optionalText("altText"),
    campaignId: optionalText("campaignId"),
    directionId: optionalText("directionId"),
    hashtags: Array.isArray(value.hashtags)
      ? value.hashtags.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

export function quoteBrief(input: unknown) {
  const brief = parseBrief(input);
  const quote = quoteProductLock({
    count: brief.count,
    qualityMode: brief.qualityMode,
    productLock: brief.mode === "lock",
    outputFormats: brief.outputFormats,
  });
  return { brief, quote };
}

async function getWorkspaceBrand(tx: DbClient, workspaceId: string) {
  const brand = await tx.brand.findFirst({
    where: { workspaceId, approvalStatus: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    include: { rules: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!brand)
    throw new ApiError(404, "BRAND_NOT_FOUND", "Create a brand profile before starting a run.");
  return brand;
}

async function getWorkflowVersion(tx: DbClient, workspaceId: string, versionId?: string) {
  const versions = await tx.workflowVersion.findMany({
    where: {
      ...(versionId ? { id: versionId } : {}),
      template: {
        workspaceId,
        category: "product-creative",
        publishedVersion: { not: null },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });
  const version = versions.find(
    (candidate) =>
      candidate.template.publishedVersion !== null &&
      versionNumber(candidate.version) === candidate.template.publishedVersion,
  );
  if (!version)
    throw new ApiError(
      409,
      "WORKFLOW_NOT_READY",
      "No published product-creative workflow is configured for this workspace.",
    );
  return version;
}

export async function createRun(
  context: RequestContext,
  input: {
    title: string;
    brief: unknown;
    idempotencyKey: string;
    workflowVersionId?: string;
    deployedAppId?: string;
  },
) {
  const { brief, quote } = quoteBrief(input.brief);
  const hash = requestHash(input);
  const transaction = () =>
    db.$transaction(
      async (tx) => {
        const existing = await tx.workflowRun.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: context.workspaceId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { reviewTask: true, outputs: true, nodes: true },
        });
        if (existing) {
          const storedKey = await tx.idempotencyKey.findUnique({
            where: {
              workspaceId_key: { workspaceId: context.workspaceId, key: input.idempotencyKey },
            },
          });
          if (storedKey && storedKey.requestHash !== hash)
            throw new ApiError(
              409,
              "IDEMPOTENCY_KEY_REUSED",
              "This idempotency key was already used for a different request.",
            );
          return { run: existing, deduplicated: true };
        }

        const [brand, workflowVersion, account, product] = await Promise.all([
          getWorkspaceBrand(tx, context.workspaceId),
          getWorkflowVersion(tx, context.workspaceId, input.workflowVersionId),
          tx.creditAccount.findUnique({ where: { workspaceId: context.workspaceId } }),
          tx.product.findFirst({
            where: { workspaceId: context.workspaceId, sku: brief.sku, deletedAt: null },
            include: { assets: { where: { deletedAt: null }, select: { id: true, status: true } } },
          }),
        ]);
        const creativeNodes = workflowNodePlan(workflowVersion.graph).filter((node) =>
          ["image_generation", "image_edit", "model_comparison"].includes(node.type),
        );
        const generationNodeCount = creativeNodes.filter((node) =>
          ["image_generation", "image_edit"].includes(node.type),
        ).length;
        const comparisonAttemptCount = creativeNodes
          .filter((node) => node.type === "model_comparison")
          .reduce((total, node) => {
            const refs = Array.isArray(node.config.modelRefs)
              ? node.config.modelRefs.filter((ref) => typeof ref === "string" && ref.trim())
              : [];
            return total + Math.max(refs.length, 2);
          }, 0);
        const creativeAttemptCount = generationNodeCount + comparisonAttemptCount;
        if (!creativeAttemptCount)
          throw new ApiError(
            409,
            "WORKFLOW_GENERATION_NODE_REQUIRED",
            "The published workflow has no executable image generation, edit, or model comparison node.",
          );
        const runQuote = {
          ...quote,
          credits: quote.credits * creativeAttemptCount,
          providerCostMinor: quote.providerCostMinor * creativeAttemptCount,
          outputCount: quote.outputCount * creativeAttemptCount,
          warnings:
            creativeAttemptCount > 1
              ? [
                  ...quote.warnings,
                  `${creativeAttemptCount} image-model attempts will run independently and are reserved separately.`,
                ]
              : quote.warnings,
        };
        if (!product)
          throw new ApiError(
            404,
            "PRODUCT_NOT_FOUND",
            `SKU ${brief.sku} does not exist in this workspace.`,
          );
        const sourceAssetIds = Array.isArray(product.sourceAssetIds)
          ? product.sourceAssetIds.filter((value): value is string => typeof value === "string")
          : [];
        const sourceAssets = sourceAssetIds.length
          ? await tx.asset.findMany({
              where: {
                workspaceId: context.workspaceId,
                id: { in: sourceAssetIds },
                deletedAt: null,
              },
              select: { id: true, status: true, contentHash: true },
            })
          : [];
        if (sourceAssets.length !== sourceAssetIds.length)
          throw new ApiError(
            409,
            "PRODUCT_SOURCE_ASSET_MISSING",
            `SKU ${brief.sku} references an unavailable source asset.`,
          );
        if (!account)
          throw new ApiError(
            409,
            "CREDIT_ACCOUNT_NOT_READY",
            "The workspace credit account is not configured.",
          );
        if (runQuote.credits > account.balance - account.reserved) {
          throw new ApiError(
            402,
            "INSUFFICIENT_CREDITS",
            `This run needs ${runQuote.credits} credits, but only ${account.balance - account.reserved} are available.`,
          );
        }
        await enforceWorkspaceSpendCap(context.workspaceId, runQuote.credits, tx);

        const created = await tx.workflowRun.create({
          data: {
            workspaceId: context.workspaceId,
            workflowVersionId: workflowVersion.id,
            deployedAppId: input.deployedAppId,
            state: RunState.QUEUED,
            title: requiredText(input.title, "title"),
            idempotencyKey: input.idempotencyKey,
            briefSnapshot: json(brief),
            brandSnapshot: json({
              id: brand.id,
              name: brand.name,
              version: brand.version,
              profile: brand.profile,
              rules: brand.rules.map((rule) => ({
                id: rule.id,
                type: rule.type,
                value: rule.value,
                severity: rule.severity,
                version: rule.version,
              })),
            }),
            productSnapshot: json({
              id: product.id,
              sku: product.sku,
              title: product.title,
              description: product.description,
              priceMinor: product.priceMinor,
              currency: product.currency,
              material: product.material,
              dimensions: product.dimensions,
              variant: product.variant,
              lockMode: product.lockMode,
              facts: product.facts,
              claimRestrictions: product.claimRestrictions,
              sourceAssetIds,
              sourceAssets,
            }),
            quoteSnapshot: json({ ...runQuote, route: runQuote.route }),
            warnings: json(runQuote.warnings),
            reservedUnits: runQuote.credits,
            nodes: {
              create: workflowNodePlan(workflowVersion.graph).map((node) => ({
                nodeKey: node.id,
                state: NodeState.QUEUED,
                inputRefs: json({ type: node.type, config: node.config }),
              })),
            },
          },
          include: { reviewTask: true, outputs: true, nodes: true },
        });

        const reservation = await tx.creditReservation.create({
          data: {
            workspaceId: context.workspaceId,
            runId: created.id,
            amount: runQuote.credits,
            status: ReservationStatus.RESERVED,
          },
        });
        await tx.creditAccount.update({
          where: { workspaceId: context.workspaceId },
          data: { reserved: { increment: runQuote.credits } },
        });
        await tx.ledgerEntry.create({
          data: {
            workspaceId: context.workspaceId,
            reservationId: reservation.id,
            runId: created.id,
            kind: LedgerKind.RESERVE,
            amount: runQuote.credits,
            reason: `Reserved for ${created.title}`,
            idempotencyKey: `${input.idempotencyKey}:reserve`,
          },
        });
        await tx.idempotencyKey.create({
          data: {
            workspaceId: context.workspaceId,
            key: input.idempotencyKey,
            requestHash: hash,
            responseStatus: 201,
            responseBody: json({ runId: created.id }),
          },
        });
        await addEvent(tx, {
          workspaceId: context.workspaceId,
          runId: created.id,
          eventType: "credits.reserved",
          correlationId: context.correlationId,
          idempotencyKey: `${input.idempotencyKey}:credits.reserved`,
          payload: { runId: created.id, credits: runQuote.credits },
        });
        await addEvent(tx, {
          workspaceId: context.workspaceId,
          runId: created.id,
          eventType: "run.queued",
          correlationId: context.correlationId,
          idempotencyKey: `${input.idempotencyKey}:run.queued`,
          payload: { runId: created.id, workflowVersionId: workflowVersion.id },
        });
        await addAudit(tx, {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "run.created",
          targetType: "workflow_run",
          targetId: created.id,
          correlationId: context.correlationId,
          idempotencyKey: input.idempotencyKey,
          metadata: { title: created.title, credits: runQuote.credits },
        });
        return { run: created, deduplicated: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  let result: { run: RunWithRelations; deduplicated: boolean } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await transaction();
      break;
    } catch (error) {
      if (!isTransactionRace(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  if (!result)
    throw new ApiError(
      503,
      "RUN_TRANSACTION_UNAVAILABLE",
      "The run could not be reserved safely. Please retry with the same idempotency key.",
    );

  return { ...result, quote };
}

export async function listRuns(context: RequestContext) {
  const runs = await db.workflowRun.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reviewTask: { include: { comments: true } },
      outputs: { include: { asset: { select: { objectKey: true } } } },
      nodes: true,
    },
  });
  return Promise.all(runs.map(enrichRunOutputs));
}

export async function getRun(context: RequestContext, runId: string) {
  const run = await db.workflowRun.findFirst({
    where: { id: runId, workspaceId: context.workspaceId },
    include: {
      reviewTask: { include: { comments: true } },
      outputs: { include: { asset: { select: { objectKey: true } } } },
      nodes: true,
      reservations: true,
      providerCosts: true,
    },
  });
  if (!run)
    throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
  return enrichRunOutputs(run);
}

async function enrichRunOutputs<
  T extends { outputs: Array<{ asset: { objectKey: string } | null; metadata: unknown }> },
>(run: T) {
  const outputs = await Promise.all(
    run.outputs.map(async (output) => {
      if (!output.asset?.objectKey) return output;
      try {
        const signed = await createDownloadUrl({
          objectKey: output.asset.objectKey,
          expiresIn: 900,
        });
        const metadata =
          output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
            ? (output.metadata as Record<string, unknown>)
            : {};
        return {
          ...output,
          metadata: {
            ...metadata,
            downloadUrl: signed.url,
            downloadUrlExpiresIn: signed.expiresIn,
          },
        };
      } catch {
        return output;
      }
    }),
  );
  return { ...run, outputs };
}

export async function retryRun(context: RequestContext, runId: string, idempotencyKey: string) {
  requireRole(context, "EDITOR");
  return db.$transaction(
    async (tx) => {
      const existingKey = await tx.idempotencyKey.findUnique({
        where: { workspaceId_key: { workspaceId: context.workspaceId, key: idempotencyKey } },
      });
      if (existingKey) {
        const storedRunId =
          existingKey.responseBody && typeof existingKey.responseBody === "object"
            ? (existingKey.responseBody as { runId?: string }).runId
            : undefined;
        if (storedRunId) {
          const existingRun = await tx.workflowRun.findFirst({
            where: { id: storedRunId, workspaceId: context.workspaceId },
            include: { reviewTask: true, outputs: true, nodes: true },
          });
          if (existingRun)
            return {
              run: existingRun,
              deduplicated: true,
              responseStatus: existingKey.responseStatus ?? 202,
            };
        }
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This retry key was already used.");
      }
      const run = await tx.workflowRun.findFirst({
        where: { id: runId, workspaceId: context.workspaceId },
        include: { reservations: true },
      });
      if (!run)
        throw new ApiError(
          404,
          "RUN_NOT_FOUND",
          "The workflow run was not found in this workspace.",
        );
      if (run.state !== RunState.RETRYABLE_FAILURE && run.state !== RunState.TERMINAL_FAILURE)
        throw new ApiError(
          409,
          "RUN_NOT_RETRYABLE",
          `Run is ${run.state.toLowerCase()} and does not require a manual retry.`,
        );
      const activeReservation = run.reservations.find(
        (reservation) => reservation.status === ReservationStatus.RESERVED,
      );
      let reservation = activeReservation;
      if (!reservation) {
        const quote = run.quoteSnapshot as { credits?: unknown };
        const credits = Number(quote.credits);
        if (!Number.isInteger(credits) || credits < 1)
          throw new ApiError(409, "RUN_QUOTE_INVALID", "The run quote cannot be safely retried.");
        const account = await tx.creditAccount.findUnique({
          where: { workspaceId: context.workspaceId },
        });
        if (!account || credits > account.balance - account.reserved)
          throw new ApiError(
            402,
            "INSUFFICIENT_CREDITS",
            "A manual retry requires another credit reservation.",
          );
        await enforceWorkspaceSpendCap(context.workspaceId, credits);
        reservation = await tx.creditReservation.create({
          data: {
            workspaceId: context.workspaceId,
            runId,
            amount: credits,
            status: ReservationStatus.RESERVED,
          },
        });
        await tx.creditAccount.update({
          where: { workspaceId: context.workspaceId },
          data: { reserved: { increment: credits } },
        });
        await tx.ledgerEntry.create({
          data: {
            workspaceId: context.workspaceId,
            reservationId: reservation.id,
            runId,
            kind: LedgerKind.RESERVE,
            amount: credits,
            reason: "Reserved for manual workflow retry",
            idempotencyKey: `${idempotencyKey}:reserve`,
          },
        });
      }
      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          state: RunState.QUEUED,
          error: Prisma.JsonNull,
          actualUnits: null,
          reservedUnits: reservation.amount,
        },
      });
      await tx.nodeRun.updateMany({
        where: { runId },
        data: {
          state: NodeState.QUEUED,
          errorClass: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });
      await tx.outputAsset.updateMany({
        where: { runId, workspaceId: context.workspaceId },
        data: { status: OutputStatus.DRAFT },
      });
      await tx.reviewTask.updateMany({
        where: { runId, workspaceId: context.workspaceId },
        data: { status: ReviewStatus.PENDING, decision: Prisma.JsonNull },
      });
      await tx.idempotencyKey.create({
        data: {
          workspaceId: context.workspaceId,
          key: idempotencyKey,
          requestHash: createHash("sha256").update(`${runId}:retry`).digest("hex"),
          responseStatus: 202,
          responseBody: json({ runId }),
        },
      });
      await addEvent(tx, {
        workspaceId: context.workspaceId,
        runId,
        eventType: "run.retry.queued",
        correlationId: context.correlationId,
        idempotencyKey: `${idempotencyKey}:event`,
        payload: { runId, reservationId: reservation.id, credits: reservation.amount },
      });
      await addAudit(tx, {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "run.retry.queued",
        targetType: "workflow_run",
        targetId: runId,
        correlationId: context.correlationId,
        idempotencyKey,
        metadata: { reservationId: reservation.id, credits: reservation.amount },
      });
      const updated = await tx.workflowRun.findUnique({
        where: { id: runId },
        include: { reviewTask: true, outputs: true, nodes: true },
      });
      return { run: updated!, deduplicated: false, responseStatus: 202 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function cancelRun(context: RequestContext, runId: string) {
  requireRole(context, "EDITOR");
  return db.$transaction(async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: runId, workspaceId: context.workspaceId },
    });
    if (!run)
      throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
    if (run.state !== RunState.QUEUED && run.state !== RunState.RUNNING)
      throw new ApiError(
        409,
        "RUN_NOT_CANCELLABLE",
        `Run is ${run.state.toLowerCase()} and cannot be cancelled.`,
      );
    const reservation = await tx.creditReservation.findFirst({
      where: { runId, workspaceId: context.workspaceId, status: ReservationStatus.RESERVED },
    });
    await tx.workflowRun.update({
      where: { id: run.id },
      data: { state: RunState.CANCELLED, error: json({ code: "CANCELLED_BY_USER" }) },
    });
    if (reservation) {
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.RELEASED, settledAt: now() },
      });
      await tx.creditAccount.update({
        where: { workspaceId: context.workspaceId },
        data: { reserved: { decrement: reservation.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          runId,
          reservationId: reservation.id,
          kind: LedgerKind.RELEASE,
          amount: 0,
          reason: "Released after cancellation",
          idempotencyKey: `${runId}:${reservation.id}:cancel:release`,
        },
      });
    }
    await addEvent(tx, {
      workspaceId: context.workspaceId,
      runId,
      eventType: "run.cancelled",
      correlationId: context.correlationId,
      idempotencyKey: `${runId}:cancelled`,
      payload: { runId },
    });
    await addAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "run.cancelled",
      targetType: "workflow_run",
      targetId: runId,
      correlationId: context.correlationId,
    });
    return tx.workflowRun.findUnique({
      where: { id: runId },
      include: { nodes: true, outputs: true, reviewTask: true },
    });
  });
}

export async function completeRunInternal(
  context: RequestContext,
  runId: string,
  input: {
    outputs: Array<{
      id?: string;
      name: string;
      format: string;
      width?: number;
      height?: number;
      assetId?: string;
      metadata?: unknown;
    }>;
    verdicts: Record<string, unknown>;
    actualUnits?: number;
  },
) {
  return db.$transaction(async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: runId, workspaceId: context.workspaceId },
      include: { reservations: true, workflowVersion: true },
    });
    if (!run)
      throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
    if (
      run.state === RunState.AWAITING_REVIEW ||
      run.state === RunState.APPROVED ||
      run.state === RunState.EXPORTED ||
      run.state === RunState.PUBLISHED
    )
      return run;
    const reservation = run.reservations.find((item) => item.status === ReservationStatus.RESERVED);
    const actualUnits = Math.min(input.actualUnits ?? run.reservedUnits, run.reservedUnits);
    const blocked = Object.values(input.verdicts).some(
      (value) =>
        value &&
        typeof value === "object" &&
        (value as { verdict?: string }).verdict === "critical",
    );
    const outputs = await Promise.all(
      input.outputs.map((output, index) => {
        const id = output.id ?? `${runId}-output-${index}`;
        return tx.outputAsset.upsert({
          where: { id },
          update: {
            workspaceId: context.workspaceId,
            runId,
            assetId: output.assetId,
            name: output.name,
            format: output.format,
            width: output.width,
            height: output.height,
            status: OutputStatus.DRAFT,
            qualityScores: json(input.verdicts),
            metadata: output.metadata === undefined ? undefined : json(output.metadata),
          },
          create: {
            id,
            workspaceId: context.workspaceId,
            runId,
            assetId: output.assetId,
            name: output.name,
            format: output.format,
            width: output.width,
            height: output.height,
            status: OutputStatus.DRAFT,
            qualityScores: json(input.verdicts),
            metadata: output.metadata === undefined ? undefined : json(output.metadata),
          },
        });
      }),
    );
    const controlKeys = workflowReviewAndExportKeys(run.workflowVersion.graph);
    await tx.nodeRun.updateMany({
      where: {
        runId,
        nodeKey: { notIn: [...controlKeys.review, ...controlKeys.export] },
      },
      data: { state: NodeState.SUCCEEDED, completedAt: now() },
    });
    if (controlKeys.review.length)
      await tx.nodeRun.updateMany({
        where: { runId, nodeKey: { in: controlKeys.review } },
        data: { state: NodeState.AWAITING_REVIEW, completedAt: null },
      });
    if (controlKeys.export.length)
      await tx.nodeRun.updateMany({
        where: { runId, nodeKey: { in: controlKeys.export } },
        data: { state: NodeState.QUEUED, completedAt: null },
      });
    if (reservation) {
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.SETTLED, settledAt: now() },
      });
      await tx.creditAccount.update({
        where: { workspaceId: context.workspaceId },
        data: { balance: { decrement: actualUnits }, reserved: { decrement: reservation.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          runId,
          reservationId: reservation.id,
          kind: LedgerKind.CONSUME,
          amount: -actualUnits,
          reason: "Settled after provider completion",
          idempotencyKey: `${runId}:${reservation.id}:consume`,
        },
      });
      if (actualUnits < reservation.amount)
        await tx.ledgerEntry.create({
          data: {
            workspaceId: context.workspaceId,
            runId,
            reservationId: reservation.id,
            kind: LedgerKind.RELEASE,
            amount: 0,
            reason: "Released unused reservation units",
            idempotencyKey: `${runId}:${reservation.id}:release-unused`,
          },
        });
    }
    const review = await tx.reviewTask.upsert({
      where: { runId },
      update: {
        workspaceId: context.workspaceId,
        title: run.title,
        status: ReviewStatus.PENDING,
        decision: Prisma.JsonNull,
        verdicts: json(input.verdicts),
      },
      create: {
        workspaceId: context.workspaceId,
        runId,
        title: run.title,
        kind: "static",
        requiredRoles: json(["EDITOR", "REVIEWER"]),
        verdicts: json(input.verdicts),
      },
    });
    const updated = await tx.workflowRun.update({
      where: { id: runId },
      data: {
        state: RunState.AWAITING_REVIEW,
        actualUnits,
        warnings: json(blocked ? ["Critical QA failure blocks approval and publishing."] : []),
      },
      include: { reviewTask: true, outputs: true, nodes: true },
    });
    await addEvent(tx, {
      workspaceId: context.workspaceId,
      runId,
      eventType: "review.requested",
      correlationId: context.correlationId,
      idempotencyKey: `${runId}:${reservation?.id ?? "none"}:review.requested`,
      payload: { runId, blocked },
    });
    return { run: updated, outputs };
  });
}

export async function markRunRetryableInternal(input: {
  workspaceId: string;
  runId: string;
  correlationId: string;
  attempt: number;
  error: { code: string; message: string };
}) {
  return db.$transaction(async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: input.runId, workspaceId: input.workspaceId },
    });
    if (!run)
      throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
    const terminalStates: RunState[] = [
      RunState.CANCELLED,
      RunState.TERMINAL_FAILURE,
      RunState.AWAITING_REVIEW,
      RunState.APPROVED,
      RunState.EXPORTED,
      RunState.PUBLISHED,
    ];
    if (terminalStates.includes(run.state)) return run;
    await tx.workflowRun.update({
      where: { id: run.id },
      data: { state: RunState.RETRYABLE_FAILURE, error: json(input.error) },
    });
    await tx.nodeRun.updateMany({
      where: {
        runId: run.id,
        state: { in: [NodeState.RUNNING, NodeState.QUEUED, NodeState.RETRYING] },
      },
      data: {
        state: NodeState.RETRYING,
        errorClass: input.error.code,
        errorMessage: input.error.message,
      },
    });
    await addEvent(tx, {
      workspaceId: input.workspaceId,
      runId: run.id,
      eventType: "node.retrying",
      correlationId: input.correlationId,
      idempotencyKey: `${run.id}:retry:${input.attempt}`,
      payload: { attempt: input.attempt, error: input.error },
    });
    return tx.workflowRun.findUnique({
      where: { id: run.id },
      include: { nodes: true, outputs: true, reviewTask: true },
    });
  });
}

export async function failRunInternal(input: {
  workspaceId: string;
  runId: string;
  correlationId: string;
  error: { code: string; message: string };
}) {
  return db.$transaction(async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: input.runId, workspaceId: input.workspaceId },
      include: { reservations: true },
    });
    if (!run)
      throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
    const terminalStates: RunState[] = [
      RunState.AWAITING_REVIEW,
      RunState.APPROVED,
      RunState.EXPORTED,
      RunState.PUBLISHED,
      RunState.CANCELLED,
      RunState.TERMINAL_FAILURE,
    ];
    if (terminalStates.includes(run.state)) return run;
    const reservation = run.reservations.find((item) => item.status === ReservationStatus.RESERVED);
    await tx.workflowRun.update({
      where: { id: run.id },
      data: { state: RunState.TERMINAL_FAILURE, error: json(input.error) },
    });
    await tx.nodeRun.updateMany({
      where: {
        runId: run.id,
        state: { in: [NodeState.QUEUED, NodeState.RUNNING, NodeState.RETRYING] },
      },
      data: {
        state: NodeState.FAILED,
        errorClass: input.error.code,
        errorMessage: input.error.message,
        completedAt: now(),
      },
    });
    if (reservation) {
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.RELEASED, settledAt: now() },
      });
      await tx.creditAccount.update({
        where: { workspaceId: input.workspaceId },
        data: { reserved: { decrement: reservation.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: input.workspaceId,
          runId: run.id,
          reservationId: reservation.id,
          kind: LedgerKind.RELEASE,
          amount: 0,
          reason: "Released after terminal workflow failure",
          idempotencyKey: `${run.id}:${reservation.id}:failure:release`,
        },
      });
    }
    await addEvent(tx, {
      workspaceId: input.workspaceId,
      runId: run.id,
      eventType: "run.terminal_failure",
      correlationId: input.correlationId,
      idempotencyKey: `${run.id}:${reservation?.id ?? "none"}:terminal_failure`,
      payload: input.error,
    });
    return tx.workflowRun.findUnique({
      where: { id: run.id },
      include: { nodes: true, outputs: true, reviewTask: true },
    });
  });
}

export async function decideReview(
  context: RequestContext,
  reviewId: string,
  input: {
    decision: "approve" | "reject" | "refine";
    reason?: string;
    approvedOutputIds?: string[];
  },
) {
  requireRole(context, "REVIEWER");
  return db.$transaction(async (tx) => {
    const review = await tx.reviewTask.findFirst({
      where: { id: reviewId, workspaceId: context.workspaceId },
      include: { run: { include: { workflowVersion: true } } },
    });
    if (!review)
      throw new ApiError(
        404,
        "REVIEW_NOT_FOUND",
        "The review task was not found in this workspace.",
      );
    const verdicts = review.verdicts as Record<string, { verdict?: string }>;
    const blocked = Object.values(verdicts).some((value) => value?.verdict === "critical");
    if (input.decision === "approve" && blocked)
      throw new ApiError(
        409,
        "QUALITY_GATE_BLOCKED",
        "A critical quality check must be repaired before approval.",
      );
    if (input.decision === "approve" && review.run.campaignId) {
      const passport = await tx.creativePassport.findFirst({
        where: {
          workspaceId: context.workspaceId,
          campaignId: review.run.campaignId,
          outputAssetId: null,
        },
        orderBy: { computedAt: "desc" },
      });
      if (!passport || passport.status !== "READY")
        throw new ApiError(
          409,
          "CREATIVE_PASSPORT_BLOCKED",
          "The Creative Passport must be ready before this campaign output can be approved.",
          { passportId: passport?.id ?? null, status: passport?.status ?? "MISSING" },
        );
    }
    const nextStatus =
      input.decision === "approve"
        ? ReviewStatus.APPROVED
        : input.decision === "reject"
          ? ReviewStatus.REJECTED
          : ReviewStatus.REFINEMENT_REQUESTED;
    const nextRunState =
      input.decision === "approve"
        ? RunState.APPROVED
        : input.decision === "reject"
          ? RunState.RETRYABLE_FAILURE
          : RunState.AWAITING_REVIEW;
    const decision = {
      action: input.decision,
      reason: input.reason ?? null,
      actorId: context.userId,
      at: now().toISOString(),
    };
    const updatedReview = await tx.reviewTask.update({
      where: { id: review.id },
      data: { status: nextStatus, decision },
    });
    const updatedRun = await tx.workflowRun.update({
      where: { id: review.runId },
      data: { state: nextRunState },
    });
    if (input.decision === "approve") {
      const outputs = await tx.outputAsset.findMany({
        where: { runId: review.runId, workspaceId: context.workspaceId },
        select: { id: true },
      });
      const approvedIds = input.approvedOutputIds?.length
        ? new Set(input.approvedOutputIds)
        : new Set(outputs.map((output) => output.id));
      await tx.outputAsset.updateMany({
        where: {
          runId: review.runId,
          workspaceId: context.workspaceId,
          id: { in: [...approvedIds] },
        },
        data: { status: OutputStatus.APPROVED, approvedAt: now() },
      });
      if (input.approvedOutputIds?.length)
        await tx.outputAsset.updateMany({
          where: {
            runId: review.runId,
            workspaceId: context.workspaceId,
            id: { notIn: [...approvedIds] },
          },
          data: { status: OutputStatus.REJECTED },
        });
    }
    const controlKeys = workflowReviewAndExportKeys(review.run.workflowVersion.graph);
    if (controlKeys.review.length)
      await tx.nodeRun.updateMany({
        where: { runId: review.runId, nodeKey: { in: controlKeys.review } },
        data: { state: NodeState.SUCCEEDED, completedAt: now() },
      });
    if (input.decision === "approve" && controlKeys.export.length)
      await tx.nodeRun.updateMany({
        where: { runId: review.runId, nodeKey: { in: controlKeys.export } },
        data: { state: NodeState.QUEUED, completedAt: null },
      });
    await addEvent(tx, {
      workspaceId: context.workspaceId,
      runId: review.runId,
      eventType: "review.decided",
      correlationId: context.correlationId,
      idempotencyKey: `${review.id}:${input.decision}:${decision.at}`,
      payload: decision,
    });
    await addAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: `review.${input.decision}`,
      targetType: "review_task",
      targetId: review.id,
      correlationId: context.correlationId,
      metadata: { reason: input.reason, approvedOutputIds: input.approvedOutputIds ?? null },
    });
    return { review: updatedReview, run: updatedRun };
  });
}

export async function exportRun(context: RequestContext, runId: string) {
  requireRole(context, "EDITOR");
  return db.$transaction(async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: runId, workspaceId: context.workspaceId },
      include: { reviewTask: true, outputs: true, workflowVersion: true },
    });
    if (!run)
      throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
    if (run.state === RunState.EXPORTED) return run;
    if (run.state !== RunState.APPROVED || run.reviewTask?.status !== ReviewStatus.APPROVED)
      throw new ApiError(409, "EXPORT_REQUIRES_APPROVAL", "Only an approved run can be exported.");
    await tx.outputAsset.updateMany({
      where: { runId, workspaceId: context.workspaceId },
      data: { status: OutputStatus.EXPORTED },
    });
    const exportNodes = workflowReviewAndExportKeys(run.workflowVersion.graph).export;
    if (exportNodes.length)
      await tx.nodeRun.updateMany({
        where: { runId, nodeKey: { in: exportNodes } },
        data: {
          state: NodeState.SUCCEEDED,
          outputRefs: { exportedOutputIds: run.outputs.map((output) => output.id) },
          completedAt: now(),
        },
      });
    const updated = await tx.workflowRun.update({
      where: { id: runId },
      data: { state: RunState.EXPORTED },
      include: { reviewTask: true, outputs: true },
    });
    await addEvent(tx, {
      workspaceId: context.workspaceId,
      runId,
      eventType: "export.completed",
      correlationId: context.correlationId,
      idempotencyKey: `${runId}:exported`,
      payload: { runId, outputCount: run.outputs.length },
    });
    await addAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "run.exported",
      targetType: "workflow_run",
      targetId: runId,
      correlationId: context.correlationId,
    });
    return updated;
  });
}

export async function getWorkspaceState(context: RequestContext) {
  const [workspace, brand, runs, reviewRows, account, ledger, assets, products] = await Promise.all(
    [
      db.workspace.findFirst({
        where: { id: context.workspaceId, status: "ACTIVE" },
        select: { id: true, name: true, slug: true, plan: true, region: true },
      }),
      db.brand.findFirst({
        where: { workspaceId: context.workspaceId, approvalStatus: "APPROVED" },
        orderBy: { updatedAt: "desc" },
      }),
      listRuns(context),
      db.reviewTask.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { comments: true },
      }),
      db.creditAccount.findUnique({ where: { workspaceId: context.workspaceId } }),
      db.ledgerEntry.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.asset.findMany({
        where: { workspaceId: context.workspaceId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          mimeType: true,
          objectKey: true,
          productId: true,
          contentHash: true,
        },
      }),
      db.product.findMany({
        where: { workspaceId: context.workspaceId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          sku: true,
          title: true,
          sourceAssetIds: true,
          lockMode: true,
          brandId: true,
        },
      }),
    ],
  );
  if (!workspace)
    throw new ApiError(404, "WORKSPACE_NOT_FOUND", "The workspace was not found or is inactive.");
  return {
    workspace: { ...workspace, role: context.role },
    brand,
    runs,
    reviews: reviewRows.map((review) => ({
      ...review,
      outputs: runs.find((run) => run.id === review.runId)?.outputs ?? [],
    })),
    credits: account,
    ledger,
    assets,
    products,
  };
}
