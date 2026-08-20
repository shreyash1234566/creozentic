import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { getUGCProject } from "../../../../../../src/server/production-services";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    return NextResponse.json({
      data: await getUGCProject(await getRequestContext(_request), (await params).projectId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
