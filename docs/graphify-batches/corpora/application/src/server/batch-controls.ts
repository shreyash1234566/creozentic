import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";
import { enqueueWorkflowRun } from "./queue";
import { cancelRun, retryRun } from "./workflow-service";

export async function updateBatchState(
  context: RequestContext,
  batchId: string,
  state: "PAUSED" | "CANCELLED" | "RUNNING",
) {
  requireRole(context, "EDITOR");
  const batch = await db.batchRun.findFirst({
    where: { id: batchId, workspaceId: context.workspaceId },
  });
  if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", "The batch was not found.");
  if (state === "PAUSED" && !["QUEUED", "RUNNING"].includes(batch.state))
    throw new ApiError(409, "BATCH_NOT_PAUSABLE", "Only queued or running batches may be paused.");
  if (state === "RUNNING" && batch.state !== "PAUSED")
    throw new ApiError(409, "BATCH_NOT_RESUMABLE", "Only paused batches may be resumed.");
  if (state === "CANCELLED" && ["COMPLETED", "CANCELLED"].includes(batch.state))
    throw new ApiError(409, "BATCH_NOT_CANCELLABLE", "This batch is already terminal.");
  const updated = await db.batchRun.update({ where: { id: batch.id }, data: { state } });
  if (state === "CANCELLED") {
    const queued = await db.batchRow.findMany({
      where: {
        batchId: batch.id,
        workspaceId: context.workspaceId,
        state: { in: ["VALIDATED", "QUEUED"] },
      },
      select: { runId: true },
    });
    await Promise.all(
      queued
        .map((row) => row.runId)
        .filter((runId): runId is string => Boolean(runId))
        .map((runId) => cancelRun(context, runId).catch(() => undefined)),
    );
    await db.batchRow.updateMany({
      where: {
        batchId: batch.id,
        workspaceId: context.workspaceId,
        state: { in: ["VALIDATED", "QUEUED"] },
      },
      data: { state: "CANCELLED", error: { code: "BATCH_CANCELLED" } },
    });
  }
  if (state === "RUNNING") {
    const rows = await db.batchRow.findMany({
      where: {
        batchId: batch.id,
        workspaceId: context.workspaceId,
        state: "QUEUED",
        runId: { not: null },
      },
      select: { id: true, runId: true },
    });
    const accepted = await Promise.all(
      rows.map((row) =>
        enqueueWorkflowRun({
          runId: row.runId!,
          workspaceId: context.workspaceId,
          correlationId: context.correlationId,
          jobId: `batch-resume-${row.id}-${Date.now()}`,
        }),
      ),
    );
    const unavailable = accepted.find((result) => !result.accepted);
    if (unavailable)
      throw new ApiError(
        503,
        "QUEUE_NOT_CONFIGURED",
        unavailable.reason ?? "The workflow queue is unavailable.",
      );
  }
  return updated;
}

export async function retryBatchRow(
  context: RequestContext,
  batchId: string,
  rowId: string,
  idempotencyKey: string,
) {
  requireRole(context, "EDITOR");
  const row = await db.batchRow.findFirst({
    where: { id: rowId, batchId, workspaceId: context.workspaceId },
    include: { batch: true },
  });
  if (!row) throw new ApiError(404, "BATCH_ROW_NOT_FOUND", "The batch row was not found.");
  if (row.state !== "FAILED" || !row.runId)
    throw new ApiError(409, "BATCH_ROW_NOT_RETRYABLE", "Only failed queued rows may be retried.");
  if (row.attempts >= row.retryLimit)
    throw new ApiError(409, "BATCH_ROW_RETRY_LIMIT", "This batch row exhausted its retry limit.");
  const result = await retryRun(context, row.runId, idempotencyKey);
  if (!result.deduplicated) {
    const queue = await enqueueWorkflowRun({
      runId: row.runId,
      workspaceId: context.workspaceId,
      correlationId: context.correlationId,
      jobId: `batch-row-${row.id}-retry-${row.attempts + 1}`,
    });
    if (!queue.accepted)
      throw new ApiError(
        503,
        "QUEUE_NOT_CONFIGURED",
        queue.reason ?? "The workflow queue is unavailable.",
      );
  }
  await db.batchRow.update({
    where: { id: row.id },
    data: {
      state: "QUEUED",
      error: undefined,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  await db.batchRun.update({ where: { id: row.batchId }, data: { state: "RUNNING" } });
  return { rowId: row.id, runId: row.runId, deduplicated: result.deduplicated };
}
