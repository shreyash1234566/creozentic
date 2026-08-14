import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { updatePerformanceRecommendation } from "../../../../../../src/server/performance-recommendations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recommendationId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const status =
      body.status === "APPLIED" || body.status === "DISMISSED" || body.status === "OPEN"
        ? body.status
        : undefined;
    return NextResponse.json({
      data: await updatePerformanceRecommendation(
        await getRequestContext(request),
        (await params).recommendationId,
        {
          status,
          optOut: typeof body.optOut === "boolean" ? body.optOut : undefined,
          action: typeof body.action === "string" ? body.action : undefined,
        },
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
