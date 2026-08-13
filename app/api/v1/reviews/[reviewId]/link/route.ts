import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { createReviewLink } from "../../../../../../src/server/review-links";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const { reviewId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await createReviewLink(context, reviewId, {
          expiresInHours: typeof body.expiresInHours === "number" ? body.expiresInHours : undefined,
          maxViews: typeof body.maxViews === "number" ? body.maxViews : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
