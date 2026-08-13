import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";
import { createDownloadUrl } from "../../../../../../src/server/storage";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { assetId } = await params;
    const asset = await db.asset.findFirst({
      where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
      select: { id: true, objectKey: true, status: true },
    });
    if (!asset)
      throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
    if (["UPLOADING", "QUARANTINED", "SOFT_DELETED"].includes(asset.status))
      throw new ApiError(409, "ASSET_NOT_READY", "The asset is not available for download.");
    const signed = await createDownloadUrl({ objectKey: asset.objectKey, expiresIn: 900 });
    return NextResponse.json({
      data: { assetId: asset.id, url: signed.url, expiresIn: signed.expiresIn },
    });
  } catch (error) {
    return jsonError(error);
  }
}
