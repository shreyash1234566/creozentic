import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { exportCustomModelProject } from "../../../../../../src/server/phase5";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    return NextResponse.json({
      data: await exportCustomModelProject(
        await getRequestContext(request),
        (await params).projectId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
