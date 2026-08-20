import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { commitModelComparison } from "../../../../../../src/server/production-services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.outputId !== "string")
      throw new ApiError(400, "OUTPUT_ID_REQUIRED", "outputId is required.");
    return NextResponse.json({
      data: await commitModelComparison(context, (await params).comparisonId, body.outputId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
