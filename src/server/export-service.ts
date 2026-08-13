import { Prisma, RunState, ReviewStatus, OutputStatus } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { createDownloadUrl, isWorkspaceObjectKey, StorageNotConfiguredError } from "./storage";
import { exportRun } from "./workflow-service";
import { requireRole, type RequestContext } from "./auth";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function safePart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "creative"
  );
}

function extension(mimeType: string | undefined, name: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
    }[mimeType ?? ""] ?? "bin"
  );
}

async function manifestForRun(context: RequestContext, runId: string) {
  const run = await db.workflowRun.findFirst({
    where: { id: runId, workspaceId: context.workspaceId },
    include: {
      reviewTask: true,
      outputs: { include: { asset: true } },
      workflowVersion: { include: { template: true } },
    },
  });
  if (!run)
    throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
  if (run.state !== RunState.APPROVED && run.state !== RunState.EXPORTED)
    throw new ApiError(409, "EXPORT_REQUIRES_APPROVAL", "Only an approved run can be exported.");
  if (run.reviewTask?.status !== ReviewStatus.APPROVED)
    throw new ApiError(409, "EXPORT_REQUIRES_APPROVAL", "The review task must be approved first.");
  if (run.outputs.length === 0)
    throw new ApiError(409, "EXPORT_HAS_NO_OUTPUTS", "The approved run has no output assets.");

  const files = [] as Array<Record<string, unknown>>;
  for (const [index, output] of run.outputs.entries()) {
    const asset = output.asset;
    if (!asset || asset.workspaceId !== context.workspaceId || asset.status === "SOFT_DELETED")
      throw new ApiError(
        409,
        "EXPORT_ASSET_UNAVAILABLE",
        `Output ${output.name} does not have a retrievable workspace asset.`,
      );
    if (!asset.objectKey || !asset.contentHash)
      throw new ApiError(
        409,
        "EXPORT_ASSET_UNAVAILABLE",
        `Output ${output.name} is missing its storage reference or content hash.`,
      );
    if (!isWorkspaceObjectKey(context.workspaceId, asset.objectKey))
      throw new ApiError(
        409,
        "EXPORT_ASSET_UNAVAILABLE",
        `Output ${output.name} points outside the workspace storage namespace.`,
      );
    const format = safePart(output.format);
    const fileName = `${safePart(run.title)}-${String(index + 1).padStart(2, "0")}-${format}.${extension(asset.mimeType, asset.name)}`;
    const file: Record<string, unknown> = {
      outputId: output.id,
      assetId: asset.id,
      fileName,
      objectKey: asset.objectKey,
      contentHash: asset.contentHash,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: output.width,
      height: output.height,
      format: output.format,
      locale: output.locale,
      status: output.status,
    };
    try {
      const signed = await createDownloadUrl({ objectKey: asset.objectKey });
      file.downloadUrl = signed.url;
      file.downloadUrlExpiresIn = signed.expiresIn;
    } catch (error) {
      if (!(error instanceof StorageNotConfiguredError)) throw error;
      file.downloadUrl = null;
      file.downloadUnavailableReason = "Object storage is not configured.";
    }
    files.push(file);
  }
  return {
    schemaVersion: 1,
    runId: run.id,
    workspaceId: context.workspaceId,
    title: run.title,
    exportedAt: new Date().toISOString(),
    workflow: {
      templateId: run.workflowVersion.templateId,
      templateName: run.workflowVersion.template.name,
      version: run.workflowVersion.version,
    },
    brand: {
      version: (run.brandSnapshot as { version?: number }).version ?? null,
    },
    approval: {
      reviewId: run.reviewTask.id,
      status: run.reviewTask.status,
      approvedAt: run.reviewTask.updatedAt.toISOString(),
    },
    files,
    warnings: files.some((file) => file.downloadUrl === null)
      ? ["Signed download URLs are unavailable until object storage is configured."]
      : [],
  };
}

export async function createExportManifest(
  context: RequestContext,
  runId: string,
  idempotencyKey: string,
) {
  requireRole(context, "EDITOR");
  const existingByKey = await db.exportManifest.findFirst({
    where: { workspaceId: context.workspaceId, idempotencyKey },
  });
  if (existingByKey) return { manifest: existingByKey, deduplicated: true };
  const existingByRun = await db.exportManifest.findUnique({
    where: { workspaceId_runId: { workspaceId: context.workspaceId, runId } },
  });
  if (existingByRun) return { manifest: existingByRun, deduplicated: true };

  const run = await db.workflowRun.findFirst({
    where: { id: runId, workspaceId: context.workspaceId },
    select: { state: true },
  });
  if (!run)
    throw new ApiError(404, "RUN_NOT_FOUND", "The workflow run was not found in this workspace.");
  if (run.state === RunState.APPROVED) await exportRun(context, runId);
  const manifest = await manifestForRun(context, runId);
  try {
    const saved = await db.exportManifest.create({
      data: {
        workspaceId: context.workspaceId,
        runId,
        idempotencyKey,
        manifest: json(manifest),
      },
    });
    await db.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "export.manifest.created",
        targetType: "workflow_run",
        targetId: runId,
        correlationId: context.correlationId,
        idempotencyKey,
        metadata: { manifestId: saved.id, fileCount: manifest.files.length },
      },
    });
    return { manifest: saved, deduplicated: false };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const existing = await db.exportManifest.findFirst({
        where: { workspaceId: context.workspaceId, OR: [{ runId }, { idempotencyKey }] },
      });
      if (existing) return { manifest: existing, deduplicated: true };
    }
    throw error;
  }
}

export async function getExportManifest(context: RequestContext, runId: string) {
  const manifest = await db.exportManifest.findUnique({
    where: { workspaceId_runId: { workspaceId: context.workspaceId, runId } },
  });
  if (!manifest)
    throw new ApiError(404, "EXPORT_NOT_FOUND", "No export manifest exists for this run yet.");
  return manifest;
}
