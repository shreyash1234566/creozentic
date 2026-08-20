import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { createRun, failRunInternal, quoteBrief } from "./workflow-service";
import { enqueueWorkflowRun } from "./queue";
import { createDailyPlan } from "./daily-autopilot";

const CADENCES = new Set(["daily", "weekly", "monthly", "once"]);

function nextDate(cadence: string, from = new Date()) {
  const next = new Date(from);
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  else return null;
  return next;
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function payloadObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function quotePayload(context: RequestContext, payload: Record<string, unknown>) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const defaults = payloadObject(payload.briefDefaults) ?? {};
  if (rows.length < 1 || rows.length > 1000)
    throw new ApiError(
      400,
      "INVALID_SCHEDULE_PAYLOAD",
      "rows must contain between 1 and 1000 items.",
    );
  const evaluated = [] as Array<{
    rowNumber: number;
    sku: string;
    brief: Record<string, unknown>;
    credits: number;
  }>;
  const errors = [] as Array<{ rowNumber: number; message: string }>;
  for (const [index, value] of rows.entries()) {
    const row = payloadObject(value);
    const sku = typeof row?.sku === "string" ? row.sku.trim() : "";
    if (!sku) {
      errors.push({ rowNumber: index + 1, message: "sku is required." });
      continue;
    }
    const product = await db.product.findFirst({
      where: { workspaceId: context.workspaceId, sku, deletedAt: null },
      select: { title: true, lockMode: true },
    });
    if (!product) {
      errors.push({
        rowNumber: index + 1,
        message: `SKU ${sku} does not exist in this workspace.`,
      });
      continue;
    }
    const brief = {
      product: product.title,
      sku,
      scene:
        typeof row?.scene === "string" ? row.scene : (defaults.scene ?? "warm lifestyle setting"),
      count: row?.count ?? defaults.count ?? 1,
      mode: row?.mode ?? defaults.mode ?? (product.lockMode === "CREATIVE" ? "creative" : "lock"),
      qualityMode: row?.qualityMode ?? defaults.qualityMode ?? "balanced",
      outputFormats: row?.outputFormats ?? defaults.outputFormats ?? ["1:1", "4:5"],
      audience: row?.audience ?? defaults.audience ?? "workspace audience",
      language: row?.language ?? defaults.language ?? "English",
      cta: row?.cta ?? defaults.cta ?? "Shop now",
    };
    try {
      const quoted = quoteBrief(brief);
      evaluated.push({
        rowNumber: index + 1,
        sku,
        brief: quoted.brief as unknown as Record<string, unknown>,
        credits: quoted.quote.credits,
      });
    } catch (error) {
      errors.push({
        rowNumber: index + 1,
        message: error instanceof Error ? error.message : "The schedule row is invalid.",
      });
    }
  }
  return {
    rows,
    evaluated,
    errors,
    credits: evaluated.reduce((sum, item) => sum + item.credits, 0),
  };
}

export async function createSchedule(
  context: RequestContext,
  input: {
    name: string;
    cadence: string;
    nextRunAt?: string;
    costCeiling: number;
    payload: Record<string, unknown>;
    approvalRequired?: boolean;
    brandId?: string;
    autonomyMode?: string;
  },
) {
  requireRole(context, "EDITOR");
  const name = input.name.trim();
  if (!name || !CADENCES.has(input.cadence))
    throw new ApiError(400, "INVALID_SCHEDULE", "name and a supported cadence are required.");
  if (!Number.isInteger(input.costCeiling) || input.costCeiling < 1)
    throw new ApiError(400, "INVALID_SCHEDULE", "costCeiling must be a positive integer.");
  const isDailyAutopilot =
    input.autonomyMode === "DAILY_AUTOPILOT" || input.payload.dailyAutopilot === true;
  const estimate = isDailyAutopilot
    ? { rows: [], evaluated: [], errors: [], credits: 0 }
    : await quotePayload(context, input.payload);
  if (estimate.errors.length > 0)
    throw new ApiError(400, "INVALID_SCHEDULE_PAYLOAD", "The schedule contains invalid rows.", {
      errors: estimate.errors,
    });
  const firstRun = input.nextRunAt
    ? new Date(input.nextRunAt)
    : nextDate(input.cadence, new Date());
  if (firstRun && Number.isNaN(firstRun.getTime()))
    throw new ApiError(400, "INVALID_SCHEDULE", "nextRunAt must be an ISO date.");
  if (estimate.credits > input.costCeiling)
    throw new ApiError(
      409,
      "SCHEDULE_COST_CEILING",
      `Estimated ${estimate.credits} credits exceeds the ${input.costCeiling} credit ceiling.`,
    );
  const secret = randomBytes(32).toString("base64url");
  const triggerSecretHash = createHash("sha256").update(secret).digest("hex");
  try {
    const schedule = await db.schedule.create({
      data: {
        workspaceId: context.workspaceId,
        createdBy: context.userId,
        name,
        cadence: input.cadence,
        status: "ACTIVE",
        requestPayload: json(input.payload),
        costCeiling: input.costCeiling,
        approvalRequired: input.approvalRequired !== false,
        nextRunAt: firstRun,
        triggerSecretHash,
        brandId: input.brandId,
        autonomyMode: input.autonomyMode,
      },
    });
    const { triggerSecretHash: _triggerSecretHash, ...safeSchedule } = schedule;
    return { schedule: safeSchedule, triggerSecret: secret, estimate };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new ApiError(409, "SCHEDULE_EXISTS", "A schedule with this name already exists.");
    throw error;
  }
}

export async function listSchedules(context: RequestContext) {
  return db.schedule.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      createdBy: true,
      name: true,
      cadence: true,
      cronExpression: true,
      status: true,
      requestPayload: true,
      costCeiling: true,
      approvalRequired: true,
      nextRunAt: true,
      lastRunAt: true,
      lastRunId: true,
      brandId: true,
      autonomyMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateSchedule(
  context: RequestContext,
  scheduleId: string,
  patch: { status?: string; costCeiling?: number },
) {
  requireRole(context, "EDITOR");
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, workspaceId: context.workspaceId },
  });
  if (!schedule)
    throw new ApiError(404, "SCHEDULE_NOT_FOUND", "The schedule was not found in this workspace.");
  if (patch.status && !["ACTIVE", "PAUSED", "DISABLED", "BLOCKED"].includes(patch.status))
    throw new ApiError(400, "INVALID_SCHEDULE_STATUS", "Unsupported schedule status.");
  if (
    patch.costCeiling !== undefined &&
    (!Number.isInteger(patch.costCeiling) || patch.costCeiling < 1)
  )
    throw new ApiError(400, "INVALID_SCHEDULE", "costCeiling must be a positive integer.");
  const updated = await db.schedule.update({
    where: { id: schedule.id },
    data: { status: patch.status, costCeiling: patch.costCeiling },
  });
  const { triggerSecretHash: _triggerSecretHash, ...safeSchedule } = updated;
  return safeSchedule;
}

export async function triggerSchedule(
  context: RequestContext,
  scheduleId: string,
  triggerKey: string,
) {
  requireRole(context, "EDITOR");
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, workspaceId: context.workspaceId },
  });
  if (!schedule)
    throw new ApiError(404, "SCHEDULE_NOT_FOUND", "The schedule was not found in this workspace.");
  if (schedule.status !== "ACTIVE")
    throw new ApiError(409, "SCHEDULE_NOT_ACTIVE", "The schedule is not active.");
  const key = `schedule:${schedule.id}:${triggerKey}`;
  const existing = await db.batchRun.findUnique({
    where: {
      workspaceId_idempotencyKey: { workspaceId: context.workspaceId, idempotencyKey: key },
    },
    include: { rows: true },
  });
  if (existing) return { batch: existing, deduplicated: true };
  const payload = schedule.requestPayload as Record<string, unknown>;
  if (schedule.autonomyMode === "DAILY_AUTOPILOT" || payload.dailyAutopilot === true) {
    const result = await createDailyPlan(context, {
      brandId: schedule.brandId ?? undefined,
      planDate: (schedule.nextRunAt ?? new Date()).toISOString(),
      autonomyMode: typeof payload.autonomyMode === "string" ? payload.autonomyMode : "APPROVAL",
      channel: typeof payload.channel === "string" ? payload.channel : "dashboard",
      language: typeof payload.language === "string" ? payload.language : undefined,
      contentTypes: Array.isArray(payload.contentTypes)
        ? payload.contentTypes.filter((item): item is string => typeof item === "string")
        : undefined,
      productIds: Array.isArray(payload.productIds)
        ? payload.productIds.filter((item): item is string => typeof item === "string")
        : undefined,
      campaignIds: Array.isArray(payload.campaignIds)
        ? payload.campaignIds.filter((item): item is string => typeof item === "string")
        : undefined,
      source: "SCHEDULE",
      scheduleId: schedule.id,
    });
    await db.schedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: new Date(),
        lastRunId: result.plan.id,
        nextRunAt: nextDate(schedule.cadence),
        status: schedule.cadence === "once" ? "DISABLED" : schedule.status,
      },
    });
    return { dailyPlan: result.plan, deduplicated: result.deduplicated };
  }
  const estimate = await quotePayload(context, schedule.requestPayload as Record<string, unknown>);
  if (estimate.errors.length > 0)
    throw new ApiError(
      409,
      "SCHEDULE_PAYLOAD_INVALID",
      "The scheduled payload is no longer valid.",
      { errors: estimate.errors },
    );
  if (estimate.credits > schedule.costCeiling) {
    await db.schedule.update({ where: { id: schedule.id }, data: { status: "BLOCKED" } });
    throw new ApiError(
      409,
      "SCHEDULE_COST_CEILING",
      "The scheduled run exceeded its cost ceiling and was blocked.",
    );
  }
  const title = typeof payload.title === "string" ? payload.title : schedule.name;
  const batch = await db.batchRun.create({
    data: {
      workspaceId: context.workspaceId,
      createdBy: context.userId,
      title: `${title} · ${new Date().toISOString()}`,
      state: "QUEUED",
      totalRows: estimate.rows.length,
      estimatedUnits: estimate.credits,
      idempotencyKey: key,
      rows: {
        create: estimate.rows.map((value, index) => ({
          workspaceId: context.workspaceId,
          rowNumber: index + 1,
          sku:
            typeof payloadObject(value)?.sku === "string"
              ? (payloadObject(value)!.sku as string)
              : `row-${index + 1}`,
          inputSnapshot: json(payloadObject(value) ?? {}),
          state: "VALIDATED",
        })),
      },
    },
    include: { rows: true },
  });
  let queued = 0;
  let failed = 0;
  for (const item of estimate.evaluated) {
    const row = batch.rows.find((candidate) => candidate.rowNumber === item.rowNumber)!;
    try {
      const run = await createRun(context, {
        title: `${title} · ${item.sku}`,
        brief: item.brief,
        idempotencyKey: `${key}:row:${item.rowNumber}`,
      });
      const queue = await enqueueWorkflowRun({
        runId: run.run.id,
        workspaceId: context.workspaceId,
        correlationId: context.correlationId,
        jobId: `workflow-run-${run.run.id}`,
      });
      if (!queue.accepted) {
        await failRunInternal({
          workspaceId: context.workspaceId,
          runId: run.run.id,
          correlationId: context.correlationId,
          error: {
            code: "QUEUE_NOT_CONFIGURED",
            message: queue.reason ?? "The queue is unavailable.",
          },
        });
        failed += 1;
        await db.batchRow.update({
          where: { id: row.id },
          data: {
            state: "FAILED",
            runId: run.run.id,
            error: json({ code: "QUEUE_NOT_CONFIGURED", message: queue.reason }),
          },
        });
      } else {
        queued += 1;
        await db.batchRow.update({
          where: { id: row.id },
          data: { state: "QUEUED", runId: run.run.id },
        });
      }
    } catch (error) {
      failed += 1;
      await db.batchRow.update({
        where: { id: row.id },
        data: {
          state: "FAILED",
          error: json({ message: error instanceof Error ? error.message : "The row failed." }),
        },
      });
    }
  }
  const updated = await db.batchRun.update({
    where: { id: batch.id },
    data: { state: queued > 0 ? "RUNNING" : "PARTIAL_FAILURE", failedRows: failed },
    include: { rows: true },
  });
  await db.schedule.update({
    where: { id: schedule.id },
    data: {
      lastRunAt: new Date(),
      lastRunId: batch.id,
      nextRunAt: nextDate(schedule.cadence),
      status: schedule.cadence === "once" ? "DISABLED" : schedule.status,
    },
  });
  return { batch: updated, queuedRows: queued, failedRows: failed, deduplicated: false };
}

export async function triggerDueSchedules() {
  const now = new Date();
  const schedules = await db.schedule.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 100,
  });
  const results: Array<Record<string, unknown>> = [];
  for (const schedule of schedules) {
    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: schedule.workspaceId, userId: schedule.createdBy },
      },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      results.push({
        scheduleId: schedule.id,
        status: "SKIPPED",
        reason: "creator_membership_inactive",
      });
      continue;
    }
    try {
      const result = await triggerSchedule(
        {
          workspaceId: schedule.workspaceId,
          userId: schedule.createdBy,
          role: membership.role,
          correlationId: `cron:${schedule.id}:${schedule.nextRunAt?.toISOString() ?? now.toISOString()}`,
        },
        schedule.id,
        `due:${schedule.nextRunAt?.toISOString() ?? now.toISOString()}`,
      );
      results.push({ scheduleId: schedule.id, status: "TRIGGERED", result });
    } catch (error) {
      results.push({
        scheduleId: schedule.id,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Schedule trigger failed.",
      });
    }
  }
  return { checkedAt: now.toISOString(), count: schedules.length, results };
}
