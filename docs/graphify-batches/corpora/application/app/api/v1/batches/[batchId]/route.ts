import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { getRequestContext } from "../../../../../src/server/auth";
import { updateBatchState } from "../../../../../src/server/batch-controls";
import { db } from "../../../../../src/server/db";

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { batchId } = await params;
    const batch = await db.batchRun.findFirst({
      where: { id: batchId, workspaceId: context.workspaceId },
      include: {
        rows: { orderBy: { rowNumber: "asc" } },
      },
    });
    if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", "The batch was not found.");
    return NextResponse.json({ data: batch });
  } catch (error) {
    return jsonError(error);
  }
}

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
