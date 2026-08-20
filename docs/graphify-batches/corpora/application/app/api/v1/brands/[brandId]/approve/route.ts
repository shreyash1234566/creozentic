import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "REVIEWER");
    const { brandId } = await params;
    const brand = await db.brand.findFirst({
      where: { id: brandId, workspaceId: context.workspaceId },
    });
    if (!brand)
      throw new ApiError(404, "BRAND_NOT_FOUND", "The brand was not found in this workspace.");
    const approved = await db.brand.update({
      where: { id: brand.id },
      data: { approvalStatus: "APPROVED", approvedBy: context.userId, approvedAt: new Date() },
    });
    await db.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "brand.approved",
        targetType: "brand",
        targetId: brand.id,
        correlationId: context.correlationId,
        metadata: { version: approved.version },
      },
    });
    return NextResponse.json({ data: approved });
  } catch (error) {
    return jsonError(error);
  }
}
