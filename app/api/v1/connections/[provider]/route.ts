import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const { provider: connectionId } = await params;
    const connection = await db.connection.findFirst({
      where: { id: connectionId, workspaceId: context.workspaceId },
    });
    if (!connection)
      throw new ApiError(
        404,
        "CONNECTION_NOT_FOUND",
        "The connection was not found in this workspace.",
      );
    await db.connection.update({ where: { id: connection.id }, data: { health: "DISCONNECTED" } });
    return NextResponse.json({ data: { id: connection.id, disconnected: true } });
  } catch (error) {
    return jsonError(error);
  }
}
