import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";
import { appendCreativeEvent } from "./events";
import { createNotifications } from "./notifications";
import { createMediaJob } from "./media-jobs";
import { linkCalendarEntryToPlan } from "./content-calendar";
import { syncAgencyWorkItem } from "./agency-operations";

export const AUTOPILOT_MODES = ["DRAFT", "APPROVAL", "GUARDED_AUTOPUBLISH", "CAMPAIGN"] as const;
export type AutopilotMode = (typeof AUTOPILOT_MODES)[number];

const AGENT_TYPES = [
  "intake",
  "brand_guardian",
  "content_strategist",
  "creative_director",
  "copy",
  "visual",
  "composer",
  "qa_policy",
  "approval",
  "publisher",
  "learning",
] as const;

const AGENT_TOOL_CALLS: Record<string, string[]> = {
  intake: ["brief.parse", "brand.read", "product.read", "calendar.read", "asset.read"],
  brand_guardian: ["brand.profile.read", "product.truth.read", "claims.policy.read"],
  content_strategist: ["calendar.read", "performance.read", "fatigue.check"],
  creative_director: ["template.select", "asset.select", "creative.matrix.plan"],
  copy: ["evidence.read", "copy.structure", "claims.check"],
  visual: ["asset.read", "model.estimate", "product.integrity.check"],
  composer: ["template.compose", "layout.measure", "render.deterministic"],
  qa_policy: ["ocr.check", "brand.check", "product.check", "accessibility.check", "format.check"],
  approval: ["review.link.create", "approval.persist", "revision.classify"],
  publisher: ["connector.read", "idempotency.check", "receipt.persist"],
  learning: ["performance.aggregate", "fatigue.detect", "recommendation.write"],
};

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
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

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function planDate(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime()))
    throw new ApiError(400, "INVALID_PLAN_DATE", "planDate must be an ISO date.");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function mode(value: unknown): AutopilotMode {
  const candidate = typeof value === "string" ? value.toUpperCase() : "APPROVAL";
  if (!AUTOPILOT_MODES.includes(candidate as AutopilotMode))
    throw new ApiError(400, "INVALID_AUTOPILOT_MODE", "Unsupported Autopilot mode.");
  return candidate as AutopilotMode;
}

function profilePolicy(profile: Record<string, unknown>) {
  const daily = record(profile.dailyPolicy);
  return {
    postsPerWeek:
      typeof daily.postsPerWeek === "number" && daily.postsPerWeek > 0
        ? Math.min(14, Math.floor(daily.postsPerWeek))
        : 5,
    defaultMode: mode(daily.defaultMode ?? "APPROVAL"),
    blockedTypes: strings(daily.blockedTypes),
    allowedAutopublishTypes: strings(daily.allowedAutopublishTypes),
    approvalSlaHours:
      typeof daily.approvalSlaHours === "number" && daily.approvalSlaHours > 0
        ? Math.min(168, Math.floor(daily.approvalSlaHours))
        : 12,
  };
}

function defaultAutonomyPolicy(contentType: string, channel: string) {
  return {
    contentType,
    channel,
    mode: "APPROVAL",
    allowedTools: ["brand.read", "product.read", "asset.read", "template.compose", "qa.run"],
    budgetCredits: 40,
    requiredApprovals: ["owner_or_reviewer"],
    escalationRules: {
      newOffer: "CAMPAIGN_APPROVAL",
      regulatedClaim: "CAMPAIGN_APPROVAL",
      syntheticTestimonial: "ALWAYS_HUMAN_APPROVAL",
      missingFact: "PAUSE",
    },
  };
}

async function resolveBrand(context: RequestContext, brandId?: string) {
  const brand = brandId
    ? await db.brand.findFirst({ where: { id: brandId, workspaceId: context.workspaceId } })
    : await db.brand.findFirst({
        where: { workspaceId: context.workspaceId },
        orderBy: { updatedAt: "desc" },
      });
  if (brandId && !brand)
    throw new ApiError(404, "BRAND_NOT_FOUND", "The brand was not found in this workspace.");
  return brand;
}

function sourceAssetIds(value: unknown) {
  return strings(value);
}

function outputFormats(value: unknown) {
  const selected = strings(value);
  return selected.length ? selected.slice(0, 4) : ["1:1", "4:5", "9:16"];
}

function textChecks(copySlots: Record<string, unknown>) {
  const headline = typeof copySlots.headline === "string" ? copySlots.headline : "";
  const body = typeof copySlots.body === "string" ? copySlots.body : "";
  const failures: string[] = [];
  if (headline.length > 72)
    failures.push("headline exceeds the locked template limit of 72 characters");
  if (body.length > 180) failures.push("body exceeds the locked template limit of 180 characters");
  return failures;
}

function copyFor(
  type: string,
  product: { id: string; title: string; priceMinor: number | null } | null,
  profile: Record<string, unknown>,
  formats: string[],
) {
  const name = product?.title ?? "your product";
  const tone = typeof profile.tone === "string" ? profile.tone : "clear and useful";
  const hasPrice = product?.priceMinor !== null && product?.priceMinor !== undefined;
  return {
    productId: product?.id ?? null,
    headline:
      type === "promotional_ad" ? `${name} — made for everyday living` : `${name}, your way`,
    body: `A ${tone} idea grounded in the approved product record.`,
    cta: type === "promotional_ad" ? "Explore the offer" : "Learn more",
    ...(hasPrice && type === "promotional_ad" ? { priceMinor: product!.priceMinor } : {}),
    disclosure: type === "ugc_ready_ad" ? "AI-assisted creative · review required" : null,
    formats,
  };
}

function contentTypes(input: { contentTypes?: string[]; productCount: number }) {
  if (input.contentTypes?.length) return [...new Set(input.contentTypes)].slice(0, 5);
  return input.productCount > 0 ? ["organic_poster", "promotional_ad"] : ["organic_poster"];
}

export async function listDailyPlans(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.dailyContentPlan.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: [{ planDate: "desc" }, { updatedAt: "desc" }],
    take: 60,
    include: {
      brand: { select: { id: true, name: true, version: true } },
      creativePlans: {
        select: { id: true, objective: true, angle: true, status: true, outputs: true },
      },
      approvalGates: { select: { id: true, state: true, outputAssetId: true } },
      failures: {
        where: { status: "OPEN" },
        select: { id: true, node: true, failureClass: true, customerImpact: true },
      },
    },
  });
}

export async function getDailyPlan(context: RequestContext, planId: string) {
  requireRole(context, "VIEWER");
  const plan = await db.dailyContentPlan.findFirst({
    where: { id: planId, workspaceId: context.workspaceId },
    include: {
      brand: true,
      creativeRequests: true,
      creativePlans: { include: { approvalGates: true }, orderBy: { createdAt: "asc" } },
      agentRuns: { orderBy: { createdAt: "asc" } },
      approvalGates: { orderBy: { createdAt: "asc" } },
      failures: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!plan)
    throw new ApiError(404, "DAILY_PLAN_NOT_FOUND", "The daily content plan was not found.");
  return plan;
}

export async function createDailyPlan(
  context: RequestContext,
  input: {
    brandId?: string;
    planDate?: string;
    autonomyMode?: string;
    channel?: string;
    language?: string;
    contentTypes?: string[];
    productIds?: string[];
    campaignIds?: string[];
    reviewerId?: string;
    source?: string;
    scheduleId?: string;
  },
) {
  requireRole(context, "EDITOR");
  const date = planDate(input.planDate);
  const selectedMode = mode(input.autonomyMode ?? "APPROVAL");
  const brand = await resolveBrand(context, input.brandId);
  const existing = await db.dailyContentPlan.findFirst({
    where: { workspaceId: context.workspaceId, brandId: brand?.id ?? null, planDate: date },
  });
  if (existing) return { plan: await getDailyPlan(context, existing.id), deduplicated: true };

  const profile = record(brand?.profile);
  const daily = profilePolicy(profile);
  const products = await db.product.findMany({
    where: {
      workspaceId: context.workspaceId,
      deletedAt: null,
      ...(brand?.id ? { brandId: brand.id } : {}),
      ...(input.productIds?.length ? { id: { in: input.productIds } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      priceMinor: true,
      sourceAssetIds: true,
      sku: true,
      facts: true,
    },
  });
  const formats = outputFormats(record(profile.visualSystem).defaultFormats);
  const types = contentTypes({ contentTypes: input.contentTypes, productCount: products.length });
  const campaignIds = [...new Set(input.campaignIds ?? [])];
  const campaigns = campaignIds.length
    ? await db.campaignBrief.findMany({
        where: { id: { in: campaignIds }, workspaceId: context.workspaceId },
        select: { id: true, status: true, brandId: true, productIds: true },
      })
    : [];
  if (campaigns.length !== campaignIds.length)
    throw new ApiError(
      404,
      "CAMPAIGN_NOT_FOUND",
      "Every selected campaign must belong to this workspace.",
    );
  if (brand?.id && campaigns.some((campaign) => campaign.brandId && campaign.brandId !== brand.id))
    throw new ApiError(409, "CAMPAIGN_BRAND_MISMATCH", "A campaign belongs to a different brand.");
  const primaryProduct = products[0] ?? null;
  const missingByType: Record<string, string[]> = {};
  const creativeSpecs = types.map((type, index) => {
    const product =
      type === "organic_poster"
        ? primaryProduct
        : (products[index % Math.max(products.length, 1)] ?? null);
    const missing: string[] = [];
    if (["promotional_ad", "ugc_ready_ad"].includes(type) && !product)
      missing.push("product truth record");
    if (["promotional_ad", "ugc_ready_ad"].includes(type) && product && product.priceMinor === null)
      missing.push("current price or explicit no-price offer");
    if (["promotional_ad", "ugc_ready_ad"].includes(type) && !campaignIds.length)
      missing.push("offer or campaign approval context");
    if (
      ["promotional_ad", "ugc_ready_ad"].includes(type) &&
      campaignIds.length &&
      campaigns.some((campaign) => campaign.status !== "APPROVED")
    )
      missing.push("approved campaign evidence");
    if (missing.length) missingByType[type] = missing;
    const sourceIds = sourceAssetIds(product?.sourceAssetIds);
    const copySlots = copyFor(type, product, profile, formats);
    return {
      type,
      product,
      sourceIds,
      missing,
      copySlots,
      objective:
        type === "promotional_ad"
          ? "Convert qualified product interest"
          : "Maintain useful daily brand presence",
      angle:
        type === "promotional_ad"
          ? "Approved product benefit and offer context"
          : "Evergreen education grounded in product truth",
      estimatedCostCredits: type === "reel" || type === "ugc_ready_ad" ? 12 : 6,
    };
  });
  const missingFields = Object.entries(missingByType).flatMap(([type, fields]) =>
    fields.map((field) => `${type}: ${field}`),
  );
  const policy = await db.autonomyPolicy.findFirst({
    where: {
      workspaceId: context.workspaceId,
      brandId: brand?.id ?? null,
      contentType: { in: ["daily_batch", ...types] },
      channel: input.channel ?? "dashboard",
      status: "APPROVED",
    },
    orderBy: { version: "desc" },
  });
  const effectiveMode = selectedMode === "APPROVAL" && policy ? mode(policy.mode) : selectedMode;
  if (
    effectiveMode === "GUARDED_AUTOPUBLISH" &&
    (policy?.status !== "APPROVED" || policy.mode !== "GUARDED_AUTOPUBLISH")
  )
    throw new ApiError(
      409,
      "AUTONOMY_POLICY_NOT_APPROVED",
      "Guarded autopublish requires an approved policy for this brand, content type, and channel.",
    );
  const approvalSlaHours =
    policy?.escalationRules && typeof record(policy.escalationRules).approvalSlaHours === "number"
      ? Number(record(policy.escalationRules).approvalSlaHours)
      : daily.approvalSlaHours;

  const plan = await db.$transaction(async (tx) => {
    const created = await tx.dailyContentPlan.create({
      data: {
        workspaceId: context.workspaceId,
        brandId: brand?.id,
        scheduleId: input.scheduleId,
        planDate: date,
        brandProfileVersion: brand?.version,
        brandProfileSnapshot: json(profile),
        status: missingFields.length ? "NEEDS_INPUT" : "PLANNED",
        autonomyMode: effectiveMode,
        pillarMix: json(profile.contentPillars ?? ["evergreen education"]),
        campaignIds: json(campaignIds),
        costEstimate: json({
          textSelection: 0,
          image: creativeSpecs
            .filter((item) => item.type !== "reel" && item.type !== "ugc_ready_ad")
            .reduce((sum, item) => sum + item.estimatedCostCredits, 0),
          videoAvatarVoice: creativeSpecs
            .filter((item) => item.type === "reel" || item.type === "ugc_ready_ad")
            .reduce((sum, item) => sum + item.estimatedCostCredits, 0),
          deterministicRenderStorage: creativeSpecs.length * formats.length * 2,
          retriesFallback: 2,
          publishingMessaging: 0,
          currency: "credits",
        }),
        approvalSlaHours,
        reviewerId: input.reviewerId,
        source: input.source ?? "DASHBOARD",
        createdBy: context.userId,
      },
    });
    const createdPlans = [] as Array<{ id: string; type: string; missing: string[] }>;
    for (const spec of creativeSpecs) {
      const guardedSafe =
        effectiveMode === "GUARDED_AUTOPUBLISH" &&
        policy?.contentType === spec.type &&
        spec.type === "organic_poster" &&
        spec.missing.length === 0;
      const creative = await tx.creativePlan.create({
        data: {
          workspaceId: context.workspaceId,
          dailyPlanId: created.id,
          contentType: spec.type,
          objective: spec.objective,
          angle: spec.angle,
          templateId: "daily-locked-poster",
          templateVersion: "1.0.0",
          sourceAssetIds: json(spec.sourceIds),
          copySlots: json({
            ...spec.copySlots,
            language: input.language ?? profile.language ?? "English",
            channel: input.channel ?? "dashboard",
          }),
          modelNodes: json([
            { node: "visual", mode: "existing_asset_first", productLock: true },
            {
              node: "composer",
              mode: "deterministic_template",
              lockedLayers: ["product", "logo", "price", "disclosure"],
            },
          ]),
          evidenceIds: json([
            ...(spec.product ? [`product:${spec.product.id}:facts`] : []),
            ...(spec.product?.priceMinor !== null && spec.product?.priceMinor !== undefined
              ? [`product:${spec.product.id}:price`]
              : []),
            ...(brand ? [`brand:${brand.id}:profile:v${brand.version}`] : []),
          ]),
          estimatedCostCredits: spec.estimatedCostCredits,
          approvalRequired:
            !guardedSafe &&
            (effectiveMode !== "DRAFT" ||
              spec.type === "promotional_ad" ||
              spec.type === "ugc_ready_ad"),
          status: spec.missing.length ? "BLOCKED" : "PLANNED",
        },
      });
      await tx.approvalGate.create({
        data: {
          workspaceId: context.workspaceId,
          dailyPlanId: created.id,
          creativePlanId: creative.id,
          reviewerId: input.reviewerId,
          reviewerRole: "OWNER_OR_REVIEWER",
          state: spec.missing.length
            ? "BLOCKED"
            : creative.approvalRequired
              ? "PENDING"
              : "BYPASSED",
          comments: spec.missing.length ? json({ missingFields: spec.missing }) : undefined,
          slaHours: approvalSlaHours,
          expiresAt: creative.approvalRequired
            ? new Date(date.getTime() + approvalSlaHours * 3_600_000)
            : undefined,
        },
      });
      createdPlans.push({ id: creative.id, type: spec.type, missing: spec.missing });
    }
    const agentRuns = [] as Array<{ id: string; agentType: string }>;
    for (const agentType of AGENT_TYPES) {
      const paused = agentType === "intake" && missingFields.length > 0;
      const run = await tx.agentRun.create({
        data: {
          workspaceId: context.workspaceId,
          dailyPlanId: created.id,
          agentType,
          agentVersion: "autopilot-1.0.0",
          status: paused ? "PAUSED" : "COMPLETED",
          inputContextHash: hash({
            brandId: brand?.id,
            brandVersion: brand?.version,
            date: date.toISOString(),
            types,
          }),
          toolCalls: json(
            paused ? AGENT_TOOL_CALLS[agentType].slice(0, 3) : AGENT_TOOL_CALLS[agentType],
          ),
          budgetCredits: agentType === "visual" ? 4 : agentType === "creative_director" ? 1 : 0,
          timeoutMs: agentType === "visual" || agentType === "composer" ? 180_000 : 30_000,
          retryLimit: agentType === "qa_policy" || agentType === "approval" ? 0 : 2,
          output: json({
            decision: paused ? "pause" : "complete",
            mode: effectiveMode,
            contentTypes: types,
            missingFields: paused ? missingFields : [],
          }),
          confidence: paused ? 0.25 : 0.86,
          pauseReason: paused ? "Required product, offer, or price facts are missing." : undefined,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      agentRuns.push({ id: run.id, agentType });
    }
    if (missingFields.length) {
      const intake = agentRuns.find((run) => run.agentType === "intake");
      for (const [type, fields] of Object.entries(missingByType)) {
        await tx.failureRecord.create({
          data: {
            workspaceId: context.workspaceId,
            dailyPlanId: created.id,
            agentRunId: intake?.id,
            node: "intake",
            failureClass: "MISSING_REQUIRED_INPUT",
            customerImpact: `${type} is paused and cannot be exported or published.`,
            repair: json({ ask: fields, rule: "never_guess_price_offer_or_product_benefit" }),
          },
        });
      }
    }
    await tx.dailyContentPlan.update({
      where: { id: created.id },
      data: { plannedOutputs: json(createdPlans) },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: brand?.id,
      eventType: "creative.plan.created",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: input.channel ?? "dashboard" },
      policyContext: { autonomyMode: effectiveMode, budgetCredits: policy?.budgetCredits ?? 40 },
      payload: {
        dailyPlanId: created.id,
        planDate: date.toISOString(),
        outputs: createdPlans,
        missingFields,
      },
      idempotencyKey: `daily-plan-created:${created.id}`,
    });
    return created;
  });
  await linkCalendarEntryToPlan(context, {
    brandId: brand?.id,
    planDate: date,
    dailyPlanId: plan.id,
  });
  return { plan: await getDailyPlan(context, plan.id), deduplicated: false };
}

export async function runDailyPlan(context: RequestContext, planId: string) {
  requireRole(context, "EDITOR");
  const plan = await getDailyPlan(context, planId);
  if (["NEEDS_INPUT", "BLOCKED"].includes(plan.status))
    throw new ApiError(
      409,
      "DAILY_PLAN_NEEDS_INPUT",
      "Resolve the blocked facts before producing this plan.",
      { failures: plan.failures },
    );
  if (["PENDING_APPROVAL", "APPROVED", "DELIVERED", "PUBLISHED"].includes(plan.status))
    return { plan, deduplicated: true };
  const profile = record(plan.brand?.profile);
  await db.$transaction(async (tx) => {
    await tx.dailyContentPlan.update({
      where: { id: plan.id },
      data: { status: "PRODUCING", startedAt: new Date() },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      eventType: "creative.plan.production_started",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: plan.source.toLowerCase() },
      policyContext: { autonomyMode: plan.autonomyMode, budgetCredits: 40 },
      payload: { dailyPlanId: plan.id, from: plan.status, to: "PRODUCING" },
      idempotencyKey: `daily-plan-production-started:${plan.id}`,
    });
  });
  await syncAgencyWorkItem(context, plan.id);
  const composer = await db.agentRun.create({
    data: {
      workspaceId: context.workspaceId,
      dailyPlanId: plan.id,
      agentType: "composer",
      agentVersion: "autopilot-1.0.0",
      status: "RUNNING",
      inputContextHash: hash({
        planId: plan.id,
        outputs: plan.creativePlans.map((item) => item.id),
      }),
      toolCalls: json(["asset.read", "template.compose", "render.deterministic"]),
      budgetCredits: 40,
      startedAt: new Date(),
    },
  });
  const runnableCreatives = plan.creativePlans.filter((creative) => creative.status === "PLANNED");
  if (!runnableCreatives.length) {
    await db.agentRun.update({
      where: { id: composer.id },
      data: {
        status: "COMPLETED",
        output: json({ rendered: 0, reason: "no scoped revision pending" }),
        completedAt: new Date(),
      },
    });
    return { plan: await getDailyPlan(context, plan.id), deduplicated: true };
  }
  const failed: Array<{ creativePlanId: string; message: string }> = [];
  for (const creative of runnableCreatives) {
    const slots = record(creative.copySlots);
    const checks = textChecks(slots);
    const sourceIds = sourceAssetIds(creative.sourceAssetIds);
    const sourceAssets = sourceIds.length
      ? await db.asset.findMany({
          where: {
            workspaceId: context.workspaceId,
            id: { in: sourceIds },
            deletedAt: null,
            status: { in: ["READY", "IMMUTABLE", "DERIVED"] },
            mimeType: { startsWith: "image/" },
          },
          select: { id: true },
        })
      : [];
    if (!sourceAssets.length)
      checks.push("a verified image asset is required for deterministic product-safe composition");
    if (checks.length) {
      failed.push({ creativePlanId: creative.id, message: checks.join("; ") });
      await db.failureRecord.create({
        data: {
          workspaceId: context.workspaceId,
          dailyPlanId: plan.id,
          agentRunId: composer.id,
          node: "qa_policy",
          failureClass: checks.some((item) => item.includes("text"))
            ? "TEXT_OVERFLOW"
            : "SOURCE_ASSET_REQUIRED",
          customerImpact:
            "The affected creative remains blocked and cannot be exported or published.",
          repair: json({ actions: checks }),
        },
      });
      continue;
    }
    const previous = record(creative.outputs);
    const revision = typeof previous.revision === "number" ? previous.revision : 0;
    const rendered: string[] = [];
    try {
      for (const ratio of outputFormats(slots.formats)) {
        const job = await createMediaJob(context, {
          kind: "composition.render",
          sourceAssetIds: sourceAssets.map((asset) => asset.id),
          config: {
            templateId: creative.templateId ?? "daily:locked-poster:v1",
            ratio,
            accent:
              Array.isArray(profile.colors) && typeof profile.colors[0] === "string"
                ? profile.colors[0]
                : "#d1560f",
            overlay: 26,
            layers: [
              {
                id: "logo",
                kind: "logo",
                text: plan.brand?.name ?? "Brand",
                x: 8,
                y: 8,
              },
              {
                id: "headline",
                kind: "headline",
                text: typeof slots.headline === "string" ? slots.headline : "",
                x: 8,
                y: 22,
              },
              {
                id: "body",
                kind: "body",
                text: typeof slots.body === "string" ? slots.body : "",
                x: 8,
                y: 42,
              },
              {
                id: "cta",
                kind: "cta",
                text: typeof slots.cta === "string" ? slots.cta : "Learn more",
                x: 8,
                y: 78,
              },
            ],
          },
          idempotencyKey: `daily-plan:${plan.id}:creative:${creative.id}:revision:${revision}:ratio:${ratio}`,
        });
        rendered.push(...sourceAssetIds(job.job.outputAssetIds));
      }
      await db.creativePlan.update({
        where: { id: creative.id },
        data: {
          outputs: json({
            revision,
            assetIds: rendered,
            formats: outputFormats(slots.formats),
            generatedAt: new Date().toISOString(),
            renderer: "deterministic",
          }),
          status: "QA",
        },
      });
      await db.approvalGate.updateMany({
        where: {
          workspaceId: context.workspaceId,
          dailyPlanId: plan.id,
          creativePlanId: creative.id,
        },
        data: {
          outputAssetId: rendered[0],
          state: creative.approvalRequired ? "PENDING" : "BYPASSED",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The deterministic renderer failed.";
      failed.push({ creativePlanId: creative.id, message });
      await db.failureRecord.create({
        data: {
          workspaceId: context.workspaceId,
          dailyPlanId: plan.id,
          agentRunId: composer.id,
          node: "composer",
          failureClass: "RETRYABLE_PROVIDER_OR_RENDERER_FAILURE",
          provider: "deterministic-renderer",
          customerImpact:
            "The affected output was not delivered; retry or manual repair is available.",
          repair: json({ retryable: true, message }),
        },
      });
    }
  }
  const qa = await db.agentRun.create({
    data: {
      workspaceId: context.workspaceId,
      dailyPlanId: plan.id,
      parentRunId: composer.id,
      agentType: "qa_policy",
      agentVersion: "autopilot-1.0.0",
      status: failed.length ? "PAUSED" : "COMPLETED",
      inputContextHash: hash({ planId: plan.id, failed }),
      toolCalls: json([
        "ocr.check",
        "brand.check",
        "product.check",
        "accessibility.check",
        "format.check",
      ]),
      budgetCredits: 0,
      output: json({ passed: failed.length === 0, failures: failed }),
      confidence: failed.length ? 0.35 : 0.9,
      pauseReason: failed.length ? "One or more outputs need a precise repair." : undefined,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await db.agentRun.update({
    where: { id: composer.id },
    data: {
      status: failed.length ? "PAUSED" : "COMPLETED",
      output: json({ rendered: runnableCreatives.length - failed.length, failed }),
      confidence: failed.length ? 0.4 : 0.88,
      completedAt: new Date(),
      durationMs: 0,
    },
  });
  const requiresApproval = plan.creativePlans.some((creative) => creative.approvalRequired);
  const finalStatus = failed.length
    ? "REPAIR_REQUIRED"
    : plan.autonomyMode === "DRAFT"
      ? "DELIVERED"
      : requiresApproval
        ? "PENDING_APPROVAL"
        : "PUBLISH_PENDING";
  await db.$transaction(async (tx) => {
    await tx.dailyContentPlan.update({
      where: { id: plan.id },
      data: { status: finalStatus, completedAt: failed.length ? undefined : new Date() },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      eventType: failed.length ? "creative.plan.repair_required" : "creative.plan.qa_completed",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: plan.source.toLowerCase() },
      policyContext: { autonomyMode: plan.autonomyMode, budgetCredits: 40 },
      payload: {
        dailyPlanId: plan.id,
        qaRunId: qa.id,
        failures: failed,
        outputCount: runnableCreatives.length - failed.length,
      },
      idempotencyKey: `daily-plan-qa:${plan.id}:${failed.length ? "repair" : "pass"}:${Date.now()}`,
    });
  });
  await syncAgencyWorkItem(context, plan.id);
  if (finalStatus === "PENDING_APPROVAL")
    await createNotifications({
      workspaceId: context.workspaceId,
      recipientId: plan.reviewerId ?? undefined,
      type: "DAILY_APPROVAL_REQUIRED",
      title: "Daily creative needs approval",
      body: `The ${plan.planDate.toISOString().slice(0, 10)} daily creative pack is ready for review.`,
      payload: { dailyPlanId: plan.id },
      channels: ["IN_APP", "EMAIL"],
      idempotencyKey: `daily-plan-approval-required:${plan.id}`,
    });
  return { plan: await getDailyPlan(context, plan.id), deduplicated: false };
}

export async function approveDailyPlan(
  context: RequestContext,
  planId: string,
  gateIds?: string[],
) {
  requireRole(context, "REVIEWER");
  const plan = await getDailyPlan(context, planId);
  const gates = plan.approvalGates.filter((gate) => !gateIds?.length || gateIds.includes(gate.id));
  if (!gates.length)
    throw new ApiError(400, "APPROVAL_GATE_REQUIRED", "At least one approval gate is required.");
  if (gates.some((gate) => gate.state === "BLOCKED"))
    throw new ApiError(409, "APPROVAL_BLOCKED", "Blocked outputs cannot be approved.");
  await db.$transaction(async (tx) => {
    await tx.approvalGate.updateMany({
      where: {
        workspaceId: context.workspaceId,
        id: { in: gates.map((gate) => gate.id) },
        state: "PENDING",
      },
      data: { state: "APPROVED", reviewerId: context.userId, approvedAt: new Date() },
    });
    const pending = await tx.approvalGate.count({
      where: { workspaceId: context.workspaceId, dailyPlanId: plan.id, state: "PENDING" },
    });
    if (pending === 0)
      await tx.dailyContentPlan.update({
        where: { id: plan.id },
        data: { status: "APPROVED", completedAt: new Date() },
      });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      eventType: "creative.approval.recorded",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: "dashboard" },
      policyContext: { autonomyMode: plan.autonomyMode },
      payload: { dailyPlanId: plan.id, gateIds: gates.map((gate) => gate.id), decision: "approve" },
      idempotencyKey: `daily-plan-approved:${plan.id}:${gates
        .map((gate) => gate.id)
        .sort()
        .join(",")}`,
    });
  });
  await syncAgencyWorkItem(context, plan.id);
  await createNotifications({
    workspaceId: context.workspaceId,
    recipientId: plan.createdBy,
    type: "DAILY_APPROVAL_RECORDED",
    title: "Daily creative approval recorded",
    body: "The selected daily creative approval gates have been recorded.",
    payload: { dailyPlanId: plan.id, gateIds: gates.map((gate) => gate.id) },
    channels: ["IN_APP"],
    idempotencyKey: `daily-plan-approved-notification:${plan.id}:${gates
      .map((gate) => gate.id)
      .sort()
      .join(",")}`,
  });
  return getDailyPlan(context, plan.id);
}

export async function reviseDailyPlan(
  context: RequestContext,
  planId: string,
  input: { gateId?: string; instruction: string; category?: string },
) {
  requireRole(context, "EDITOR");
  const instruction = input.instruction.trim();
  if (!instruction)
    throw new ApiError(400, "REVISION_REQUIRED", "A targeted revision instruction is required.");
  const plan = await getDailyPlan(context, planId);
  const creative = input.gateId
    ? plan.creativePlans.find((item) => item.approvalGates.some((gate) => gate.id === input.gateId))
    : plan.creativePlans.find((item) => item.status !== "BLOCKED");
  if (!creative)
    throw new ApiError(
      404,
      "CREATIVE_PLAN_NOT_FOUND",
      "The requested creative plan was not found.",
    );
  const copySlots = record(creative.copySlots);
  const isShorten = /shorten|shorter|headline/i.test(instruction);
  if (isShorten && typeof copySlots.headline === "string") {
    const words = copySlots.headline.split(/\s+/).filter(Boolean);
    copySlots.headline = words.slice(0, Math.max(3, Math.ceil(words.length * 0.6))).join(" ");
  } else {
    copySlots.revisionNotes = instruction;
  }
  const previous = record(creative.outputs);
  const revision = typeof previous.revision === "number" ? previous.revision + 1 : 1;
  await db.$transaction(async (tx) => {
    await tx.creativePlan.update({
      where: { id: creative.id },
      data: {
        copySlots: json(copySlots),
        outputs: json({ ...previous, revision, pendingRevision: true }),
        status: "PLANNED",
      },
    });
    await tx.approvalGate.updateMany({
      where: {
        workspaceId: context.workspaceId,
        dailyPlanId: plan.id,
        creativePlanId: creative.id,
      },
      data: {
        state: "PENDING",
        comments: json({
          category: input.category ?? (isShorten ? "copy_layout" : "targeted_revision"),
          instruction,
        }),
        approvedAt: null,
      },
    });
    await tx.dailyContentPlan.update({ where: { id: plan.id }, data: { status: "PLANNED" } });
    await tx.agentRun.create({
      data: {
        workspaceId: context.workspaceId,
        dailyPlanId: plan.id,
        agentType: "approval_revision",
        agentVersion: "autopilot-1.0.0",
        status: "COMPLETED",
        inputContextHash: hash({ creativePlanId: creative.id, instruction }),
        toolCalls: json(isShorten ? ["copy.edit", "layout.reflow"] : ["targeted.revision"]),
        budgetCredits: isShorten ? 1 : 2,
        output: json({
          creativePlanId: creative.id,
          preserved: ["sourceAssetIds", "templateId", "modelNodes"],
          revision,
        }),
        confidence: 0.88,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      eventType: "creative.revision.requested",
      correlationId: context.correlationId,
      actor: { type: "user", id: context.userId, channel: "dashboard" },
      policyContext: { autonomyMode: plan.autonomyMode },
      payload: {
        dailyPlanId: plan.id,
        creativePlanId: creative.id,
        category: input.category ?? "targeted_revision",
        instruction,
        preserved: ["product", "background", "video_source", "unaffected_cuts"],
      },
      idempotencyKey: `daily-plan-revision:${plan.id}:${creative.id}:${revision}`,
    });
  });
  await syncAgencyWorkItem(context, plan.id);
  return getDailyPlan(context, plan.id);
}

function normalizeRequest(rawMessage: string) {
  const lower = rawMessage.toLowerCase();
  const language = /[\u0900-\u097f]/.test(rawMessage)
    ? "Hindi"
    : /hinglish/.test(lower)
      ? "Hinglish"
      : "English";
  const channel = /whatsapp/.test(lower)
    ? "whatsapp"
    : /meta|instagram|facebook/.test(lower)
      ? "meta"
      : /tiktok/.test(lower)
        ? "tiktok"
        : "dashboard";
  const requestedDate = /\b(tomorrow|kal)\b/.test(lower)
    ? new Date(Date.now() + 86_400_000).toISOString()
    : undefined;
  const missing: string[] = [];
  if (/viral|trending/.test(lower) && !/offer|launch|education|product|sale/.test(lower))
    missing.push("objective");
  if (/price|offer|sale|discount/.test(lower) && !/\d/.test(lower))
    missing.push("current price or offer evidence");
  return {
    language,
    channel,
    requestedDate,
    missingFields: missing,
    normalizedBrief: { goal: rawMessage, language, channel, requestedDate, requiresApproval: true },
  };
}

export async function createCreativeRequest(
  context: RequestContext,
  input: {
    rawMessage: string;
    source?: string;
    brandId?: string;
    channel?: string;
    requestedDate?: string;
    consent?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  requireRole(context, "EDITOR");
  const rawMessage = input.rawMessage.trim();
  if (!rawMessage)
    throw new ApiError(400, "CREATIVE_REQUEST_REQUIRED", "A creative request message is required.");
  if (input.idempotencyKey) {
    const existing = await db.creativeRequest.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { request: existing, deduplicated: true };
  }
  const normalized = normalizeRequest(rawMessage);
  const brand = await resolveBrand(context, input.brandId);
  const request = await db.$transaction(async (tx) => {
    const created = await tx.creativeRequest.create({
      data: {
        workspaceId: context.workspaceId,
        brandId: brand?.id,
        source: input.source ?? "DASHBOARD",
        rawMessage,
        normalizedBrief: json(normalized.normalizedBrief),
        missingFields: json(normalized.missingFields),
        requesterId: context.userId,
        channel: input.channel ?? normalized.channel,
        requestedDate: input.requestedDate
          ? planDate(input.requestedDate)
          : normalized.requestedDate
            ? new Date(normalized.requestedDate)
            : undefined,
        consent: json(input.consent ?? {}),
        status: normalized.missingFields.length ? "NEEDS_INPUT" : "REQUESTED",
        idempotencyKey: input.idempotencyKey,
      },
    });
    await appendCreativeEvent(tx, {
      workspaceId: context.workspaceId,
      brandId: brand?.id,
      eventType: "creative.requested",
      correlationId: context.correlationId,
      causationId: input.idempotencyKey,
      actor: { type: "user", id: context.userId, channel: input.channel ?? normalized.channel },
      policyContext: { autonomyMode: "APPROVAL", budgetCredits: 40 },
      payload: {
        creativeRequestId: created.id,
        text: rawMessage,
        requestedDate: created.requestedDate?.toISOString() ?? null,
        missingFields: normalized.missingFields,
      },
      idempotencyKey: `creative-requested:${created.id}`,
    });
    return created;
  });
  return { request, deduplicated: false };
}

export async function listCreativeRequests(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.creativeRequest.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      brand: { select: { id: true, name: true } },
      dailyPlan: { select: { id: true, status: true, planDate: true } },
    },
  });
}

export async function materializeCreativeRequest(
  context: RequestContext,
  creativeRequestId: string,
) {
  requireRole(context, "EDITOR");
  const request = await db.creativeRequest.findFirst({
    where: { id: creativeRequestId, workspaceId: context.workspaceId },
  });
  if (!request)
    throw new ApiError(404, "CREATIVE_REQUEST_NOT_FOUND", "The creative request was not found.");
  if (request.dailyPlanId)
    return { request, plan: await getDailyPlan(context, request.dailyPlanId), deduplicated: true };
  if (request.status === "NEEDS_INPUT")
    return { request, plan: null, deduplicated: false, blocked: true };
  const normalized = record(request.normalizedBrief);
  const planResult = await createDailyPlan(context, {
    brandId: request.brandId ?? undefined,
    planDate: request.requestedDate?.toISOString(),
    channel: request.channel ?? undefined,
    language: typeof normalized.language === "string" ? normalized.language : undefined,
    source: request.source,
    autonomyMode: "APPROVAL",
  });
  await db.creativeRequest.update({
    where: { id: request.id },
    data: {
      dailyPlanId: planResult.plan.id,
      status: planResult.plan.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : "PLANNED",
    },
  });
  const plan = await getDailyPlan(context, planResult.plan.id);
  if (plan.status === "PLANNED") await runDailyPlan(context, plan.id);
  return {
    request: await db.creativeRequest.findUniqueOrThrow({ where: { id: request.id } }),
    plan: await getDailyPlan(context, plan.id),
    deduplicated: planResult.deduplicated,
  };
}

export async function listAutonomyPolicies(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.autonomyPolicy.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: [{ contentType: "asc" }, { version: "desc" }],
    include: { brand: { select: { id: true, name: true } } },
  });
}

export async function saveAutonomyPolicy(
  context: RequestContext,
  input: {
    id?: string;
    brandId?: string;
    contentType: string;
    channel: string;
    mode?: string;
    allowedTools?: string[];
    budgetCredits?: number;
    requiredApprovals?: string[];
    escalationRules?: Record<string, unknown>;
    approve?: boolean;
  },
) {
  const approve = input.approve === true;
  requireRole(context, approve ? "ADMIN" : "EDITOR");
  const selectedMode = mode(input.mode ?? "APPROVAL");
  if (selectedMode === "GUARDED_AUTOPUBLISH" && !approve)
    throw new ApiError(
      403,
      "POLICY_APPROVAL_REQUIRED",
      "Guarded autopublish policy changes require administrator approval.",
    );
  const brand = await resolveBrand(context, input.brandId);
  const latest = await db.autonomyPolicy.findFirst({
    where: {
      workspaceId: context.workspaceId,
      brandId: brand?.id ?? null,
      contentType: input.contentType.trim(),
      channel: input.channel.trim(),
    },
    orderBy: { version: "desc" },
  });
  const policy = await db.autonomyPolicy.create({
    data: {
      workspaceId: context.workspaceId,
      brandId: brand?.id,
      contentType: input.contentType.trim(),
      channel: input.channel.trim(),
      mode: selectedMode,
      allowedTools: json(
        input.allowedTools ?? defaultAutonomyPolicy(input.contentType, input.channel).allowedTools,
      ),
      budgetCredits:
        Number.isInteger(input.budgetCredits) && input.budgetCredits! > 0
          ? Math.min(10000, input.budgetCredits!)
          : 40,
      requiredApprovals: json(input.requiredApprovals ?? ["owner_or_reviewer"]),
      escalationRules: json(
        input.escalationRules ??
          defaultAutonomyPolicy(input.contentType, input.channel).escalationRules,
      ),
      version: (latest?.version ?? 0) + 1,
      status: approve ? "APPROVED" : "DRAFT",
      createdBy: context.userId,
      approvedBy: approve ? context.userId : undefined,
      approvedAt: approve ? new Date() : undefined,
    },
  });
  return policy;
}

export async function getAutonomyDefault(context: RequestContext) {
  requireRole(context, "VIEWER");
  return {
    mode: "APPROVAL",
    policy: defaultAutonomyPolicy("daily_batch", "dashboard"),
    note: "New workspaces start in Approval mode.",
  };
}
