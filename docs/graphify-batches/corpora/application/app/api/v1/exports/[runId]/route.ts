import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";
import { createExportManifest, getExportManifest } from "../../../../../src/server/export-service";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    return NextResponse.json({ data: await getExportManifest(context, runId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.runId === "string" && body.runId !== runId)
      throw new ApiError(400, "RUN_ID_MISMATCH", "The body runId must match the route runId.");
    return NextResponse.json({
      data: await createExportManifest(
        context,
        runId,
        idempotencyKey(request, body.idempotencyKey),
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
