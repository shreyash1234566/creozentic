import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { refreshConnectionToken } from "../../../../../../src/server/connector-oauth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const { connectionId } = await params;
    return NextResponse.json({
      data: await refreshConnectionToken(connectionId, context.workspaceId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
