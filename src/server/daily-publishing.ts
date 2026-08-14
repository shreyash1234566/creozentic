import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { usableConnectionAccessToken } from "./connector-oauth";
import { validatePlatformOutput } from "./platform-specs";
import { enforceSafety } from "./safety";
import { providerApiError, requestProvider } from "./provider-http";
import { appendCreativeEvent } from "./events";
import { createNotifications } from "./notifications";
import { requiresProductionAuthentication } from "./runtime-config";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function entries(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function receiptIsFinal(value: Record<string, unknown>) {
  const status = String(value.receiptStatus ?? value.status ?? "").toLowerCase();
  return ["published", "succeeded", "complete", "completed", "live"].includes(status);
}

export async function publishDailyPlan(
  context: RequestContext,
  input: {
    planId: string;
    connectionId: string;
    platform: string;
    confirmation: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  requireRole(context, "PUBLISHER");
  if (input.confirmation.confirmed !== true)
    throw new ApiError(
      400,
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Publishing requires explicit confirmation.",
    );
  const plan = await db.dailyContentPlan.findFirst({
    where: { id: input.planId, workspaceId: context.workspaceId },
    include: { approvalGates: true },
  });
  if (!plan)
    throw new ApiError(404, "DAILY_PLAN_NOT_FOUND", "The daily content plan was not found.");
  if (!["APPROVED", "DELIVERED", "PUBLISH_PENDING"].includes(plan.status))
    throw new ApiError(
      409,
      "DAILY_PUBLISH_REQUIRES_APPROVAL",
      "The daily plan must be approved before publishing.",
    );
  if (plan.approvalGates.some((gate) => !["APPROVED", "BYPASSED"].includes(gate.state)))
    throw new ApiError(
      409,
      "DAILY_PUBLISH_GATE_BLOCKED",
      "Every daily creative needs an approved or bypassed gate.",
    );
  const connection = await db.connection.findFirst({
    where: { id: input.connectionId, workspaceId: context.workspaceId, health: "HEALTHY" },
  });
  if (!connection)
    throw new ApiError(409, "CONNECTION_UNHEALTHY", "Reconnect the destination before publishing.");
  const endpoint =
    process.env[`PUBLISH_${input.platform.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_URL`];
  if (!endpoint && requiresProductionAuthentication())
    throw new ApiError(
      503,
      "PUBLISH_ADAPTER_NOT_CONFIGURED",
      `No publish adapter is configured for ${input.platform}.`,
    );
  const manifest = object(plan.deliveryManifest);
  const manifestEntries = entries(manifest.entries);
  if (!manifestEntries.length)
    throw new ApiError(
      409,
      "DAILY_MANIFEST_EMPTY",
      "Export the approved daily plan before publishing.",
    );
  const created = [];
  for (const entry of manifestEntries) {
    const entryKey = String(entry.creativePlanId ?? entry.id ?? "");
    if (!entryKey) continue;
    const assets = entries(entry.assets);
    const first = object(assets[0]);
    const metadata = object(first.metadata);
    const platformCheck = validatePlatformOutput({
      platform: input.platform,
      width: typeof first.width === "number" ? first.width : undefined,
      height: typeof first.height === "number" ? first.height : undefined,
      caption: typeof entry.caption === "string" ? entry.caption : undefined,
      durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : undefined,
    });
    if (!platformCheck.valid)
      throw new ApiError(
        409,
        "PLATFORM_SPEC_FAILED",
        "The daily creative does not meet the destination platform specification.",
        { entryKey, errors: platformCheck.errors },
      );
    await enforceSafety({
      workspaceId: context.workspaceId,
      text: typeof entry.caption === "string" ? entry.caption : undefined,
      metadata,
    });
    const mediaChecksum = createHash("sha256")
      .update(JSON.stringify(assets.map((asset) => ({ id: asset.id, hash: asset.contentHash }))))
      .digest("hex");
    const metadataHash = createHash("sha256")
      .update(
        JSON.stringify({ platform: input.platform, entryKey, confirmation: input.confirmation }),
      )
      .digest("hex");
    const jobKey = `${input.idempotencyKey}:${entryKey}`;
    const existing = await db.dailyPublicationJob.findUnique({
      where: {
        workspaceId_idempotencyKey: { workspaceId: context.workspaceId, idempotencyKey: jobKey },
      },
    });
    if (existing) {
      created.push(existing);
      continue;
    }
    const job = await db.dailyPublicationJob.create({
      data: {
        workspaceId: context.workspaceId,
        dailyPlanId: plan.id,
        connectionId: connection.id,
        platform: input.platform,
        entryKey,
        status: endpoint ? "QUEUED" : "AWAITING_PROVIDER",
        destination: String(input.confirmation.destination ?? input.platform),
        mediaChecksum,
        metadataHash,
        confirmation: json(input.confirmation),
        idempotencyKey: jobKey,
      },
    });
    if (!endpoint) {
      created.push(job);
      continue;
    }
    try {
      const accessToken = await usableConnectionAccessToken(connection.id, context.workspaceId);
      const response = await requestProvider<Record<string, unknown>>({
        provider: `publisher:${input.platform}`,
        endpoint,
        headers: { authorization: `Bearer ${accessToken}` },
        idempotencyKey: jobKey,
        timeoutMs: 120_000,
        body: {
          platform: input.platform,
          entryKey,
          planId: plan.id,
          assets,
          caption: entry.caption,
          headline: entry.headline,
          cta: entry.cta,
          confirmation: input.confirmation,
        },
      });
      const saved = await db.$transaction(async (tx) => {
        const finalReceipt = receiptIsFinal(response.body);
        const updated = await tx.dailyPublicationJob.update({
          where: { id: job.id },
          data: {
            status: finalReceipt ? "SUCCEEDED" : "AWAITING_RECEIPT",
            platformObjectId:
              typeof response.body.platformObjectId === "string"
                ? response.body.platformObjectId
                : undefined,
            attempts: { increment: 1 },
            receipt: json({
              provider: input.platform,
              requestId: response.requestId ?? null,
              mediaChecksum,
              metadataHash,
              ...(response.body ?? {}),
            }),
          },
        });
        if (finalReceipt)
          await appendCreativeEvent(tx, {
            workspaceId: context.workspaceId,
            brandId: plan.brandId,
            eventType: "creative.daily_published",
            correlationId: context.correlationId,
            actor: { type: "user", id: context.userId, channel: "dashboard" },
            policyContext: { autonomyMode: plan.autonomyMode },
            payload: {
              dailyPlanId: plan.id,
              publicationJobId: job.id,
              platform: input.platform,
              entryKey,
            },
            idempotencyKey: `daily-publication-succeeded:${job.id}`,
          });
        return updated;
      });
      created.push(saved);
    } catch (error) {
      const providerError = providerApiError(
        error,
        "DAILY_PUBLISH_FAILED",
        "The daily publish adapter failed.",
      );
      const failed = await db.dailyPublicationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          error: json({
            code: providerError.code,
            message: providerError.message,
            details: providerError.details,
          }),
        },
      });
      throw new ApiError(providerError.status, providerError.code, providerError.message, {
        publicationJobId: failed.id,
        ...(providerError.details &&
        typeof providerError.details === "object" &&
        !Array.isArray(providerError.details)
          ? providerError.details
          : {}),
      });
    }
  }
  if (created.some((job) => job.status === "SUCCEEDED"))
    await db.dailyContentPlan.update({ where: { id: plan.id }, data: { status: "PUBLISHED" } });
  if (created.some((job) => job.status === "SUCCEEDED"))
    await createNotifications({
      workspaceId: context.workspaceId,
      recipientId: context.userId,
      type: "DAILY_PLAN_PUBLISHED",
      title: "Daily creative published",
      body: `${created.filter((job) => job.status === "SUCCEEDED").length} approved creative(s) were sent to ${input.platform}.`,
      payload: {
        planId: plan.id,
        publicationJobIds: created.map((job) => job.id),
        platform: input.platform,
      },
      channels: ["IN_APP"],
      idempotencyKey: `daily-publish-notification:${plan.id}:${input.platform}:${input.idempotencyKey}`,
    });
  return { planId: plan.id, jobs: created };
}

export async function pollDailyPublication(context: RequestContext, publicationJobId: string) {
  requireRole(context, "PUBLISHER");
  const job = await db.dailyPublicationJob.findFirst({
    where: { id: publicationJobId, workspaceId: context.workspaceId },
    include: { connection: true, dailyPlan: true },
  });
  if (!job)
    throw new ApiError(404, "DAILY_PUBLICATION_NOT_FOUND", "The publication job was not found.");
  if (job.status === "SUCCEEDED") return job;
  if (job.status !== "AWAITING_RECEIPT")
    throw new ApiError(
      409,
      "DAILY_PUBLICATION_NOT_AWAITING_RECEIPT",
      "Only a publication awaiting a platform receipt may be polled.",
    );
  const endpoint =
    process.env[`PUBLISH_${job.platform.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_STATUS_URL`] ??
    process.env[`PUBLISH_${job.platform.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_URL`];
  if (!endpoint)
    throw new ApiError(
      503,
      "PUBLISH_RECEIPT_ADAPTER_NOT_CONFIGURED",
      `No receipt adapter is configured for ${job.platform}.`,
    );
  const accessToken = await usableConnectionAccessToken(job.connection.id, context.workspaceId);
  try {
    const response = await requestProvider<Record<string, unknown>>({
      provider: `publisher:${job.platform}:receipt`,
      endpoint,
      headers: { authorization: `Bearer ${accessToken}` },
      idempotencyKey: `daily-publication-poll:${job.id}:${job.attempts + 1}`,
      timeoutMs: 60_000,
      body: {
        action: "receipt.status",
        publicationJobId: job.id,
        platformObjectId: job.platformObjectId,
        entryKey: job.entryKey,
      },
    });
    if (!receiptIsFinal(response.body))
      return db.dailyPublicationJob.update({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
          receipt: json({ ...object(job.receipt), lastPoll: response.body }),
        },
      });
    const saved = await db.$transaction(async (tx) => {
      const updated = await tx.dailyPublicationJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          attempts: { increment: 1 },
          platformObjectId:
            typeof response.body.platformObjectId === "string"
              ? response.body.platformObjectId
              : job.platformObjectId,
          receipt: json({ ...object(job.receipt), finalReceipt: response.body }),
        },
      });
      await appendCreativeEvent(tx, {
        workspaceId: context.workspaceId,
        brandId: job.dailyPlan.brandId,
        eventType: "creative.daily_published",
        correlationId: context.correlationId,
        actor: { type: "user", id: context.userId, channel: "dashboard" },
        policyContext: { autonomyMode: job.dailyPlan.autonomyMode },
        payload: { dailyPlanId: job.dailyPlanId, publicationJobId: job.id, platform: job.platform },
        idempotencyKey: `daily-publication-succeeded:${job.id}`,
      });
      return updated;
    });
    await db.dailyContentPlan.update({
      where: { id: job.dailyPlanId },
      data: { status: "PUBLISHED" },
    });
    return saved;
  } catch (error) {
    const providerError = providerApiError(
      error,
      "DAILY_PUBLISH_RECEIPT_FAILED",
      "The daily publish receipt check failed.",
    );
    await db.dailyPublicationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        error: json({ code: providerError.code, message: providerError.message }),
      },
    });
    throw providerError;
  }
}

export async function retryDailyPublication(context: RequestContext, publicationJobId: string) {
  requireRole(context, "PUBLISHER");
  const failed = await db.dailyPublicationJob.findFirst({
    where: { id: publicationJobId, workspaceId: context.workspaceId },
  });
  if (!failed)
    throw new ApiError(404, "DAILY_PUBLICATION_NOT_FOUND", "The publication job was not found.");
  if (!["FAILED", "AWAITING_PROVIDER"].includes(failed.status))
    throw new ApiError(
      409,
      "DAILY_PUBLICATION_NOT_RETRYABLE",
      "Only failed or provider-pending publication jobs may be retried.",
    );
  const confirmation = object(failed.confirmation);
  return publishDailyPlan(context, {
    planId: failed.dailyPlanId,
    connectionId: failed.connectionId,
    platform: failed.platform,
    confirmation: { ...confirmation, confirmed: true, retriedPublicationJobId: failed.id },
    idempotencyKey: `daily-publication-retry:${failed.id}:${failed.attempts + 1}`,
  });
}

export async function listDailyPublicationJobs(context: RequestContext, planId?: string) {
  requireRole(context, "VIEWER");
  return db.dailyPublicationJob.findMany({
    where: { workspaceId: context.workspaceId, ...(planId ? { dailyPlanId: planId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
