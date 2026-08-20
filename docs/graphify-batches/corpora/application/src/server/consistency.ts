import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";
import { requiresProductionAuthentication } from "./runtime-config";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function asStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function providerVerdict(value: unknown) {
  return value === "PASS" || value === "WARN" || value === "CRITICAL" ? value : undefined;
}

/**
 * Computes consistency from the approved reference pack and workspace assets.
 * The public API deliberately does not accept a caller-supplied confidence or
 * verdict for this path; those values must come from the configured vision
 * provider and are persisted with provider/version evidence.
 */
export async function evaluateConsistencyCheck(
  context: RequestContext,
  input: {
    referencePackId: string;
    runId?: string;
    outputAssetId?: string;
    sourceAssetId?: string;
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const pack = await db.referencePack.findFirst({
    where: { id: input.referencePackId, workspaceId: context.workspaceId, status: "APPROVED" },
  });
  if (!pack)
    throw new ApiError(
      404,
      "REFERENCE_PACK_NOT_FOUND",
      "The approved reference pack was not found in this workspace.",
    );
  const referenceAssetIds = asStrings(pack.referenceAssetIds);
  const [output, source] = await Promise.all([
    input.outputAssetId
      ? db.outputAsset.findFirst({
          where: { id: input.outputAssetId, workspaceId: context.workspaceId },
          include: { asset: true },
        })
      : null,
    input.sourceAssetId
      ? db.asset.findFirst({
          where: { id: input.sourceAssetId, workspaceId: context.workspaceId, deletedAt: null },
        })
      : null,
  ]);
  if (input.outputAssetId && !output)
    throw new ApiError(404, "OUTPUT_NOT_FOUND", "The consistency output was not found.");
  if (input.sourceAssetId && !source)
    throw new ApiError(404, "SOURCE_ASSET_NOT_FOUND", "The consistency source was not found.");
  if (!output?.asset && !source)
    throw new ApiError(
      400,
      "CONSISTENCY_OUTPUT_REQUIRED",
      "An outputAssetId or sourceAssetId is required for visual consistency evaluation.",
    );
  const endpoint = process.env.INTEGRITY_PROVIDER_URL;
  if (!endpoint)
    throw new ApiError(
      requiresProductionAuthentication() ? 503 : 409,
      "CONSISTENCY_PROVIDER_NOT_CONFIGURED",
      "A configured visual integrity provider is required to compute product consistency evidence.",
    );
  try {
    const response = await requestProvider<Record<string, unknown>>({
      provider: "visual-integrity",
      endpoint,
      idempotencyKey: input.idempotencyKey,
      headers: process.env.INTELLIGENCE_PROVIDER_API_KEY
        ? { authorization: `Bearer ${process.env.INTELLIGENCE_PROVIDER_API_KEY}` }
        : undefined,
      body: {
        task: "product.consistency",
        referenceAssetIds,
        referenceRules: pack.identityRules,
        outputAsset: output?.asset
          ? {
              id: output.asset.id,
              objectKey: output.asset.objectKey,
              contentHash: output.asset.contentHash,
              mimeType: output.asset.mimeType,
            }
          : undefined,
        sourceAsset: source
          ? {
              id: source.id,
              objectKey: source.objectKey,
              contentHash: source.contentHash,
              mimeType: source.mimeType,
            }
          : undefined,
      },
    });
    const body = response.body;
    const confidence = Number(body.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
      throw new ApiError(
        502,
        "CONSISTENCY_PROVIDER_INVALID",
        "The visual integrity provider returned an invalid confidence score.",
      );
    const verdict = providerVerdict(body.verdict);
    if (!verdict)
      throw new ApiError(
        502,
        "CONSISTENCY_PROVIDER_INVALID",
        "The visual integrity provider returned no usable verdict.",
      );
    return recordConsistencyCheck(context, {
      referencePackId: input.referencePackId,
      runId: input.runId,
      outputAssetId: input.outputAssetId,
      sourceAssetId: input.sourceAssetId,
      confidence,
      verdict,
      drift: body.drift,
      metadata: {
        provider: body.provider ?? "visual-integrity",
        version: body.version ?? "unknown",
        requestId: response.requestId ?? null,
        evidence: body.evidence ?? null,
      },
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerApiError(
      error,
      "CONSISTENCY_PROVIDER_FAILED",
      "The visual integrity provider failed.",
    );
  }
}

export async function createReferencePack(
  context: RequestContext,
  input: {
    name: string;
    productId?: string;
    mode?: "PRODUCT_LOCK" | "CREATIVE";
    seed?: string;
    referenceAssetIds: string[];
    identityRules?: unknown;
  },
) {
  requireRole(context, "EDITOR");
  const name = input.name.trim();
  const referenceAssetIds = [...new Set(input.referenceAssetIds)];
  if (!name || referenceAssetIds.length === 0)
    throw new ApiError(
      400,
      "INVALID_REFERENCE_PACK",
      "name and at least one reference asset are required.",
    );
  if (input.mode && input.mode !== "PRODUCT_LOCK" && input.mode !== "CREATIVE")
    throw new ApiError(400, "INVALID_REFERENCE_MODE", "mode must be PRODUCT_LOCK or CREATIVE.");
  if (
    input.productId &&
    !(await db.product.findFirst({
      where: { id: input.productId, workspaceId: context.workspaceId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new ApiError(
      404,
      "PRODUCT_NOT_FOUND",
      "The reference pack product was not found in this workspace.",
    );
  const assets = await db.asset.findMany({
    where: { workspaceId: context.workspaceId, id: { in: referenceAssetIds }, deletedAt: null },
    select: { id: true, status: true },
  });
  if (assets.length !== referenceAssetIds.length)
    throw new ApiError(
      404,
      "REFERENCE_ASSET_NOT_FOUND",
      "Every reference asset must belong to this workspace.",
    );
  if (assets.some((asset) => asset.status === "UPLOADING" || asset.status === "QUARANTINED"))
    throw new ApiError(
      409,
      "REFERENCE_ASSET_NOT_READY",
      "Every reference asset must be verified before saving the pack.",
    );
  try {
    return await db.referencePack.create({
      data: {
        workspaceId: context.workspaceId,
        productId: input.productId,
        name,
        mode: input.mode ?? "PRODUCT_LOCK",
        seed: input.seed?.trim() || undefined,
        referenceAssetIds: json(referenceAssetIds),
        identityRules: json(input.identityRules ?? {}),
        createdBy: context.userId,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new ApiError(
        409,
        "REFERENCE_PACK_EXISTS",
        "A reference pack with this name already exists.",
      );
    throw error;
  }
}

export async function listReferencePacks(context: RequestContext) {
  return db.referencePack.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: { product: { select: { sku: true, title: true } } },
  });
}

export async function approveReferencePack(context: RequestContext, packId: string) {
  requireRole(context, "STRATEGIST");
  const pack = await db.referencePack.findFirst({
    where: { id: packId, workspaceId: context.workspaceId },
  });
  if (!pack)
    throw new ApiError(404, "REFERENCE_PACK_NOT_FOUND", "The reference pack was not found.");
  return db.referencePack.update({
    where: { id: pack.id },
    data: { status: "APPROVED", version: { increment: 1 } },
  });
}

export async function recordConsistencyCheck(
  context: RequestContext,
  input: {
    referencePackId: string;
    runId?: string;
    outputAssetId?: string;
    sourceAssetId?: string;
    confidence: number;
    verdict?: "PASS" | "WARN" | "CRITICAL";
    drift?: unknown;
    metadata?: unknown;
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    throw new ApiError(
      400,
      "INVALID_CONSISTENCY_CONFIDENCE",
      "confidence must be between 0 and 1.",
    );
  const pack = await db.referencePack.findFirst({
    where: { id: input.referencePackId, workspaceId: context.workspaceId },
    select: { id: true, status: true },
  });
  if (!pack)
    throw new ApiError(404, "REFERENCE_PACK_NOT_FOUND", "The reference pack was not found.");
  if (pack.status !== "APPROVED")
    throw new ApiError(
      409,
      "REFERENCE_PACK_NOT_APPROVED",
      "Approve the reference pack before evaluating output consistency.",
    );
  if (
    input.runId &&
    !(await db.workflowRun.findFirst({
      where: { id: input.runId, workspaceId: context.workspaceId },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "RUN_NOT_FOUND", "The consistency run was not found.");
  if (
    input.outputAssetId &&
    !(await db.outputAsset.findFirst({
      where: { id: input.outputAssetId, workspaceId: context.workspaceId },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "OUTPUT_NOT_FOUND", "The consistency output was not found.");
  if (
    input.sourceAssetId &&
    !(await db.asset.findFirst({
      where: { id: input.sourceAssetId, workspaceId: context.workspaceId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new ApiError(
      404,
      "SOURCE_ASSET_NOT_FOUND",
      "The consistency source asset was not found.",
    );
  const verdict =
    input.verdict ??
    (input.confidence < 0.7 ? "CRITICAL" : input.confidence < 0.85 ? "WARN" : "PASS");
  const existing = await db.consistencyCheck.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return { check: existing, deduplicated: true };
  const check = await db.$transaction(async (tx) => {
    const created = await tx.consistencyCheck.create({
      data: {
        workspaceId: context.workspaceId,
        referencePackId: pack.id,
        runId: input.runId,
        outputAssetId: input.outputAssetId,
        sourceAssetId: input.sourceAssetId,
        confidence: input.confidence,
        verdict,
        drift: input.drift === undefined ? undefined : json(input.drift),
        metadata: input.metadata === undefined ? undefined : json(input.metadata),
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (input.outputAssetId) {
      const output = await tx.outputAsset.findFirst({
        where: { id: input.outputAssetId, workspaceId: context.workspaceId },
        select: { qualityScores: true, status: true },
      });
      if (output && verdict === "CRITICAL") {
        const existingScores =
          output.qualityScores && typeof output.qualityScores === "object"
            ? output.qualityScores
            : {};
        await tx.outputAsset.update({
          where: { id: input.outputAssetId },
          data: {
            status: "REJECTED",
            qualityScores: json({
              ...(existingScores as Record<string, unknown>),
              "Product / identity truth": {
                dimension: "Product / identity truth",
                verdict: "critical",
                repair: "Identity drift detected; regenerate in product-lock mode.",
              },
            }),
          },
        });
      }
    }
    await tx.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "consistency.checked",
        targetType: "consistency_check",
        targetId: created.id,
        correlationId: context.correlationId,
        idempotencyKey: input.idempotencyKey,
        metadata: { verdict, confidence: input.confidence, referencePackId: pack.id },
      },
    });
    return created;
  });
  return { check, deduplicated: false };
}

export async function listConsistencyChecks(context: RequestContext) {
  return db.consistencyCheck.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { referencePack: { select: { name: true, version: true } } },
  });
}
