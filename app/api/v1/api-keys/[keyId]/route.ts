import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const { keyId } = await params;
    const key = await db.apiKey.findFirst({
      where: { id: keyId, workspaceId: context.workspaceId },
    });
    if (!key)
      throw new ApiError(404, "API_KEY_NOT_FOUND", "The API key was not found in this workspace.");
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ data: { id: key.id, revoked: true } });
  } catch (error) {
    return jsonError(error);
  }
}
