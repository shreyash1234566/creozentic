import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { decideReviewLink } from "../../../../../../src/server/review-links";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const decision =
      body.decision === "approve" || body.decision === "reject" || body.decision === "refine"
        ? body.decision
        : "";
    if (!decision)
      throw new ApiError(
        400,
        "INVALID_REVIEW_DECISION",
        "decision must be approve, reject, or refine.",
      );
    return NextResponse.json({
      data: await decideReviewLink(token, {
        decision,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        reviewerName: typeof body.reviewerName === "string" ? body.reviewerName : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
