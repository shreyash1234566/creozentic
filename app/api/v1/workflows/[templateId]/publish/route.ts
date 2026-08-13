import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { publishWorkflowVersion } from "../../../../../../src/server/workflow-catalog";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { templateId } = await params;
    const body = (await request.json()) as { versionId?: unknown };
    if (typeof body.versionId !== "string" || !body.versionId)
      throw new ApiError(400, "VERSION_REQUIRED", "versionId is required.");
    const result = await publishWorkflowVersion(context, templateId, body.versionId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
