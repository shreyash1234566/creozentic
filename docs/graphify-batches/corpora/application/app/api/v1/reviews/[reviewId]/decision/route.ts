import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { decideReview } from "../../../../../../src/server/workflow-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { reviewId } = await params;
    const body = (await request.json()) as {
      decision?: string;
      reason?: string;
      approvedOutputIds?: unknown;
    };
    if (body.decision !== "approve" && body.decision !== "reject" && body.decision !== "refine")
      return NextResponse.json(
        {
          error: {
            code: "INVALID_DECISION",
            message: "decision must be approve, reject, or refine.",
          },
        },
        { status: 400 },
      );
    return NextResponse.json({
      data: await decideReview(context, reviewId, {
        decision: body.decision,
        reason: body.reason,
        approvedOutputIds: Array.isArray(body.approvedOutputIds)
          ? body.approvedOutputIds.filter((value): value is string => typeof value === "string")
          : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
