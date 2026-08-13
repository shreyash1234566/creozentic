import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../../src/server/api";
import { releaseCustomModel } from "../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.modelVersion !== "string" || typeof body.evaluationId !== "string")
      throw new ApiError(
        400,
        "INVALID_MODEL_RELEASE",
        "modelVersion and evaluationId are required.",
      );
    return NextResponse.json({
      data: await releaseCustomModel(await getRequestContext(request), (await params).projectId, {
        modelVersion: body.modelVersion,
        evaluationId: body.evaluationId,
        providerRef: typeof body.providerRef === "string" ? body.providerRef : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
