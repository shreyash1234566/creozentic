import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ consentId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const { consentId } = await params;
    const existing = await db.consentRecord.findFirst({
      where: { id: consentId, workspaceId: context.workspaceId },
    });
    if (!existing)
      throw new ApiError(
        404,
        "CONSENT_NOT_FOUND",
        "The consent record was not found in this workspace.",
      );
    const revoked = await db.consentRecord.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ data: revoked });
  } catch (error) {
    return jsonError(error);
  }
}
