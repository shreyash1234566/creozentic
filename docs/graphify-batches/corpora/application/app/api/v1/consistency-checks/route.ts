import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError, ApiError } from "../../../../src/server/api";
import {
  evaluateConsistencyCheck,
  listConsistencyChecks,
} from "../../../../src/server/consistency";

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
    if (typeof body.referencePackId !== "string")
      throw new ApiError(
        400,
        "INVALID_CONSISTENCY_CHECK",
        "referencePackId is required; confidence and verdict must come from the vision provider.",
      );
    return NextResponse.json(
      {
        data: await evaluateConsistencyCheck(context, {
          referencePackId: body.referencePackId,
          runId: typeof body.runId === "string" ? body.runId : undefined,
          outputAssetId: typeof body.outputAssetId === "string" ? body.outputAssetId : undefined,
          sourceAssetId: typeof body.sourceAssetId === "string" ? body.sourceAssetId : undefined,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
