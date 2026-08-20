import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { retryDailyPublication } from "../../../../../../src/server/daily-publishing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationJobId: string }> },
) {
  try {
    const { publicationJobId } = await params;
    return NextResponse.json(
      { data: await retryDailyPublication(await getRequestContext(request), publicationJobId) },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
