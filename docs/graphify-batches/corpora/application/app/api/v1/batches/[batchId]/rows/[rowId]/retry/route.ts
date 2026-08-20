import { NextResponse } from "next/server";
import { idempotencyKey, jsonError } from "../../../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../../../src/server/auth";
import { retryBatchRow } from "../../../../../../../../src/server/batch-controls";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string; rowId: string }> },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { batchId, rowId } = await params;
    return NextResponse.json(
      {
        data: await retryBatchRow(
          await getRequestContext(request),
          batchId,
          rowId,
          idempotencyKey(request, body.idempotencyKey),
        ),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
