import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError, ApiError } from "../../../../src/server/api";
import { listConsistencyChecks, recordConsistencyCheck } from "../../../../src/server/consistency";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listConsistencyChecks(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.referencePackId !== "string" || typeof body.confidence !== "number")
      throw new ApiError(
        400,
        "INVALID_CONSISTENCY_CHECK",
        "referencePackId and numeric confidence are required.",
      );
    const verdict =
      body.verdict === "PASS" || body.verdict === "WARN" || body.verdict === "CRITICAL"
        ? body.verdict
        : undefined;
    return NextResponse.json(
      {
        data: await recordConsistencyCheck(context, {
          referencePackId: body.referencePackId,
          runId: typeof body.runId === "string" ? body.runId : undefined,
          outputAssetId: typeof body.outputAssetId === "string" ? body.outputAssetId : undefined,
          sourceAssetId: typeof body.sourceAssetId === "string" ? body.sourceAssetId : undefined,
          confidence: body.confidence,
          verdict,
          drift: body.drift,
          metadata: body.metadata,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
