import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { planUGCShots } from "../../../../../../../src/server/production-services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    return NextResponse.json({
      data: await planUGCShots(await getRequestContext(request), projectId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
