import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const consents = await db.consentRecord.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ data: consents });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    if (!subject || !purpose)
      throw new ApiError(400, "INVALID_CONSENT", "subject and purpose are required.");
    const assetId = typeof body.assetId === "string" ? body.assetId : undefined;
    if (
      assetId &&
      !(await db.asset.findFirst({
        where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new ApiError(
        404,
        "ASSET_NOT_FOUND",
        "The consent asset was not found in this workspace.",
      );
    const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime()))
      throw new ApiError(400, "INVALID_CONSENT", "expiresAt must be a valid ISO date.");
    const consent = await db.consentRecord.create({
      data: {
        workspaceId: context.workspaceId,
        subject,
        assetId,
        purpose,
        scope:
          body.scope && typeof body.scope === "object"
            ? (body.scope as Prisma.InputJsonValue)
            : { granted: true },
        expiresAt,
        evidenceKey: typeof body.evidenceKey === "string" ? body.evidenceKey : undefined,
      },
    });
    return NextResponse.json({ data: consent }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
