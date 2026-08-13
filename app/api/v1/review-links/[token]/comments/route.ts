import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { addReviewLinkComment } from "../../../../../../src/server/review-links";
import {
  normalizeMentions,
  normalizeReviewAnchor,
} from "../../../../../../src/server/review-comments";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await addReviewLinkComment(token, {
          text: typeof body.text === "string" ? body.text : "",
          region: typeof body.region === "string" ? body.region : undefined,
          anchor: normalizeReviewAnchor(body.anchor),
          mentions: normalizeMentions(body.mentions),
          parentId: typeof body.parentId === "string" ? body.parentId : undefined,
          reviewerName: typeof body.reviewerName === "string" ? body.reviewerName : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
