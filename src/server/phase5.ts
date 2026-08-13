import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function safeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(secret|token|apikey|encryptedref|privatekey)/i.test(key))
      .map(([key, item]) => [key, stripSecrets(item)]),
  );
}

export async function createMarketplacePackage(
  context: RequestContext,
  input: {
    workflowVersionId: string;
    name: string;
    description: string;
    visibility: string;
    manifest: Record<string, unknown>;
    documentation?: Record<string, unknown>;
    costEstimate?: Record<string, unknown>;
  },
) {
  requireRole(context, "EDITOR");
  const version = await db.workflowVersion.findFirst({
    where: { id: input.workflowVersionId, template: { workspaceId: context.workspaceId } },
    include: { template: true },
  });
  if (!version)
    throw new ApiError(
      404,
      "WORKFLOW_VERSION_NOT_FOUND",
      "The workflow version was not found in this workspace.",
    );
  if (!["PRIVATE", "WORKSPACE", "PUBLIC"].includes(input.visibility))
    throw new ApiError(400, "INVALID_PACKAGE_VISIBILITY", "Unsupported package visibility.");
  const name = input.name.trim();
  const slug = safeSlug(name);
  if (!name || !slug) throw new ApiError(400, "INVALID_PACKAGE", "A package name is required.");
  const latest = await db.marketplacePackage.findFirst({
    where: { workspaceId: context.workspaceId, slug },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const pkg = await db.marketplacePackage.create({
    data: {
      workspaceId: context.workspaceId,
      workflowVersionId: version.id,
      name,
      slug,
      description: input.description.trim(),
      visibility: input.visibility,
      status: "DRAFT",
      manifest: json(stripSecrets(input.manifest)),
      documentation: json(stripSecrets(input.documentation ?? {})),
      costEstimate: json(stripSecrets(input.costEstimate ?? version.costFormula)),
      version: (latest?.version ?? 0) + 1,
      createdBy: context.userId,
    },
    include: { workflowVersion: { include: { template: true } } },
  });
  return pkg;
}

export async function listMarketplacePackages(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.marketplacePackage.findMany({
    where: {
      OR: [{ workspaceId: context.workspaceId }, { visibility: "PUBLIC", status: "PUBLISHED" }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      workflowVersion: {
        select: { version: true, template: { select: { name: true, category: true } } },
      },
      _count: { select: { installs: true, reviews: true } },
    },
  });
}

export async function publishMarketplacePackage(context: RequestContext, packageId: string) {
  requireRole(context, "ADMIN");
  const pkg = await db.marketplacePackage.findFirst({
    where: { id: packageId, workspaceId: context.workspaceId },
  });
  if (!pkg) throw new ApiError(404, "PACKAGE_NOT_FOUND", "The package was not found.");
  const manifest = object(pkg.manifest);
  if (
    Object.keys(manifest).some((key) => /(secret|token|apikey|encryptedref|privatekey)/i.test(key))
  )
    throw new ApiError(
      409,
      "PACKAGE_SECRET_LEAK",
      "A package cannot be published with provider secrets.",
    );
  const endpoint = process.env.MARKETPLACE_MODERATION_URL;
  if (!endpoint && process.env.NODE_ENV === "production")
    throw new ApiError(
      503,
      "MARKETPLACE_MODERATION_NOT_CONFIGURED",
      "Configure MARKETPLACE_MODERATION_URL before publishing a marketplace package.",
    );
  if (endpoint) {
    try {
      const response = await requestProvider<Record<string, unknown>>({
        provider: "marketplace-moderation",
        endpoint,
        idempotencyKey: `marketplace-moderation:${pkg.id}:${pkg.version}`,
        body: { packageId: pkg.id, manifest, documentation: pkg.documentation },
      });
      if (response.body.approved !== true)
        throw new ApiError(
          409,
          "MARKETPLACE_PACKAGE_NOT_APPROVED",
          "The marketplace moderation adapter did not approve this package.",
        );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw providerApiError(
        error,
        "MARKETPLACE_MODERATION_FAILED",
        "Marketplace moderation failed.",
      );
    }
  }
  return db.marketplacePackage.update({ where: { id: pkg.id }, data: { status: "PUBLISHED" } });
}

export async function installMarketplacePackage(
  context: RequestContext,
  packageId: string,
  alias?: string,
) {
  requireRole(context, "EDITOR");
  const pkg = await db.marketplacePackage.findUnique({
    where: { id: packageId },
    include: { workflowVersion: true, workspace: true },
  });
  if (
    !pkg ||
    pkg.status !== "PUBLISHED" ||
    (pkg.workspaceId !== context.workspaceId && pkg.visibility !== "PUBLIC")
  )
    throw new ApiError(404, "PACKAGE_NOT_FOUND", "The published package was not found.");
  const existing = await db.marketplaceInstall.findUnique({
    where: { workspaceId_packageId: { workspaceId: context.workspaceId, packageId: pkg.id } },
  });
  if (existing) return { install: existing, deduplicated: true };
  const created = await db.$transaction(async (tx) => {
    const template = await tx.workflowTemplate.create({
      data: {
        workspaceId: context.workspaceId,
        ownerId: context.userId,
        name: alias?.trim() || pkg.name,
        category: "marketplace",
        visibility: "PRIVATE",
      },
    });
    await tx.workflowVersion.create({
      data: {
        templateId: template.id,
        version: "1",
        graph: json(stripSecrets(pkg.workflowVersion.graph)),
        inputSchema: json(stripSecrets(pkg.workflowVersion.inputSchema)),
        permissions: json(stripSecrets(pkg.workflowVersion.permissions)),
        costFormula: json(stripSecrets(pkg.workflowVersion.costFormula)),
      },
    });
    return tx.marketplaceInstall.create({
      data: {
        workspaceId: context.workspaceId,
        packageId: pkg.id,
        alias: alias?.trim(),
        installedBy: context.userId,
      },
      include: { package: true },
    });
  });
  return { install: created, deduplicated: false };
}

export async function reviewMarketplacePackage(
  context: RequestContext,
  packageId: string,
  rating: number,
  comment?: string,
) {
  requireRole(context, "VIEWER");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new ApiError(400, "INVALID_RATING", "rating must be an integer from 1 to 5.");
  const pkg = await db.marketplacePackage.findFirst({
    where: {
      id: packageId,
      status: "PUBLISHED",
      OR: [{ workspaceId: context.workspaceId }, { visibility: "PUBLIC" }],
    },
    select: { id: true },
  });
  if (!pkg) throw new ApiError(404, "PACKAGE_NOT_FOUND", "The package was not found.");
  return db.marketplaceReview.upsert({
    where: {
      workspaceId_packageId_reviewerId: {
        workspaceId: context.workspaceId,
        packageId,
        reviewerId: context.userId,
      },
    },
    update: { rating, comment: comment?.trim() },
    create: {
      workspaceId: context.workspaceId,
      packageId,
      reviewerId: context.userId,
      rating,
      comment: comment?.trim(),
    },
  });
}

function safePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "INVALID_SOURCE_URL", "The source URL must be a valid HTTP(S) URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
    throw new ApiError(400, "UNSAFE_SOURCE_URL", "Only public HTTP(S) sources are permitted.");
  return url;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    );
  }
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicHost(url: URL) {
  try {
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address)))
      throw new Error("The source host resolves to a private or loopback address.");
  } catch {
    throw new ApiError(
      400,
      "UNSAFE_SOURCE_HOST",
      "The source host is not a resolvable public address.",
    );
  }
}

export async function createCompetitorSource(
  context: RequestContext,
  input: { url: string; sourceType?: string; terms?: string; consent?: Record<string, unknown> },
) {
  requireRole(context, "EDITOR");
  const url = safePublicUrl(input.url.trim());
  await assertPublicHost(url);
  if (input.consent?.customerAuthorized !== true)
    throw new ApiError(
      409,
      "SOURCE_CONSENT_REQUIRED",
      "Customer authorization is required before monitoring a source.",
    );
  return db.competitorSource.create({
    data: {
      workspaceId: context.workspaceId,
      url: url.toString(),
      sourceType: input.sourceType === "OFFICIAL_PUBLIC" ? "OFFICIAL_PUBLIC" : "CUSTOMER_PROVIDED",
      terms: input.terms?.trim(),
      consent: json(input.consent),
      createdBy: context.userId,
    },
  });
}

export async function listCompetitorSources(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.competitorSource.findMany({
    where: { workspaceId: context.workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { insights: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
}

export async function refreshCompetitorSource(context: RequestContext, sourceId: string) {
  requireRole(context, "EDITOR");
  const source = await db.competitorSource.findFirst({
    where: { id: sourceId, workspaceId: context.workspaceId, deletedAt: null },
  });
  if (!source) throw new ApiError(404, "SOURCE_NOT_FOUND", "The competitor source was not found.");
  await assertPublicHost(new URL(source.url));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(source.url, {
      headers: { "user-agent": "Autozentic-Permitted-Research/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const html = (await response.text()).slice(0, 1_000_000);
    const title =
      html
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/\s+/g, " ")
        .trim() || source.url;
    const contentHash = createHash("sha256").update(html).digest("hex");
    const retrievedAt = new Date();
    const insight = await db.$transaction(async (tx) => {
      await tx.competitorSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: retrievedAt, status: "ACTIVE" },
      });
      return tx.competitorInsight.create({
        data: {
          workspaceId: context.workspaceId,
          sourceId: source.id,
          title: `Permitted signal: ${title}`,
          summary:
            "Advisory source signal captured for human review; no derivative creative was generated automatically.",
          evidence: { url: source.url, title, contentHash, httpStatus: response.status },
          confidence: 0.5,
          retrievedAt,
        },
      });
    });
    return insight;
  } catch (error) {
    await db.competitorSource.update({ where: { id: source.id }, data: { status: "ERROR" } });
    throw new ApiError(
      502,
      "SOURCE_REFRESH_FAILED",
      error instanceof Error ? error.message : "The source could not be refreshed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteCompetitorSource(context: RequestContext, sourceId: string) {
  requireRole(context, "EDITOR");
  const source = await db.competitorSource.findFirst({
    where: { id: sourceId, workspaceId: context.workspaceId, deletedAt: null },
  });
  if (!source) throw new ApiError(404, "SOURCE_NOT_FOUND", "The competitor source was not found.");
  return db.$transaction(async (tx) => {
    await tx.competitorInsight.deleteMany({
      where: { sourceId: source.id, workspaceId: context.workspaceId },
    });
    return tx.competitorSource.update({
      where: { id: source.id },
      data: { deletedAt: new Date(), status: "DELETED" },
    });
  });
}

export async function getWhiteLabelConfig(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.whiteLabelConfig.findUnique({ where: { workspaceId: context.workspaceId } });
}
export async function updateWhiteLabelConfig(
  context: RequestContext,
  input: {
    displayName: string;
    portalSlug: string;
    customDomain?: string;
    supportEmail?: string;
    logoAssetId?: string;
    theme?: Record<string, unknown>;
    enabled?: boolean;
  },
) {
  requireRole(context, "ADMIN");
  const portalSlug = safeSlug(input.portalSlug);
  if (!input.displayName.trim() || !portalSlug)
    throw new ApiError(400, "INVALID_WHITE_LABEL", "displayName and portalSlug are required.");
  if (
    input.logoAssetId &&
    !(await db.asset.findFirst({
      where: { id: input.logoAssetId, workspaceId: context.workspaceId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "LOGO_NOT_FOUND", "The logo asset was not found in this workspace.");
  return db.whiteLabelConfig.upsert({
    where: { workspaceId: context.workspaceId },
    update: {
      displayName: input.displayName.trim(),
      portalSlug,
      customDomain: input.customDomain?.trim(),
      supportEmail: input.supportEmail?.trim(),
      logoAssetId: input.logoAssetId,
      theme: json(input.theme ?? {}),
      enabled: input.enabled === true,
    },
    create: {
      workspaceId: context.workspaceId,
      displayName: input.displayName.trim(),
      portalSlug,
      customDomain: input.customDomain?.trim(),
      supportEmail: input.supportEmail?.trim(),
      logoAssetId: input.logoAssetId,
      theme: json(input.theme ?? {}),
      enabled: input.enabled === true,
    },
  });
}

export async function getEnterpriseControl(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.enterpriseControl.findUnique({ where: { workspaceId: context.workspaceId } });
}
export async function updateEnterpriseControl(
  context: RequestContext,
  input: {
    dataRegion: string;
    retentionDays: number;
    auditExport: boolean;
    ssoRequired: boolean;
    ssoProvider?: string;
    ssoMetadata?: Record<string, unknown>;
  },
) {
  requireRole(context, "ADMIN");
  if (
    !/^[A-Z]{2}$/.test(input.dataRegion) ||
    !Number.isInteger(input.retentionDays) ||
    input.retentionDays < 1 ||
    input.retentionDays > 3650
  )
    throw new ApiError(
      400,
      "INVALID_ENTERPRISE_CONTROL",
      "dataRegion must be an ISO country code and retentionDays must be 1-3650.",
    );
  if (input.ssoRequired && !input.ssoProvider)
    throw new ApiError(
      400,
      "SSO_PROVIDER_REQUIRED",
      "ssoProvider is required when SSO is mandatory.",
    );
  return db.enterpriseControl.upsert({
    where: { workspaceId: context.workspaceId },
    update: {
      dataRegion: input.dataRegion,
      retentionDays: input.retentionDays,
      auditExport: input.auditExport,
      ssoRequired: input.ssoRequired,
      ssoProvider: input.ssoProvider?.trim(),
      ssoMetadata: json(input.ssoMetadata ?? {}),
      status: "ACTIVE",
    },
    create: {
      workspaceId: context.workspaceId,
      dataRegion: input.dataRegion,
      retentionDays: input.retentionDays,
      auditExport: input.auditExport,
      ssoRequired: input.ssoRequired,
      ssoProvider: input.ssoProvider?.trim(),
      ssoMetadata: json(input.ssoMetadata ?? {}),
      status: "ACTIVE",
    },
  });
}

export async function listCustomModelProjects(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.customModelProject.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      datasets: true,
      evaluations: { orderBy: { createdAt: "desc" }, take: 5 },
      releases: true,
    },
  });
}

export async function exportCustomModelProject(context: RequestContext, projectId: string) {
  requireRole(context, "VIEWER");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    include: { datasets: true, evaluations: true, releases: true },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    workspaceId: context.workspaceId,
    project,
  };
}
export async function createCustomModelProject(
  context: RequestContext,
  input: {
    name: string;
    purpose: string;
    provider: string;
    rightsEvidence: Record<string, unknown>;
    baselineSuiteId?: string;
  },
) {
  requireRole(context, "ADMIN");
  if (
    input.rightsEvidence.allAssetsLicensed !== true ||
    input.rightsEvidence.trainingConsent !== true
  )
    throw new ApiError(
      409,
      "MODEL_RIGHTS_REQUIRED",
      "Written asset rights and training consent are required before creating a custom model project.",
    );
  if (
    input.baselineSuiteId &&
    !(await db.benchmarkSuite.findFirst({
      where: { id: input.baselineSuiteId, workspaceId: context.workspaceId },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "BENCHMARK_NOT_FOUND", "The baseline benchmark was not found.");
  return db.customModelProject.create({
    data: {
      workspaceId: context.workspaceId,
      name: input.name.trim(),
      purpose: input.purpose.trim(),
      provider: input.provider.trim(),
      rightsEvidence: json(input.rightsEvidence),
      baselineSuiteId: input.baselineSuiteId,
      createdBy: context.userId,
    },
  });
}
export async function createCustomModelDataset(
  context: RequestContext,
  projectId: string,
  input: { assetIds: string[]; consent: Record<string, unknown> },
) {
  requireRole(context, "ADMIN");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId, status: { not: "DELETED" } },
    select: { id: true },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  if (input.consent.allAssetsLicensed !== true || input.consent.trainingConsent !== true)
    throw new ApiError(
      409,
      "MODEL_RIGHTS_REQUIRED",
      "Dataset rights and training consent are required.",
    );
  const ids = [...new Set(input.assetIds)];
  const assets = await db.asset.findMany({
    where: {
      workspaceId: context.workspaceId,
      id: { in: ids },
      deletedAt: null,
      status: { in: ["IMMUTABLE", "READY", "DERIVED"] },
    },
    select: { id: true, contentHash: true },
  });
  if (!ids.length || assets.length !== ids.length)
    throw new ApiError(
      409,
      "MODEL_DATASET_ASSET_INVALID",
      "Every dataset asset must be a verified asset in this workspace.",
    );
  const latest = await db.customModelDataset.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const hash = createHash("sha256")
    .update(
      assets
        .map((asset) => `${asset.id}:${asset.contentHash}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
  return db.customModelDataset.create({
    data: {
      workspaceId: context.workspaceId,
      projectId,
      version: (latest?.version ?? 0) + 1,
      assetIds: json(ids),
      consent: json(input.consent),
      hash,
      status: "APPROVED",
      createdBy: context.userId,
    },
  });
}
export async function evaluateCustomModel(
  context: RequestContext,
  projectId: string,
  input: {
    datasetId?: string;
    modelVersion: string;
    baselineScore: number;
    modelScore: number;
    unitCostMinor: number;
    metrics: Record<string, unknown>;
    maxCostMinor?: number;
  },
) {
  requireRole(context, "ADMIN");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  if (
    input.datasetId &&
    !(await db.customModelDataset.findFirst({
      where: { id: input.datasetId, projectId, workspaceId: context.workspaceId },
      select: { id: true },
    }))
  )
    throw new ApiError(404, "MODEL_DATASET_NOT_FOUND", "The model dataset was not found.");
  if (
    ![input.baselineScore, input.modelScore].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    ) ||
    !Number.isInteger(input.unitCostMinor) ||
    input.unitCostMinor < 0
  )
    throw new ApiError(
      400,
      "INVALID_MODEL_EVALUATION",
      "Scores must be between 0 and 1 and unit cost must be non-negative.",
    );
  const passed =
    input.modelScore > input.baselineScore &&
    (input.maxCostMinor === undefined || input.unitCostMinor <= input.maxCostMinor);
  return db.customModelEvaluation.create({
    data: {
      workspaceId: context.workspaceId,
      projectId,
      datasetId: input.datasetId,
      modelVersion: input.modelVersion.trim(),
      baselineScore: input.baselineScore,
      modelScore: input.modelScore,
      unitCostMinor: input.unitCostMinor,
      metrics: json({ ...input.metrics, maxCostMinor: input.maxCostMinor, passed }),
      passed,
    },
  });
}
export async function releaseCustomModel(
  context: RequestContext,
  projectId: string,
  input: { modelVersion: string; evaluationId: string; providerRef?: string },
) {
  requireRole(context, "ADMIN");
  const modelVersion = input.modelVersion.trim();
  if (!modelVersion) throw new ApiError(400, "INVALID_MODEL_RELEASE", "modelVersion is required.");
  const evaluation = await db.customModelEvaluation.findFirst({
    where: { id: input.evaluationId, projectId, workspaceId: context.workspaceId, passed: true },
  });
  if (!evaluation)
    throw new ApiError(
      409,
      "MODEL_EVALUATION_FAILED",
      "A passing evaluation is required before release.",
    );
  if (evaluation.modelVersion !== modelVersion)
    throw new ApiError(
      409,
      "MODEL_EVALUATION_VERSION_MISMATCH",
      "The passing evaluation must match the model version being released.",
    );
  await db.customModelRelease.updateMany({
    where: { projectId, workspaceId: context.workspaceId, status: "ACTIVE" },
    data: { status: "ROLLED_BACK" },
  });
  return db.customModelRelease.upsert({
    where: { projectId_modelVersion: { projectId, modelVersion } },
    update: {
      status: "ACTIVE",
      evaluationId: evaluation.id,
      providerRef: input.providerRef?.trim(),
    },
    create: {
      workspaceId: context.workspaceId,
      projectId,
      modelVersion,
      status: "ACTIVE",
      evaluationId: evaluation.id,
      providerRef: input.providerRef?.trim(),
    },
  });
}
export async function disableCustomModel(context: RequestContext, projectId: string) {
  requireRole(context, "ADMIN");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  await db.customModelRelease.updateMany({
    where: { projectId: project.id, workspaceId: context.workspaceId, status: "ACTIVE" },
    data: { status: "DISABLED" },
  });
  return db.customModelProject.update({
    where: { id: project.id },
    data: { status: "DISABLED" },
  });
}

export async function deleteCustomModelProject(context: RequestContext, projectId: string) {
  requireRole(context, "ADMIN");
  const project = await db.customModelProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!project)
    throw new ApiError(404, "MODEL_PROJECT_NOT_FOUND", "The custom model project was not found.");
  const deleted = await db.$transaction(async (tx) => {
    await tx.customModelRelease.updateMany({
      where: { projectId: project.id, workspaceId: context.workspaceId },
      data: { status: "DISABLED" },
    });
    await tx.customModelDataset.updateMany({
      where: { projectId: project.id, workspaceId: context.workspaceId },
      data: { status: "DELETED" },
    });
    return tx.customModelProject.update({
      where: { id: project.id },
      data: { status: "DELETED", deletionRequestedAt: new Date() },
    });
  });
  await db.auditEvent.create({
    data: {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "custom_model.deleted",
      targetType: "custom_model_project",
      targetId: project.id,
      correlationId: context.correlationId,
      metadata: { datasetsMarkedDeleted: true, releasesDisabled: true },
    },
  });
  return deleted;
}
