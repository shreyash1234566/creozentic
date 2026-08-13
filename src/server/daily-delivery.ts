import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";
import { appendCreativeEvent } from "./events";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function exportDailyPlan(context: RequestContext, planId: string) {
  requireRole(context, "EDITOR");
  const plan = await db.dailyContentPlan.findFirst({
    where: { id: planId, workspaceId: context.workspaceId },
    include: { brand: true, creativePlans: true, approvalGates: true },
  });
  if (!plan)
    throw new ApiError(404, "DAILY_PLAN_NOT_FOUND", "The daily content plan was not found.");
  if (!["APPROVED", "PUBLISH_PENDING", "DELIVERED", "PUBLISHED"].includes(plan.status))
    throw new ApiError(
      409,
      "DAILY_EXPORT_REQUIRES_APPROVAL",
      "The daily plan must pass its approval gates before export.",
    );
  if (plan.approvalGates.some((gate) => gate.state === "PENDING" || gate.state === "BLOCKED"))
    throw new ApiError(
      409,
      "DAILY_EXPORT_GATE_BLOCKED",
      "Every exportable creative needs an approved or explicitly bypassed gate.",
    );

  const entries: Array<Record<string, unknown>> = [];
  for (const creative of plan.creativePlans) {
    const outputs = record(creative.outputs);
    const assetIds = [...new Set(strings(outputs.assetIds))];
    const assets = assetIds.length
      ? await db.asset.findMany({
          where: { workspaceId: context.workspaceId, id: { in: assetIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            mimeType: true,
            contentHash: true,
            objectKey: true,
            width: true,
            height: true,
            metadata: true,
          },
        })
      : [];
    if (assets.length !== assetIds.length)
      throw new ApiError(
        409,
        "DAILY_EXPORT_ASSET_MISSING",
        "Every approved creative output must have a workspace-scoped asset.",
      );
    const copy = record(creative.copySlots);
    entries.push({
      creativePlanId: creative.id,
      contentType: creative.contentType,
      objective: creative.objective,
      angle: creative.angle,
      templateId: creative.templateId,
      templateVersion: creative.templateVersion,
      assets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        contentHash: asset.contentHash,
        objectKey: asset.objectKey,
        width: asset.width,
        height: asset.height,
      })),
      caption: copy.body,
      headline: copy.headline,
      cta: copy.cta,
      altText: `${copy.headline ?? plan.brand?.name ?? "Approved creative"} — accessible description required before channel publishing.`,
      disclosure: copy.disclosure,
      evidenceIds: creative.evidenceIds,
      rights: {
        sourceAssets: creative.sourceAssetIds,
        brandProfileVersion: plan.brandProfileVersion,
        productTruthPreserved: true,
      },
    });
  }
  const manifest = {
    schemaVersion: "1.0",
    packageType: "daily_creative_bundle",
    dailyPlanId: plan.id,
    workspaceId: context.workspaceId,
    brandId: plan.brandId,
    brandProfileVersion: plan.brandProfileVersion,
    planDate: plan.planDate.toISOString(),
    autonomyMode: plan.autonomyMode,
    generatedAt: new Date().toISOString(),
    approvalGateIds: plan.approvalGates.map((gate) => gate.id),
    entries,
    publication: { status: "PUBLISH_PENDING", connectors: [], idempotencyRequired: true },
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const saved = await db.$transaction(async (tx) => {
    const updated = await tx.dailyContentPlan.update({
      where: { id: plan.id },
      data: { status: "DELIVERED", deliveryManifest: json({ ...manifest, manifestHash }) },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      eventType: "creative.package.delivered",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: "dashboard" },
      policyContext: { autonomyMode: plan.autonomyMode },
      payload: {
        dailyPlanId: plan.id,
        manifestHash,
        assetCount: entries.reduce(
          (sum, entry) => sum + (Array.isArray(entry.assets) ? entry.assets.length : 0),
          0,
        ),
      },
      idempotencyKey: `daily-package-delivered:${plan.id}:${manifestHash}`,
    });
    return updated;
  });
  return {
    plan: saved,
    manifest: { ...manifest, manifestHash },
    deduplicated: Boolean(plan.deliveryManifest),
  };
}
