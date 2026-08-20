import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { refreshCompetitorSource } from "../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    return NextResponse.json(
      {
        data: await refreshCompetitorSource(
          await getRequestContext(request),
          (await params).sourceId,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
