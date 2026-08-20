import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { getWorkspaceState } from "../../../../../../src/server/workflow-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const context = await getRequestContext(request);
    if (context.workspaceId !== workspaceId)
      throw new ApiError(403, "WORKSPACE_ACCESS_DENIED", "Workspace access is not permitted.");
    return NextResponse.json({ data: await getWorkspaceState(context) });
  } catch (error) {
    return jsonError(error);
  }
}
