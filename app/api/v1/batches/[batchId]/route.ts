import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { getRequestContext } from "../../../../../src/server/auth";
import { updateBatchState } from "../../../../../src/server/batch-controls";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const state = body.state;
    if (state !== "PAUSED" && state !== "RUNNING" && state !== "CANCELLED")
      throw new ApiError(
        400,
        "INVALID_BATCH_STATE",
        "state must be PAUSED, RUNNING, or CANCELLED.",
      );
    const { batchId } = await params;
    return NextResponse.json({
      data: await updateBatchState(await getRequestContext(request), batchId, state),
    });
  } catch (error) {
    return jsonError(error);
  }
}
