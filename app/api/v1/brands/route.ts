import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { db } from "../../../../src/server/db";
import { ApiError, jsonError } from "../../../../src/server/api";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedProfile(value: unknown) {
  const profile = object(value);
  const daily = object(profile.dailyPolicy);
  const visual = object(profile.visualSystem);
  const claims = object(profile.claimsPolicy);
  return {
    ...profile,
    dailyPolicy: {
      postsPerWeek:
        typeof daily.postsPerWeek === "number"
          ? Math.max(1, Math.min(14, Math.floor(daily.postsPerWeek)))
          : 5,
      defaultMode:
        typeof daily.defaultMode === "string" ? daily.defaultMode.toLowerCase() : "approval",
      allowedAutopublishTypes: Array.isArray(daily.allowedAutopublishTypes)
        ? daily.allowedAutopublishTypes
        : ["evergreen_education"],
      blockedTypes: Array.isArray(daily.blockedTypes)
        ? daily.blockedTypes
        : ["testimonial", "price_offer", "regulated_claim"],
      approvalSlaHours:
        typeof daily.approvalSlaHours === "number"
          ? Math.max(1, Math.min(168, Math.floor(daily.approvalSlaHours)))
          : 12,
    },
    contentPillars: Array.isArray(profile.contentPillars)
      ? profile.contentPillars
      : ["evergreen education", "product truth", "community proof"],
    visualSystem: {
      templateFamilies: Array.isArray(visual.templateFamilies)
        ? visual.templateFamilies
        : ["daily-poster", "product-proof"],
      lockedLayers: Array.isArray(visual.lockedLayers)
        ? visual.lockedLayers
        : ["logo", "product", "price", "disclosure"],
      allowedImageModes: Array.isArray(visual.allowedImageModes)
        ? visual.allowedImageModes
        : ["real_asset", "product_lock_scene", "abstract_broll"],
      defaultFormats: Array.isArray(visual.defaultFormats)
        ? visual.defaultFormats
        : ["1:1", "4:5", "9:16"],
    },
    claimsPolicy: {
      requireEvidence: claims.requireEvidence !== false,
      forbiddenTerms: Array.isArray(claims.forbiddenTerms) ? claims.forbiddenTerms : ["guaranteed"],
    },
  };
}

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const brands = await db.brand.findMany({
      where: { workspaceId: context.workspaceId },
      include: { rules: { orderBy: { createdAt: "desc" }, take: 100 } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ data: brands });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || !body.profile || typeof body.profile !== "object")
      throw new ApiError(400, "INVALID_BRAND", "name and a structured profile are required.");
    const suppliedProfile = object(body.profile);
    const suppliedReferenceIds = Array.isArray(body.referenceAssetIds)
      ? body.referenceAssetIds
      : Array.isArray(suppliedProfile.referenceAssetIds)
        ? suppliedProfile.referenceAssetIds
        : [];
    const referenceAssetIds = [
      ...new Set(
        suppliedReferenceIds.filter(
          (value): value is string => typeof value === "string" && Boolean(value.trim()),
        ),
      ),
    ];
    if (referenceAssetIds.length) {
      const referenceAssets = await db.asset.findMany({
        where: {
          workspaceId: context.workspaceId,
          id: { in: referenceAssetIds },
          deletedAt: null,
        },
        select: { id: true, status: true },
      });
      if (referenceAssets.length !== referenceAssetIds.length)
        throw new ApiError(
          404,
          "BRAND_REFERENCE_ASSET_NOT_FOUND",
          "Every brand reference asset must belong to this workspace.",
        );
      if (
        referenceAssets.some(
          (asset) => asset.status === "UPLOADING" || asset.status === "QUARANTINED",
        )
      )
        throw new ApiError(
          409,
          "BRAND_REFERENCE_ASSET_NOT_READY",
          "Every brand reference asset must pass verification before approval.",
        );
    }
    const profile = {
      ...normalizedProfile(body.profile),
      referenceAssetIds,
    };
    const brand = await db.$transaction(async (tx) => {
      const current = await tx.brand.findUnique({
        where: { workspaceId_name: { workspaceId: context.workspaceId, name } },
      });
      const next = await tx.brand.upsert({
        where: { workspaceId_name: { workspaceId: context.workspaceId, name } },
        update: {
          version: { increment: 1 },
          approvalStatus: "DRAFT",
          approvedBy: null,
          approvedAt: null,
          profile: profile as Prisma.InputJsonValue,
        },
        create: {
          workspaceId: context.workspaceId,
          name,
          version: 1,
          approvalStatus: "DRAFT",
          profile: profile as Prisma.InputJsonValue,
        },
      });
      const rules = Array.isArray(body.rules) ? body.rules : [];
      if (rules.length > 0) {
        await tx.brandRule.createMany({
          data: rules
            .filter((rule): rule is Record<string, unknown> =>
              Boolean(rule && typeof rule === "object"),
            )
            .map((rule) => ({
              workspaceId: context.workspaceId,
              brandId: next.id,
              version: next.version,
              type: typeof rule.type === "string" ? rule.type : "profile",
              value: (rule.value ?? rule) as Prisma.InputJsonValue,
              severity: typeof rule.severity === "string" ? rule.severity : "warning",
              source: "workspace",
            })),
        });
      }
      await tx.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "brand.saved",
          targetType: "brand",
          targetId: next.id,
          correlationId: context.correlationId,
          metadata: { previousVersion: current?.version ?? null, version: next.version },
        },
      });
      return next;
    });
    return NextResponse.json({ data: brand }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
