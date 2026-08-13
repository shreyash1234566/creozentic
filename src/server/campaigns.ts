import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function createCampaign(
  context: RequestContext,
  input: {
    name: string;
    objective: string;
    brandId?: string;
    productIds: string[];
    channels: string[];
    offer?: Record<string, unknown>;
    audience?: Record<string, unknown>;
    legalCopy?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
  },
) {
  requireRole(context, "EDITOR");
  const name = input.name.trim();
  const objective = input.objective.trim();
  const productIds = [...new Set(strings(input.productIds))];
  const channels = [...new Set(strings(input.channels))];
  if (!name || !objective || !channels.length)
    throw new ApiError(
      400,
      "INVALID_CAMPAIGN",
      "name, objective, and at least one channel are required.",
    );
  if (input.brandId) {
    const brand = await db.brand.findFirst({
      where: { id: input.brandId, workspaceId: context.workspaceId },
    });
    if (!brand) throw new ApiError(404, "BRAND_NOT_FOUND", "The campaign brand was not found.");
  }
  if (productIds.length) {
    const count = await db.product.count({
      where: { workspaceId: context.workspaceId, id: { in: productIds }, deletedAt: null },
    });
    if (count !== productIds.length)
      throw new ApiError(
        404,
        "CAMPAIGN_PRODUCT_NOT_FOUND",
        "Every campaign product must belong to the workspace.",
      );
  }
  return db.campaignBrief.create({
    data: {
      workspaceId: context.workspaceId,
      brandId: input.brandId,
      name,
      objective,
      productIds: json(productIds),
      channels: json(channels),
      offer: input.offer ? json(input.offer) : undefined,
      audience: input.audience ? json(input.audience) : undefined,
      legalCopy: input.legalCopy ? json(input.legalCopy) : undefined,
      evidence: input.evidence ? json(input.evidence) : undefined,
      createdBy: context.userId,
    },
  });
}

export async function listCampaigns(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.campaignBrief.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function approveCampaign(context: RequestContext, campaignId: string) {
  requireRole(context, "REVIEWER");
  const campaign = await db.campaignBrief.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  const offer = campaign.offer && typeof campaign.offer === "object" ? campaign.offer : null;
  if (offer && (!campaign.evidence || typeof campaign.evidence !== "object"))
    throw new ApiError(
      409,
      "CAMPAIGN_EVIDENCE_REQUIRED",
      "An offer campaign requires evidence before approval.",
    );
  return db.campaignBrief.update({
    where: { id: campaign.id },
    data: {
      status: "APPROVED",
      approvedBy: context.userId,
      approvedAt: new Date(),
      version: { increment: 1 },
    },
  });
}

export async function createTemplateDefinition(
  context: RequestContext,
  input: {
    name: string;
    contentType: string;
    version: string;
    brandId?: string;
    schema: Record<string, unknown>;
    lockedLayers: string[];
    supportedFormats: string[];
  },
) {
  requireRole(context, "STRATEGIST");
  if (!input.name.trim() || !input.contentType.trim() || !input.version.trim())
    throw new ApiError(400, "INVALID_TEMPLATE", "name, contentType, and version are required.");
  if (!input.lockedLayers.length || !input.supportedFormats.length)
    throw new ApiError(
      400,
      "INVALID_TEMPLATE",
      "locked layers and supported formats are required.",
    );
  return db.templateDefinition.create({
    data: {
      workspaceId: context.workspaceId,
      brandId: input.brandId,
      name: input.name.trim(),
      contentType: input.contentType.trim(),
      version: input.version.trim(),
      schema: json(input.schema),
      lockedLayers: json([...new Set(input.lockedLayers)]),
      supportedFormats: json([...new Set(input.supportedFormats)]),
      createdBy: context.userId,
    },
  });
}

export async function approveTemplateDefinition(context: RequestContext, templateId: string) {
  requireRole(context, "REVIEWER");
  const template = await db.templateDefinition.findFirst({
    where: { id: templateId, workspaceId: context.workspaceId },
  });
  if (!template) throw new ApiError(404, "TEMPLATE_NOT_FOUND", "The template was not found.");
  return db.templateDefinition.update({
    where: { id: template.id },
    data: { status: "APPROVED", approvedBy: context.userId, approvedAt: new Date() },
  });
}

export async function listTemplateDefinitions(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.templateDefinition.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}
