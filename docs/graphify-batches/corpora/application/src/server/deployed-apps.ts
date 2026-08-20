import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { createRun, failRunInternal } from "./workflow-service";
import { enqueueWorkflowRun } from "./queue";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function safeApp(app: { publicKeyHash?: string | null; [key: string]: unknown }) {
  const { publicKeyHash: _publicKeyHash, ...value } = app;
  return value;
}

function majorVersion(version: string) {
  const match = version.match(/v?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

export async function createDeployedApp(
  context: RequestContext,
  input: {
    templateId: string;
    versionId: string;
    name: string;
    slug?: string;
    inputSchema?: unknown;
    approvalPolicy?: unknown;
  },
) {
  requireRole(context, "STRATEGIST");
  const template = await db.workflowTemplate.findFirst({
    where: { id: input.templateId, workspaceId: context.workspaceId },
    include: { versions: { where: { id: input.versionId } } },
  });
  const version = template?.versions[0];
  if (!template || !version)
    throw new ApiError(
      404,
      "WORKFLOW_VERSION_NOT_FOUND",
      "The workflow version is not in this workspace.",
    );
  if (
    template.publishedVersion === null ||
    template.publishedVersion !== majorVersion(version.version)
  )
    throw new ApiError(
      409,
      "WORKFLOW_NOT_PUBLISHED",
      "Only the currently published workflow version can be deployed.",
    );
  const name = input.name.trim();
  const slug = (
    input.slug?.trim() ||
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomBytes(3).toString("hex")}`
  ).replace(/^-+|-+$/g, "");
  if (!name || !slug)
    throw new ApiError(400, "INVALID_DEPLOYED_APP", "name and slug are required.");
  const publicKey = randomBytes(32).toString("base64url");
  try {
    const app = await db.deployedApp.create({
      data: {
        workspaceId: context.workspaceId,
        templateId: template.id,
        versionId: version.id,
        createdBy: context.userId,
        name,
        slug,
        publicKeyHash: createHash("sha256").update(publicKey).digest("hex"),
        inputSchema: json(input.inputSchema ?? version.inputSchema),
        approvalPolicy: json(
          input.approvalPolicy ?? { required: true, roles: ["EDITOR", "REVIEWER"] },
        ),
      },
    });
    await db.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "deployed_app.created",
        targetType: "deployed_app",
        targetId: app.id,
        correlationId: context.correlationId,
        metadata: { slug: app.slug, versionId: version.id },
      },
    });
    return { app: safeApp(app), publicKey };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new ApiError(409, "DEPLOYED_APP_EXISTS", "That deployed app slug already exists.");
    throw error;
  }
}

export async function listDeployedApps(context: RequestContext) {
  const apps = await db.deployedApp.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    include: { template: { select: { name: true } }, version: { select: { version: true } } },
  });
  return apps.map((app) => safeApp(app));
}

export async function updateDeployedApp(
  context: RequestContext,
  appId: string,
  patch: { status?: string; versionId?: string },
) {
  requireRole(context, "STRATEGIST");
  if (patch.status !== undefined && !["ENABLED", "DISABLED"].includes(patch.status))
    throw new ApiError(400, "INVALID_DEPLOYED_APP_STATUS", "status must be ENABLED or DISABLED.");
  const app = await db.deployedApp.findFirst({
    where: { id: appId, workspaceId: context.workspaceId },
    include: { template: true },
  });
  if (!app) throw new ApiError(404, "DEPLOYED_APP_NOT_FOUND", "The deployed app was not found.");
  if (patch.versionId !== undefined) {
    const version = await db.workflowVersion.findFirst({
      where: { id: patch.versionId, templateId: app.templateId },
      select: { id: true, version: true },
    });
    if (!version)
      throw new ApiError(404, "WORKFLOW_VERSION_NOT_FOUND", "The workflow version was not found.");
    if (
      app.template.publishedVersion === null ||
      majorVersion(version.version) !== app.template.publishedVersion
    )
      throw new ApiError(
        409,
        "WORKFLOW_NOT_PUBLISHED",
        "Only a currently published workflow version can be assigned to a deployed app.",
      );
  }
  const updated = await db.deployedApp.update({
    where: { id: app.id },
    data: { status: patch.status, versionId: patch.versionId },
  });
  return safeApp(updated);
}

export async function runDeployedApp(
  request: Request,
  slug: string,
  input: { brief: unknown; title?: string; idempotencyKey: string },
) {
  const app = await db.deployedApp.findUnique({ where: { slug } });
  if (!app || app.status !== "ENABLED")
    throw new ApiError(404, "DEPLOYED_APP_NOT_FOUND", "The deployed app is unavailable.");
  const supplied = request.headers.get("x-app-key");
  if (!supplied || createHash("sha256").update(supplied).digest("hex") !== app.publicKeyHash)
    throw new ApiError(401, "DEPLOYED_APP_AUTH_REQUIRED", "A valid deployed-app key is required.");
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: app.workspaceId, userId: app.createdBy } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE")
    throw new ApiError(403, "DEPLOYED_APP_OWNER_INACTIVE", "The deployed app owner is not active.");
  const schema = app.inputSchema as { required?: unknown[] };
  const brief =
    input.brief && typeof input.brief === "object"
      ? (input.brief as Record<string, unknown>)
      : null;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
  if (
    !brief ||
    required.some(
      (field) => brief[field] === undefined || brief[field] === null || brief[field] === "",
    )
  )
    throw new ApiError(
      400,
      "DEPLOYED_APP_INPUT_INVALID",
      "The deployed app brief is missing a required field.",
    );
  const context: RequestContext = {
    workspaceId: app.workspaceId,
    userId: app.createdBy,
    role: membership.role,
    correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
  };
  const result = await createRun(context, {
    title: input.title?.trim() || app.name,
    brief,
    idempotencyKey: input.idempotencyKey,
    workflowVersionId: app.versionId,
    deployedAppId: app.id,
  });
  const queue = await enqueueWorkflowRun({
    runId: result.run.id,
    workspaceId: app.workspaceId,
    correlationId: context.correlationId,
  });
  if (!queue.accepted) {
    await failRunInternal({
      workspaceId: app.workspaceId,
      runId: result.run.id,
      correlationId: context.correlationId,
      error: { code: "QUEUE_NOT_CONFIGURED", message: queue.reason ?? "The queue is unavailable." },
    });
    throw new ApiError(503, "QUEUE_NOT_CONFIGURED", queue.reason ?? "The queue is unavailable.");
  }
  return { runId: result.run.id, quote: result.quote, queue, deduplicated: result.deduplicated };
}
