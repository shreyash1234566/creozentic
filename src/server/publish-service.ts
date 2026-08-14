import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { usableConnectionAccessToken } from "./connector-oauth";
import type { RequestContext } from "./auth";
import { validatePlatformOutput } from "./platform-specs";
import { enforceSafety } from "./safety";
import { computeCampaignPassport } from "./campaign-reliability";
import { requestProvider } from "./provider-http";
import { readObject } from "./storage";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function publishNativeYouTube(input: {
  accessToken: string;
  objectKey: string;
  mimeType: string;
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
}) {
  const media = await readObject(input.objectKey);
  const mimeType = media.mimeType ?? input.mimeType;
  if (!mimeType.startsWith("video/"))
    throw new ApiError(
      409,
      "YOUTUBE_VIDEO_REQUIRED",
      "YouTube publishing requires an approved video output.",
    );
  const metadata = {
    snippet: { title: input.title.slice(0, 100), description: input.description.slice(0, 5_000) },
    status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
  };
  const initialize = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": mimeType,
        "x-upload-content-length": String(media.body.byteLength),
      },
      body: JSON.stringify(metadata),
    },
  );
  const uploadUrl = initialize.headers.get("location");
  if (!initialize.ok || !uploadUrl)
    throw new Error(
      `YouTube resumable upload initialization failed with HTTP ${initialize.status}.`,
    );
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType, "content-length": String(media.body.byteLength) },
    body: media.body,
  });
  const body = record(await uploaded.json().catch(() => ({})));
  if (!uploaded.ok || typeof body.id !== "string")
    throw new Error(`YouTube media upload failed with HTTP ${uploaded.status}.`);
  return {
    platformObjectId: body.id,
    receiptStatus: "published",
    provider: "youtube",
    privacyStatus: input.privacyStatus,
  };
}

export async function publishApprovedOutput(
  context: RequestContext,
  input: {
    outputAssetId: string;
    connectionId: string;
    platform: string;
    confirmation: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  if (input.confirmation.confirmed !== true)
    throw new ApiError(
      400,
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Publishing requires explicit confirmation.",
    );
  const output = await db.outputAsset.findFirst({
    where: { id: input.outputAssetId, workspaceId: context.workspaceId },
    include: { asset: true, run: { include: { reviewTask: true } } },
  });
  if (!output)
    throw new ApiError(
      404,
      "OUTPUT_NOT_FOUND",
      "The output asset was not found in this workspace.",
    );
  if (output.status !== "APPROVED" && output.status !== "EXPORTED")
    throw new ApiError(
      409,
      "PUBLISH_REQUIRES_APPROVAL",
      "Only an approved or exported output can be published.",
    );
  if (!output.run.reviewTask || output.run.reviewTask.status !== "APPROVED")
    throw new ApiError(
      409,
      "PUBLISH_REQUIRES_APPROVAL",
      "The workflow review task is not approved.",
    );
  if (output.campaignId) {
    const passport = await computeCampaignPassport(context, output.campaignId);
    if (passport.status !== "READY")
      throw new ApiError(
        409,
        "CREATIVE_PASSPORT_BLOCKED",
        "The Creative Passport is not ready. Missing evidence must be repaired before publishing.",
        { passportId: passport.id, status: passport.status, evidence: passport.evidence },
      );
  }
  const qualityScores = output.qualityScores as Record<string, { verdict?: string }> | null;
  if (qualityScores && Object.values(qualityScores).some((check) => check?.verdict === "critical"))
    throw new ApiError(409, "QUALITY_GATE_BLOCKED", "A critical QA result blocks publishing.");
  const platformCheck = validatePlatformOutput({
    platform: input.platform,
    format: output.format,
    width: output.width,
    height: output.height,
    caption:
      typeof input.confirmation.caption === "string" ? input.confirmation.caption : undefined,
    durationMs:
      typeof (output.metadata as Record<string, unknown> | null)?.durationMs === "number"
        ? ((output.metadata as Record<string, unknown>).durationMs as number)
        : undefined,
  });
  if (!platformCheck.valid)
    throw new ApiError(
      409,
      "PLATFORM_SPEC_FAILED",
      "The output does not meet the destination platform specification.",
      { errors: platformCheck.errors },
    );
  await enforceSafety({
    workspaceId: context.workspaceId,
    text: typeof input.confirmation.caption === "string" ? input.confirmation.caption : undefined,
    metadata: output.metadata as Record<string, unknown> | null,
  });
  const connection = await db.connection.findFirst({
    where: { id: input.connectionId, workspaceId: context.workspaceId },
  });
  if (!connection)
    throw new ApiError(
      404,
      "CONNECTION_NOT_FOUND",
      "The connection was not found in this workspace.",
    );
  if (connection.health !== "HEALTHY")
    throw new ApiError(409, "CONNECTION_UNHEALTHY", "Reconnect the destination before publishing.");
  if (input.platform.toLowerCase().includes("tiktok")) {
    const creatorInfo = input.confirmation.creatorInfo;
    if (!creatorInfo || typeof creatorInfo !== "object" || Array.isArray(creatorInfo))
      throw new ApiError(
        409,
        "TIKTOK_CREATOR_INFO_REQUIRED",
        "TikTok publishing requires creator information.",
      );
    if (input.confirmation.metadataAudit !== true || input.confirmation.consent !== true)
      throw new ApiError(
        409,
        "TIKTOK_AUDIT_REQUIRED",
        "TikTok public posting requires an explicit metadata audit and consent confirmation.",
      );
  }
  const existing = await db.publishJob.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;
  const endpoint =
    process.env[`PUBLISH_${input.platform.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_URL`];
  const usesNativeYouTube =
    input.platform.toLowerCase() === "youtube" && connection.provider === "youtube";
  if (!endpoint && !usesNativeYouTube)
    throw new ApiError(
      503,
      "PUBLISH_ADAPTER_NOT_CONFIGURED",
      `No publish adapter is configured for ${input.platform}.`,
    );
  if (!output.asset?.objectKey)
    throw new ApiError(
      409,
      "OUTPUT_NOT_RETRIEVABLE",
      "The approved output does not have a retrievable object.",
    );
  const accessToken = await usableConnectionAccessToken(connection.id, context.workspaceId);
  const metadataHash = createHash("sha256")
    .update(JSON.stringify(output.metadata ?? {}))
    .digest("hex");
  const captionHash = createHash("sha256")
    .update(typeof input.confirmation.caption === "string" ? input.confirmation.caption : "")
    .digest("hex");
  const receiptBase = {
    destination: input.confirmation.destination ?? input.platform,
    version: input.confirmation.version ?? output.updatedAt.toISOString(),
    timestamp: new Date().toISOString(),
    captionHash,
    mediaChecksum: output.asset.contentHash,
    metadataHash,
  };
  let job;
  try {
    job = await db.publishJob.create({
      data: {
        workspaceId: context.workspaceId,
        outputAssetId: output.id,
        campaignId: output.campaignId ?? undefined,
        connectionId: connection.id,
        platform: input.platform,
        destination: String(receiptBase.destination),
        mediaChecksum: output.asset.contentHash,
        metadataHash,
        version: String(receiptBase.version),
        status: "QUEUED",
        confirmation: input.confirmation as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const existingJob = await db.publishJob.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: context.workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existingJob) return existingJob;
    }
    throw error;
  }
  try {
    const body = endpoint
      ? (
          await requestProvider<Record<string, unknown>>({
            provider: `publisher:${input.platform}`,
            endpoint,
            headers: { authorization: `Bearer ${accessToken}` },
            idempotencyKey: input.idempotencyKey,
            timeoutMs: 120_000,
            body: {
              platform: input.platform,
              output: {
                id: output.id,
                objectKey: output.asset.objectKey,
                format: output.format,
                metadata: output.metadata,
              },
              confirmation: input.confirmation,
            },
          })
        ).body
      : await publishNativeYouTube({
          accessToken,
          objectKey: output.asset.objectKey,
          mimeType: output.asset.mimeType,
          title:
            typeof input.confirmation.title === "string" && input.confirmation.title.trim()
              ? input.confirmation.title
              : output.name,
          description:
            typeof input.confirmation.caption === "string" ? input.confirmation.caption : "",
          privacyStatus:
            input.confirmation.privacyStatus === "public" ||
            input.confirmation.privacyStatus === "unlisted"
              ? input.confirmation.privacyStatus
              : "private",
        });
    return db.$transaction(async (tx) => {
      const updated = await tx.publishJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          platformObjectId:
            typeof body.platformObjectId === "string" ? body.platformObjectId : undefined,
          receipt: { ...receiptBase, ...(body ?? {}), retry: false } as Prisma.InputJsonValue,
        },
      });
      await tx.outputAsset.update({
        where: { id: output.id },
        data: { status: "PUBLISHED" },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId: context.workspaceId,
          runId: output.runId,
          eventType: "publish.succeeded",
          correlationId: context.correlationId,
          idempotencyKey: `${job.id}:publish.succeeded`,
          payload: {
            publishJobId: job.id,
            platform: input.platform,
            platformObjectId: body.platformObjectId ?? null,
            receipt: receiptBase,
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "publish.succeeded",
          targetType: "publish_job",
          targetId: job.id,
          correlationId: context.correlationId,
          idempotencyKey: `${job.id}:publish.succeeded.audit`,
          metadata: { platform: input.platform, platformObjectId: body.platformObjectId ?? null },
        },
      });
      return updated;
    });
  } catch (error) {
    return db.$transaction(async (tx) => {
      const message = error instanceof Error ? error.message : "Publish adapter failed.";
      const updated = await tx.publishJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: { ...receiptBase, message, retryable: true } },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId: context.workspaceId,
          runId: output.runId,
          eventType: "publish.failed",
          correlationId: context.correlationId,
          idempotencyKey: `${job.id}:publish.failed`,
          payload: { publishJobId: job.id, platform: input.platform, message },
        },
      });
      return updated;
    });
  }
}
