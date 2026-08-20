import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError, requestId, ApiError } from "../../../../src/server/api";
import { createRun, failRunInternal, listRuns } from "../../../../src/server/workflow-service";
import { enqueueWorkflowRun } from "../../../../src/server/queue";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    return NextResponse.json({ data: await listRuns(context) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createRun(context, {
      title: typeof body.title === "string" ? body.title : "Creative workflow run",
      brief: body.brief,
      idempotencyKey: idempotencyKey(request, body.idempotencyKey),
    });
    const queue = result.deduplicated
      ? { accepted: true, driver: "idempotent-replay", deduplicated: true, reason: undefined }
      : await enqueueWorkflowRun({
          runId: result.run.id,
          workspaceId: context.workspaceId,
          correlationId: requestId(request),
        });
    if (!queue.accepted) {
      await failRunInternal({
        workspaceId: context.workspaceId,
        runId: result.run.id,
        correlationId: requestId(request),
        error: {
          code: "QUEUE_NOT_CONFIGURED",
          message: queue.reason ?? "The workflow queue could not accept this run.",
        },
      });
      throw new ApiError(
        503,
        "QUEUE_NOT_CONFIGURED",
        queue.reason ?? "The workflow queue could not accept this run.",
      );
    }
    return NextResponse.json(
      {
        data: {
          run: result.run,
          quote: result.quote,
          queue,
          deduplicated: result.deduplicated,
          warnings: queue.accepted ? [] : [queue.reason],
        },
      },
      { status: result.deduplicated ? 200 : 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
