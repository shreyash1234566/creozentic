import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { deleteCompetitorSource } from "../../../../../src/server/phase5";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    return NextResponse.json({
      data: await deleteCompetitorSource(await getRequestContext(request), (await params).sourceId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
