import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { updateDeployedApp } from "../../../../../src/server/deployed-apps";

export async function PATCH(request: Request, { params }: { params: Promise<{ appId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { appId } = await params;
    const body = (await request.json()) as { status?: unknown; versionId?: unknown };
    const status = typeof body.status === "string" ? body.status : undefined;
    const versionId = typeof body.versionId === "string" ? body.versionId : undefined;
    if (!status && !versionId)
      throw new ApiError(400, "PATCH_REQUIRED", "status or versionId is required.");
    return NextResponse.json({
      data: await updateDeployedApp(context, appId, { status, versionId }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
