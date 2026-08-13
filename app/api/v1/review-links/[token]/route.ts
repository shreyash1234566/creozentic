import { NextResponse } from "next/server";
import { jsonError } from "../../../../../src/server/api";
import { readReviewLink } from "../../../../../src/server/review-links";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return NextResponse.json({ data: await readReviewLink(token) });
  } catch (error) {
    return jsonError(error);
  }
}
