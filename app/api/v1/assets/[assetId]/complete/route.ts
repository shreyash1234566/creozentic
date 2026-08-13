import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";
import { deleteObject, verifyUploadedObject } from "../../../../../../src/server/storage";
import { runAssetGate } from "../../../../../../src/server/asset-intelligence";

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const { assetId } = await params;
    const asset = await db.asset.findFirst({
      where: { id: assetId, workspaceId: context.workspaceId },
    });
    if (!asset)
      throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
    if (asset.status === "READY" || asset.status === "IMMUTABLE")
      return NextResponse.json({ data: asset });
    const uploaded = await verifyUploadedObject({
      objectKey: asset.objectKey,
      expectedByteSize: asset.byteSize ?? undefined,
    });
    await runAssetGate(context, asset.id);
    const updated = await db.asset.update({
      where: { id: asset.id },
      data: {
        status: asset.type === "ORIGINAL" ? "IMMUTABLE" : "READY",
        byteSize: uploaded.byteSize ?? asset.byteSize,
        mimeType: uploaded.mimeType ?? asset.mimeType,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const url = new URL(request.url);
    const purge = url.searchParams.get("purge") === "true";
    requireRole(context, purge ? "ADMIN" : "EDITOR");
    const { assetId } = await params;
    const asset = await db.asset.findFirst({
      where: {
        id: assetId,
        workspaceId: context.workspaceId,
        ...(purge ? {} : { deletedAt: null }),
      },
    });
    if (!asset)
      throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
    if (purge) {
      if (url.searchParams.get("confirm") !== "PURGE_ASSET")
        throw new ApiError(
          400,
          "ASSET_PURGE_CONFIRMATION_REQUIRED",
          "Use confirm=PURGE_ASSET to permanently remove the asset.",
        );
      await deleteObject(asset.objectKey);
      await db.asset.delete({ where: { id: asset.id } });
      await db.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "asset.purged",
          targetType: "asset",
          targetId: asset.id,
          correlationId: context.correlationId,
          metadata: { objectKey: asset.objectKey },
        },
      });
      return NextResponse.json({ data: { id: asset.id, purged: true } });
    }
    const deleted = await db.asset.update({
      where: { id: asset.id },
      data: { status: "SOFT_DELETED", deletedAt: new Date() },
    });
    return NextResponse.json({ data: deleted });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const { assetId } = await params;
    const asset = await db.asset.findFirst({
      where: { id: assetId, workspaceId: context.workspaceId, deletedAt: { not: null } },
    });
    if (!asset)
      throw new ApiError(
        404,
        "ASSET_NOT_FOUND",
        "The soft-deleted asset was not found in this workspace.",
      );
    const restored = await db.asset.update({
      where: { id: asset.id },
      data: { status: "READY", deletedAt: null },
    });
    return NextResponse.json({ data: restored });
  } catch (error) {
    return jsonError(error);
  }
}
