import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { idempotencyKey, jsonError, requestId, ApiError } from "../../../../../../src/server/api";
import { enqueueWorkflowRun } from "../../../../../../src/server/queue";
import { failRunInternal, retryRun } from "../../../../../../src/server/workflow-service";
import { db } from "../../../../../../src/server/db";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const retryKey = idempotencyKey(request, body.idempotencyKey);
    const result = await retryRun(context, runId, retryKey);
    if (result.deduplicated)
      return NextResponse.json(
        { data: result },
        { status: result.responseStatus === 503 ? 503 : 200 },
      );
    const queue = await enqueueWorkflowRun({
      runId,
      workspaceId: context.workspaceId,
      correlationId: requestId(request),
      jobId: `workflow-run-${runId}-retry-${retryKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    });
    if (!queue.accepted) {
      await failRunInternal({
        workspaceId: context.workspaceId,
        runId,
        correlationId: requestId(request),
        error: {
          code: "QUEUE_NOT_CONFIGURED",
          message: queue.reason ?? "The workflow queue could not accept this retry.",
        },
      });
      await db.idempotencyKey.update({
        where: { workspaceId_key: { workspaceId: context.workspaceId, key: retryKey } },
        data: {
          responseStatus: 503,
          responseBody: { runId, error: "QUEUE_NOT_CONFIGURED" },
        },
      });
      throw new ApiError(503, "QUEUE_NOT_CONFIGURED", queue.reason ?? "The queue is unavailable.");
    }
    return NextResponse.json({ data: { ...result, queue } }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
