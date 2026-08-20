import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function latestFacts(
  facts: Array<{
    field: string;
    version: number;
    state: string;
    value: unknown;
    source: string;
    confirmedAt: Date | null;
    expiresAt: Date | null;
  }>,
) {
  const result = new Map<string, (typeof facts)[number]>();
  for (const fact of facts) {
    const current = result.get(fact.field);
    if (!current || fact.version > current.version) result.set(fact.field, fact);
  }
  return [...result.values()];
}

function isPositiveState(state: string) {
  return ["LOCKED", "VERIFIED", "CONFIRMED", "SELECTED", "DRAFT"].includes(state);
}

function cleanStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ");
}

async function ensureAggregates(context: RequestContext) {
  const briefs = await db.campaignBrief.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
  });
  const existing = await db.campaign.findMany({
    where: { workspaceId: context.workspaceId },
    select: { briefId: true },
  });
  const known = new Set(existing.map((item) => item.briefId));
  for (const brief of briefs) {
    if (known.has(brief.id)) continue;
    await db.campaign.create({
      data: {
        workspaceId: context.workspaceId,
        briefId: brief.id,
        name: brief.name,
        objective: brief.objective,
        status: brief.status,
        lifecycleStatus: "NEEDS_INPUT",
        briefSnapshot: json({
          name: brief.name,
          objective: brief.objective,
          offer: brief.offer,
          productIds: brief.productIds,
          audience: brief.audience,
          legalCopy: brief.legalCopy,
          channels: brief.channels,
        }),
        brandSnapshot: brief.brandId ? json({ brandId: brief.brandId }) : undefined,
        createdBy: brief.createdBy,
      },
    });
  }
}

async function campaignRows(context: RequestContext) {
  await ensureAggregates(context);
  return db.campaign.findMany({
    where: { workspaceId: context.workspaceId },
    include: {
      brief: true,
      facts: { orderBy: [{ field: "asc" }, { version: "desc" }] },
      directions: { orderBy: { position: "asc" } },
      passports: { where: { outputAssetId: null }, orderBy: { computedAt: "desc" }, take: 1 },
      revisions: { orderBy: { createdAt: "desc" }, take: 20 },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      deliveryRules: { orderBy: { updatedAt: "desc" }, take: 10 },
      ugcProjects: { orderBy: { updatedAt: "desc" }, take: 10 },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function computeCampaignPassport(context: RequestContext, campaignId: string) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    include: {
      brief: true,
      facts: { orderBy: [{ field: "asc" }, { version: "desc" }] },
      directions: { orderBy: { position: "asc" } },
    },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");

  const [outputs, reviews] = await Promise.all([
    db.outputAsset.findMany({
      where: { workspaceId: context.workspaceId, campaignId },
      select: {
        id: true,
        name: true,
        format: true,
        locale: true,
        status: true,
        metadata: true,
        qualityScores: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.reviewTask.findMany({
      where: { workspaceId: context.workspaceId, campaignId },
      select: { id: true, status: true, decision: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);
  const facts = latestFacts(campaign.facts);
  const brief = campaign.brief;
  const productIds = strings(brief.productIds);
  const products = productIds.length
    ? await db.product.findMany({
        where: { workspaceId: context.workspaceId, id: { in: productIds }, deletedAt: null },
        select: { id: true, sku: true, title: true, sourceAssetIds: true, lockMode: true },
      })
    : [];
  const sourceIds = products.flatMap((product) => strings(product.sourceAssetIds));
  const sources = sourceIds.length
    ? await db.asset.findMany({
        where: { workspaceId: context.workspaceId, id: { in: sourceIds }, deletedAt: null },
        select: { id: true, name: true, status: true, mimeType: true, contentHash: true },
      })
    : [];
  const brand = brief.brandId
    ? await db.brand.findFirst({
        where: { id: brief.brandId, workspaceId: context.workspaceId },
        select: { id: true, name: true, version: true, approvalStatus: true },
      })
    : await db.brand.findFirst({
        where: { workspaceId: context.workspaceId, approvalStatus: "APPROVED" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, version: true, approvalStatus: true },
      });

  const offer = record(brief.offer);
  const offerFact = facts.find((fact) => fact.field === "offer");
  const offerDateFact = facts.find((fact) => fact.field === "offerEndDate");
  const productPass =
    products.length === productIds.length &&
    products.every((product) => {
      const ids = strings(product.sourceAssetIds);
      return (
        ids.length > 0 &&
        ids.every((id) =>
          sources.some(
            (source) =>
              source.id === id && ["READY", "IMMUTABLE", "DERIVED"].includes(source.status),
          ),
        )
      );
    });
  const offerApplicable = Object.keys(offer).length > 0;
  const offerPass =
    !offerApplicable ||
    (Boolean(offerFact && isPositiveState(offerFact.state)) &&
      Boolean(offerDateFact && isPositiveState(offerDateFact.state)) &&
      (!offerDateFact?.expiresAt || offerDateFact.expiresAt > new Date()));
  const brandPass = Boolean(brand && brand.approvalStatus === "APPROVED");
  const platformPass = strings(brief.channels).length > 0;
  const rightsPass =
    sources.length === sourceIds.length &&
    sources.every(
      (source) => !["QUARANTINED", "UPLOADING", "SOFT_DELETED"].includes(source.status),
    );
  const productFact = facts.find((fact) => fact.field === "product");
  const productFactPass = Boolean(productFact && isPositiveState(productFact.state));
  const directionPass = campaign.directions.length > 0;
  const outputPass = outputs.length > 0;
  const qaPass =
    outputPass &&
    outputs.every((output) => {
      const quality = record(output.qualityScores);
      const metadata = record(output.metadata);
      const safety = record(metadata.outputSafety);
      const checks = Object.values(quality);
      const safetyChecks = Object.values(safety);
      return (
        checks.length > 0 &&
        !checks.some((check) => record(check).verdict === "critical") &&
        !safetyChecks.some((check) => record(check).status === "BLOCKED")
      );
    });
  const templatePass =
    outputPass &&
    outputs.every((output) => {
      const metadata = record(output.metadata);
      return Boolean(metadata.templateVersion || metadata.workflowNode || metadata.provider);
    });
  const copyPass = directionPass && outputPass;
  const requestedLanguage = String(record(brief.audience).language ?? "").toLowerCase();
  const localizationPass =
    !requestedLanguage ||
    requestedLanguage === "english" ||
    outputs.some((output) => Boolean(output.locale));
  const reviewStatus = reviews[0]?.status ?? "PENDING";
  const allPass =
    productPass &&
    productFactPass &&
    offerPass &&
    brandPass &&
    platformPass &&
    rightsPass &&
    directionPass &&
    outputPass &&
    qaPass &&
    templatePass &&
    copyPass &&
    localizationPass;
  const evidence = {
    product: {
      state:
        productPass && productFactPass ? "pass" : productIds.length ? "blocked" : "needs_input",
      label: products.length
        ? `${products.map((product) => `${product.title} · ${product.sku}`).join(", ")} · source fact ${productFactPass ? "confirmed" : "needs confirmation"}`
        : "Select a verified product",
      source: sources.map((source) => ({
        id: source.id,
        name: source.name,
        status: source.status,
      })),
    },
    offer: {
      state: offerPass ? (offerApplicable ? "pass" : "not_applicable") : "needs_input",
      label: offerApplicable ? JSON.stringify(offer) : "No promotion attached",
      source: offerFact?.source ?? "campaign brief",
    },
    brand: {
      state: brandPass ? "pass" : "needs_input",
      label: brand ? `${brand.name} · v${brand.version}` : "Approve a Brand Brain version",
      source: brand?.id ?? "none",
    },
    copy: {
      state: copyPass ? "pass" : "needs_input",
      label: copyPass
        ? "Selected direction copy and output metadata are attached"
        : "Select a direction and produce an output",
      source: campaign.selectedDirectionId ?? "campaign brief",
    },
    platform: {
      state: platformPass ? "pass" : "needs_input",
      label: strings(brief.channels).join(" · ") || "Choose at least one channel",
      source: "campaign brief",
    },
    rights: {
      state: rightsPass ? "pass" : "blocked",
      label: rightsPass
        ? "Source assets are not quarantined"
        : "A source asset needs scanning or completion",
      source: sources.map((source) => source.contentHash),
    },
    output: {
      state: outputPass ? "pass" : "needs_input",
      label: outputPass
        ? `${outputs.length} output version${outputs.length === 1 ? "" : "s"} attached`
        : "No generated output is attached",
      source: outputs.map((output) => output.id),
      versions: outputs.map((output) => ({
        id: output.id,
        name: output.name,
        format: output.format,
        locale: output.locale ?? "master",
        status: output.status,
        quality: record(output.qualityScores),
        metadata: record(output.metadata),
      })),
    },
    quality: {
      state: qaPass ? "pass" : "blocked",
      label: qaPass
        ? "QA and safety evidence passed"
        : "QA evidence is missing or contains a blocking result",
      source: outputs.map((output) => output.id),
    },
    template: {
      state: templatePass ? "pass" : "needs_input",
      label: templatePass
        ? "Versioned render metadata attached"
        : "A versioned template/render record is required",
      source: outputs.map(
        (output) =>
          record(output.metadata).templateVersion ?? record(output.metadata).workflowNode ?? "none",
      ),
    },
    review: {
      state: reviewStatus === "APPROVED" ? "pass" : "needs_review",
      label:
        reviewStatus === "APPROVED"
          ? "Human approval recorded"
          : "Human approval is still required before publish",
      source: reviews[0]?.id ?? "review inbox",
    },
    localization: {
      state: localizationPass ? "pass" : "needs_input",
      label: localizationPass
        ? "Locale outputs are attached or localization is not required"
        : "Localized output QA is required",
      source: outputs.map((output) => output.locale ?? "master"),
    },
    facts: facts.map((fact) => ({
      field: fact.field,
      state: fact.state,
      source: fact.source,
      version: fact.version,
      confirmedAt: fact.confirmedAt,
      expiresAt: fact.expiresAt,
    })),
  };
  const status = allPass ? "READY" : productIds.length && brandPass ? "NEEDS_REVIEW" : "BLOCKED";
  const previous = await db.creativePassport.findFirst({
    where: { workspaceId: context.workspaceId, campaignId, outputAssetId: null },
    orderBy: { computedAt: "desc" },
  });
  if (
    previous &&
    JSON.stringify(previous.evidence) === JSON.stringify(evidence) &&
    previous.status === status
  ) {
    const linkedOutputs = outputs.length
      ? await db.creativePassport.count({
          where: {
            workspaceId: context.workspaceId,
            campaignId,
            outputAssetId: { in: outputs.map((output) => output.id) },
          },
        })
      : outputs.length;
    if (linkedOutputs >= outputs.length) return previous;
  }
  const passport = await db.creativePassport.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      status,
      version: (previous?.version ?? 0) + 1,
      evidence: json(evidence),
    },
  });
  if (outputs.length) {
    await db.creativePassport.createMany({
      data: outputs.map((output) => ({
        workspaceId: context.workspaceId,
        campaignId,
        outputAssetId: output.id,
        status,
        version: passport.version,
        evidence: json({
          scope: "output",
          output: {
            id: output.id,
            name: output.name,
            format: output.format,
            locale: output.locale ?? "master",
            status: output.status,
            quality: record(output.qualityScores),
            metadata: record(output.metadata),
          },
          campaignPassportId: passport.id,
          campaignEvidence: evidence,
        }),
      })),
    });
  }
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      lifecycleStatus:
        status === "READY"
          ? "READY_FOR_REVIEW"
          : status === "BLOCKED"
            ? "NEEDS_INPUT"
            : "READY_FOR_REVIEW",
    },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "PASSPORT_COMPUTED",
      message: `Creative Passport v${passport.version} computed: ${status.toLowerCase().replace(/_/g, " ")}.`,
      actorId: "system",
      payload: json({ passportId: passport.id, status, outputCount: outputs.length }),
    },
  });
  return passport;
}

async function enrichCampaign(
  context: RequestContext,
  campaign: Awaited<ReturnType<typeof campaignRows>>[number],
) {
  const [runs, reviews, outputs, publishJobs, passport] = await Promise.all([
    db.workflowRun.findMany({
      where: { workspaceId: context.workspaceId, campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        state: true,
        quoteSnapshot: true,
        actualUnits: true,
        reservedUnits: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.reviewTask.findMany({
      where: { workspaceId: context.workspaceId, campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        runId: true,
        status: true,
        title: true,
        deadline: true,
        decision: true,
        updatedAt: true,
      },
    }),
    db.outputAsset.findMany({
      where: { workspaceId: context.workspaceId, campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        format: true,
        locale: true,
        status: true,
        metadata: true,
        qualityScores: true,
        createdAt: true,
      },
    }),
    db.publishJob.findMany({
      where: { workspaceId: context.workspaceId, campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        platform: true,
        status: true,
        destination: true,
        receipt: true,
        error: true,
        updatedAt: true,
      },
    }),
    computeCampaignPassport(context, campaign.id),
  ]);
  const currentStatus = publishJobs.some((job) =>
    ["PUBLISHED", "published", "SUCCESS", "success"].includes(job.status),
  )
    ? "PUBLISHED"
    : publishJobs.some((job) => ["QUEUED", "SCHEDULED", "queued", "scheduled"].includes(job.status))
      ? "SCHEDULED"
      : reviews.some((review) => ["APPROVED", "approved"].includes(review.status))
        ? "APPROVED"
        : passport.status === "READY"
          ? "READY_FOR_REVIEW"
          : "NEEDS_INPUT";
  return {
    ...campaign,
    lifecycleStatus: currentStatus,
    statusLabel: cleanStatus(currentStatus),
    runs,
    reviews,
    outputs,
    publishJobs,
    passport,
    directions: campaign.directions,
    events: campaign.events,
    deliveryRules: campaign.deliveryRules,
    ugcProjects: campaign.ugcProjects,
    latestEvent: campaign.events[0] ?? null,
  };
}

export async function listCampaignAggregates(context: RequestContext) {
  requireRole(context, "VIEWER");
  const rows = await campaignRows(context);
  return Promise.all(rows.map((row) => enrichCampaign(context, row)));
}

export async function getCampaignAggregate(context: RequestContext, campaignId: string) {
  requireRole(context, "VIEWER");
  const row = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    include: {
      brief: true,
      facts: { orderBy: [{ field: "asc" }, { version: "desc" }] },
      directions: { orderBy: { position: "asc" } },
      passports: { where: { outputAssetId: null }, orderBy: { computedAt: "desc" }, take: 1 },
      revisions: { orderBy: { createdAt: "desc" }, take: 50 },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      deliveryRules: { orderBy: { updatedAt: "desc" }, take: 20 },
      ugcProjects: { orderBy: { updatedAt: "desc" }, take: 20 },
    },
  });
  if (!row) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  return enrichCampaign(context, row);
}

export async function createCampaignFacts(
  context: RequestContext,
  campaignId: string,
  input: Array<{
    field: string;
    value: unknown;
    source?: string;
    state?: string;
    expiresAt?: string;
  }>,
) {
  requireRole(context, "EDITOR");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  const created = [];
  for (const item of input) {
    const field = item.field.trim();
    if (!field) continue;
    const current = await db.campaignFact.findMany({
      where: { campaignId, field },
      orderBy: { version: "desc" },
      take: 1,
    });
    const version = (current[0]?.version ?? 0) + 1;
    created.push(
      await db.campaignFact.create({
        data: {
          workspaceId: context.workspaceId,
          campaignId,
          field,
          value: json(item.value),
          source: item.source?.trim() || "workspace confirmation",
          state: item.state?.trim() || "NEEDS_CONFIRMATION",
          lockPolicy: ["product", "offer", "offerEndDate", "claim"].includes(field)
            ? "CONFIRM_BEFORE_USE"
            : "FLEXIBLE",
          confirmedBy:
            item.state && ["LOCKED", "VERIFIED", "CONFIRMED"].includes(item.state)
              ? context.userId
              : undefined,
          confirmedAt:
            item.state && ["LOCKED", "VERIFIED", "CONFIRMED"].includes(item.state)
              ? new Date()
              : undefined,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
          version,
        },
      }),
    );
  }
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "FACTS_UPDATED",
      message: `${created.length} campaign fact${created.length === 1 ? "" : "s"} updated.`,
      actorId: context.userId,
      payload: json({ fields: created.map((fact) => fact.field) }),
    },
  });
  return { facts: created, passport: await computeCampaignPassport(context, campaignId) };
}

export async function createCampaignDirections(context: RequestContext, campaignId: string) {
  requireRole(context, "EDITOR");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    include: { brief: true, directions: { orderBy: { position: "asc" } } },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  if (campaign.directions.length) return campaign.directions;

  const legalCopy = record(campaign.brief.legalCopy);
  const formats = strings(legalCopy.formats).length
    ? strings(legalCopy.formats)
    : ["1:1", "4:5", "9:16", "16:9"];
  const productIds = strings(campaign.brief.productIds);
  const product = productIds.length
    ? await db.product.findFirst({
        where: { id: productIds[0], workspaceId: context.workspaceId, deletedAt: null },
        select: { title: true, sku: true },
      })
    : null;
  const offer = record(campaign.brief.offer);
  const productLabel = product ? `${product.title} · ${product.sku}` : "verified product";
  const offerLabel =
    typeof offer.text === "string" && offer.text.trim() ? offer.text : "Shop the collection";
  const templates = [
    {
      name: "Proof first",
      route: "proof",
      promise: "Make the verified product the hero.",
      visual: "Clean catalogue composition with product proof and restrained supporting copy.",
      headline: `${product?.title ?? "Your product"}, exactly as it is`,
      body: `See the details of ${productLabel} with a clear, trustworthy product-first frame.`,
    },
    {
      name: "Premium lifestyle",
      route: "lifestyle",
      promise: "Show the product in the customer’s real-life context.",
      visual: "Warm lifestyle scene with the source product preserved and the message kept short.",
      headline: `Make room for ${product?.title ?? "better living"}`,
      body: `A considered scene for ${productLabel}, with the verified product remaining the source of truth.`,
    },
    {
      name: offerLabel === "Shop the collection" ? "Founder proof" : "Offer urgency",
      route: offerLabel === "Shop the collection" ? "proof" : "urgency",
      promise:
        offerLabel === "Shop the collection"
          ? "Lead with a useful reason to believe."
          : "Create urgency without changing the verified offer.",
      visual:
        offerLabel === "Shop the collection"
          ? "Product demonstration route with a clear proof point and owner-review copy."
          : "High-contrast offer treatment with price/expiry sourced from Truth Lock.",
      headline: offerLabel === "Shop the collection" ? "A better choice, made clear" : offerLabel,
      body:
        offerLabel === "Shop the collection"
          ? `A proof-led story for ${productLabel}.`
          : `${offerLabel} · final expiry and claim review stays human-approved.`,
    },
  ];
  const directions = await db.$transaction(
    templates.map((template, index) =>
      db.campaignDirection.create({
        data: {
          workspaceId: context.workspaceId,
          campaignId,
          position: index + 1,
          name: template.name,
          route: template.route,
          promise: template.promise,
          visual: template.visual,
          copy: json({
            headline: template.headline,
            body: template.body,
            cta: typeof legalCopy.cta === "string" ? legalCopy.cta : "Shop now",
            hashtags: ["#newarrival", "#homestyle"],
            altText: `${template.name}: ${productLabel}`,
          }),
          formats: json(formats),
        },
      }),
    ),
  );
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      directionSnapshot: json(
        directions.map((direction) => ({
          id: direction.id,
          position: direction.position,
          name: direction.name,
          route: direction.route,
          promise: direction.promise,
          visual: direction.visual,
          copy: direction.copy,
          formats: direction.formats,
        })),
      ),
    },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "DIRECTIONS_CREATED",
      message: "Three decision-sized creative directions are ready for selection.",
      actorId: context.userId,
      payload: json({ directionIds: directions.map((direction) => direction.id) }),
    },
  });
  return directions;
}

export async function selectCampaignDirection(
  context: RequestContext,
  campaignId: string,
  directionId: string,
) {
  requireRole(context, "EDITOR");
  const direction = await db.campaignDirection.findFirst({
    where: { id: directionId, campaignId, workspaceId: context.workspaceId },
  });
  if (!direction)
    throw new ApiError(
      404,
      "DIRECTION_NOT_FOUND",
      "The selected creative direction was not found.",
    );
  await db.$transaction([
    db.campaignDirection.updateMany({
      where: { campaignId, workspaceId: context.workspaceId },
      data: { status: "PROPOSED", selectedAt: null },
    }),
    db.campaignDirection.update({
      where: { id: direction.id },
      data: { status: "SELECTED", selectedAt: new Date() },
    }),
    db.campaign.update({
      where: { id: campaignId },
      data: { selectedDirectionId: direction.id },
    }),
    db.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        kind: "DIRECTION_SELECTED",
        message: `${direction.name} was selected for production.`,
        actorId: context.userId,
        payload: json({ directionId: direction.id, position: direction.position }),
      },
    }),
  ]);
  return getCampaignAggregate(context, campaignId);
}

export async function listCampaignEvents(context: RequestContext, campaignId: string) {
  requireRole(context, "VIEWER");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  return db.campaignEvent.findMany({
    where: { workspaceId: context.workspaceId, campaignId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function createDeliveryRule(
  context: RequestContext,
  campaignId: string,
  input: {
    what: string;
    source: Record<string, unknown>;
    maxCostMinor?: number;
    approvalMode?: string;
    schedule?: Record<string, unknown>;
    fallback?: string;
  },
) {
  requireRole(context, "EDITOR");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  const what = input.what.trim();
  if (!what)
    throw new ApiError(
      400,
      "INVALID_DELIVERY_RULE",
      "A delivery rule needs a plain-language purpose.",
    );
  const rule = await db.deliveryRule.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      what,
      source: json(input.source),
      maxCostMinor:
        typeof input.maxCostMinor === "number"
          ? Math.max(0, Math.floor(input.maxCostMinor))
          : undefined,
      approvalMode: input.approvalMode?.trim() || "APPROVAL",
      schedule: input.schedule ? json(input.schedule) : undefined,
      fallback: input.fallback?.trim() || "Pause and ask for approval",
    },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "DELIVERY_RULE_CREATED",
      message: `Automation rule added: ${what}.`,
      actorId: context.userId,
      payload: json({ ruleId: rule.id, approvalMode: rule.approvalMode }),
    },
  });
  return rule;
}

export async function updateDeliveryRule(
  context: RequestContext,
  campaignId: string,
  ruleId: string,
  input: { paused?: boolean; maxCostMinor?: number; approvalMode?: string; fallback?: string },
) {
  requireRole(context, "EDITOR");
  const existing = await db.deliveryRule.findFirst({
    where: { id: ruleId, campaignId, workspaceId: context.workspaceId },
  });
  if (!existing)
    throw new ApiError(404, "DELIVERY_RULE_NOT_FOUND", "The delivery rule was not found.");
  const rule = await db.deliveryRule.update({
    where: { id: existing.id },
    data: {
      paused: input.paused,
      maxCostMinor:
        typeof input.maxCostMinor === "number"
          ? Math.max(0, Math.floor(input.maxCostMinor))
          : undefined,
      approvalMode: input.approvalMode?.trim() || undefined,
      fallback: input.fallback?.trim() || undefined,
    },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "DELIVERY_RULE_UPDATED",
      message: `Automation rule ${rule.paused ? "paused" : "updated"}.`,
      actorId: context.userId,
      payload: json({ ruleId: rule.id, paused: rule.paused }),
    },
  });
  return rule;
}

export async function createRevisionRequest(
  context: RequestContext,
  campaignId: string,
  input: {
    scope: string;
    intent: string;
    targetAssetId?: string;
    targetFrame?: string;
    affectedFields: string[];
    parentVersion: string;
  },
) {
  requireRole(context, "EDITOR");
  const allowed = [
    "COPY_ONLY",
    "LAYOUT_ONLY",
    "FORMAT_ONLY",
    "VISUAL_ONLY",
    "COMPLETE_RECONCEPT",
    "FACT_CHANGE",
  ];
  if (!allowed.includes(input.scope))
    throw new ApiError(400, "INVALID_REVISION_SCOPE", "Choose a supported revision scope.");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The campaign was not found.");
  const revision = await db.revisionRequest.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      targetAssetId: input.targetAssetId,
      targetFrame: input.targetFrame,
      scope: input.scope,
      intent: input.intent.trim(),
      affectedFields: json(input.affectedFields),
      validationImpacts: json(
        input.scope === "FACT_CHANGE"
          ? ["truth_lock", "passport", "approval"]
          : ["passport", "approval"],
      ),
      parentVersion: input.parentVersion,
      changePlan: json({
        preserves:
          input.scope === "COPY_ONLY" ? ["product", "background", "price"] : ["locked facts"],
        requires: ["re-run affected checks"],
      }),
      requestedBy: context.userId,
    },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "REVISION_REQUESTED",
      message: `A ${input.scope.toLowerCase().replace(/_/g, " ")} change was requested.`,
      actorId: context.userId,
      payload: json({ revisionId: revision.id, scope: input.scope }),
    },
  });
  return revision;
}

export async function attachCampaignToRun(
  context: RequestContext,
  runId: string,
  campaignId: string,
) {
  requireRole(context, "EDITOR");
  const [run, campaign] = await Promise.all([
    db.workflowRun.findFirst({
      where: { id: runId, workspaceId: context.workspaceId },
      include: { workflowVersion: { select: { id: true, version: true, templateId: true } } },
    }),
    db.campaign.findFirst({ where: { id: campaignId, workspaceId: context.workspaceId } }),
  ]);
  if (!run || !campaign)
    throw new ApiError(404, "CAMPAIGN_RUN_NOT_FOUND", "The campaign or run was not found.");
  await db.workflowRun.update({ where: { id: runId }, data: { campaignId } });
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      templateSnapshot: json({
        workflowVersionId: run.workflowVersion.id,
        workflowVersion: run.workflowVersion.version,
        templateId: run.workflowVersion.templateId,
      }),
    },
  });
  await db.outputAsset.updateMany({
    where: { runId, workspaceId: context.workspaceId },
    data: { campaignId },
  });
  await db.reviewTask.updateMany({
    where: { runId, workspaceId: context.workspaceId },
    data: { campaignId },
  });
  await db.campaignEvent.create({
    data: {
      workspaceId: context.workspaceId,
      campaignId,
      kind: "RUN_ATTACHED",
      message: `Production run ${run.title} is now part of this campaign.`,
      actorId: context.userId,
      payload: json({ runId }),
    },
  });
  return getCampaignAggregate(context, campaignId);
}
