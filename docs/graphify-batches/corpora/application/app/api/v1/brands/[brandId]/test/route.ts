import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const { brandId } = await params;
    const brand = await db.brand.findFirst({
      where: { id: brandId, workspaceId: context.workspaceId },
      include: { rules: { orderBy: { createdAt: "desc" }, take: 100 } },
    });
    if (!brand)
      throw new ApiError(404, "BRAND_NOT_FOUND", "The brand was not found in this workspace.");
    const profile = object(brand.profile);
    const visual = object(profile.visualSystem);
    const daily = object(profile.dailyPolicy);
    const claims = object(profile.claimsPolicy);
    const references = Array.isArray(profile.referenceAssetIds) ? profile.referenceAssetIds : [];
    const approvedExamples = Array.isArray(profile.approvedExamples)
      ? profile.approvedExamples
      : [];
    const avoidExamples = Array.isArray(profile.avoidExamples) ? profile.avoidExamples : [];
    const referenceAssets = references.length
      ? await db.asset.findMany({
          where: { workspaceId: context.workspaceId, id: { in: references }, deletedAt: null },
          select: { id: true, status: true, mimeType: true },
        })
      : [];
    const verifiedReferenceCount = referenceAssets.filter(
      (asset) =>
        ["READY", "IMMUTABLE", "DERIVED"].includes(asset.status) &&
        asset.mimeType.startsWith("image/"),
    ).length;
    const checks = [
      ["Brand identity", Boolean(brand.name && profile.tagline)],
      ["Tone and audience", Boolean(profile.tone && profile.audience)],
      [
        "Approved references",
        references.length >= 5 &&
          references.length <= 10 &&
          verifiedReferenceCount === references.length,
      ],
      ["Avoid references", avoidExamples.length >= 3],
      ["Locked visual rules", Array.isArray(visual.lockedLayers) && visual.lockedLayers.length > 0],
      ["Publishing policy", Boolean(daily.defaultMode) && Array.isArray(daily.blockedTypes)],
      ["Claims policy", claims.requireEvidence !== false],
    ] as Array<[string, boolean]>;
    const missing = checks.filter(([, valid]) => !valid).map(([label]) => label);
    const ready = missing.length === 0 && brand.approvalStatus === "APPROVED";
    const summary = `Creozentic will use ${String(profile.tone || "the configured brand tone")} for ${String(profile.audience || "the configured audience")}. It will preserve ${Array.isArray(visual.lockedLayers) ? visual.lockedLayers.join(", ") : "locked product and brand fields"}, require evidence for claims, and default to ${String(daily.defaultMode || "approval")} before publishing.`;
    const samplePack = {
      status: ready ? "READY_FOR_REVIEW" : "BLOCKED",
      referenceAssetIds: references,
      verifiedReferenceCount,
      formats: ["1:1", "4:5", "9:16"],
      deliverables: [
        {
          type: "visual",
          label: "Brand-conditioned visual direction",
          state: ready ? "ready" : "blocked",
        },
        {
          type: "copy",
          label: "Headline, caption, CTA, hashtags and alt text",
          state: ready ? "ready" : "blocked",
        },
        {
          type: "passport",
          label: "Truth, brand, claims, rights and policy evidence",
          state: ready ? "ready" : "blocked",
        },
      ],
      content: {
        headline: `${String(profile.tone || "On-brand")} ideas for ${brand.name}`,
        caption: `Created for ${String(profile.audience || "your audience")} in ${String(profile.language || "English")}.`,
        cta: "Review before publishing",
        hashtags: [`#${brand.name.replace(/[^a-z0-9]/gi, "")}`, "#onbrand"],
        altText: `${brand.name} campaign preview using approved brand references`,
      },
      rulesApplied: [
        `Tone: ${String(profile.tone || "not configured")}`,
        `Audience: ${String(profile.audience || "not configured")}`,
        `Locked layers: ${Array.isArray(visual.lockedLayers) ? visual.lockedLayers.join(", ") : "not configured"}`,
        `Claims: ${claims.requireEvidence === false ? "evidence optional" : "evidence required"}`,
        `Publishing: ${String(daily.defaultMode || "approval")} with blocked types enforced`,
      ],
      explanation: ready
        ? "This preview pack uses the selected verified references and configured rules. It is review evidence, not a silently published asset."
        : "Complete the missing checks before this Brand Brain version can influence a sample pack or published content.",
    };
    await db.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "brand.tested",
        targetType: "brand",
        targetId: brand.id,
        correlationId: context.correlationId,
        metadata: { version: brand.version, ready, missing },
      },
    });
    return NextResponse.json({
      data: {
        ready,
        approved: brand.approvalStatus === "APPROVED",
        version: brand.version,
        summary,
        checks: checks.map(([label, valid]) => ({ label, valid })),
        missing,
        samplePack,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
