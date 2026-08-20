import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../src/server/api";
import { createModelComparison } from "../../../../src/server/production-services";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const modelRefs = Array.isArray(body.modelRefs)
      ? body.modelRefs.filter((value): value is string => typeof value === "string")
      : [];
    if (typeof body.prompt !== "string" || !body.prompt.trim() || !modelRefs.length)
      throw new ApiError(400, "INVALID_COMPARISON", "prompt and modelRefs are required.");
    const inputAssetIds = Array.isArray(body.inputAssetIds)
      ? body.inputAssetIds.filter((value): value is string => typeof value === "string")
      : [];
    const constraints =
      body.constraints && typeof body.constraints === "object" && !Array.isArray(body.constraints)
        ? (body.constraints as Record<string, unknown>)
        : {};
    return NextResponse.json(
      {
        data: await createModelComparison(context, {
          prompt: body.prompt,
          modelRefs,
          inputAssetIds,
          constraints,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
