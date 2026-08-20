import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { pollDailyPublication } from "../../../../../../src/server/daily-publishing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationJobId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { publicationJobId } = await params;
    return NextResponse.json({ data: await pollDailyPublication(context, publicationJobId) });
  } catch (error) {
    return jsonError(error);
  }
}
