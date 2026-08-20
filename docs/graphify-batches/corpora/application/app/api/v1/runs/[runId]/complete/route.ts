import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { completeRunInternal } from "../../../../../../src/server/workflow-service";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const expected = process.env.RUNNER_TOKEN;
    if (!expected || request.headers.get("x-runner-token") !== expected)
      throw new ApiError(
        401,
        "RUNNER_AUTH_REQUIRED",
        "Only the configured workflow runner may complete a run.",
      );
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) throw new ApiError(400, "WORKSPACE_REQUIRED", "x-workspace-id is required.");
    const { runId } = await params;
    const body = await request.json();
    const result = await completeRunInternal(
      {
        workspaceId,
        userId: "system-runner",
        role: "OWNER",
        correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      },
      runId,
      body,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
