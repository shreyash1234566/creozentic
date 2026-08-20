import { NextResponse } from "next/server";
import { jsonError } from "../../../../../src/server/api";
import { readReviewLink } from "../../../../../src/server/review-links";
import { limitPublicReviewRequest } from "../../../../../src/server/public-review";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await limitPublicReviewRequest(_request, token, "view");
    return NextResponse.json({ data: await readReviewLink(token) });
  } catch (error) {
    return jsonError(error);
  }
}
