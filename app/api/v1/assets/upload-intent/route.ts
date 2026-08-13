import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AssetType, Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";
import { createUploadIntent, objectKeyFor } from "../../../../../src/server/storage";

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, "INVALID_UPLOAD", `${field} is required.`);
  return value.trim();
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const name = requiredText(body.name, "name");
    const mimeType = requiredText(body.mimeType, "mimeType");
    const rawByteSize = body.byteSize;
    const byteSize =
      typeof rawByteSize === "number" && Number.isInteger(rawByteSize) && rawByteSize > 0
        ? rawByteSize
        : undefined;
    if (rawByteSize !== undefined && byteSize === undefined)
      throw new ApiError(400, "INVALID_UPLOAD_SIZE", "byteSize must be a positive integer.");
    if (
      !/^(image|video|audio|font)\//i.test(mimeType) &&
      !["application/pdf", "application/zip", "text/csv"].includes(mimeType.toLowerCase())
    )
      throw new ApiError(415, "UNSUPPORTED_UPLOAD_TYPE", "This asset file type is not supported.");
    if (byteSize !== undefined && byteSize > 500 * 1024 * 1024)
      throw new ApiError(413, "UPLOAD_TOO_LARGE", "Assets must be 500 MB or smaller.");
    const contentHash =
      typeof body.contentHash === "string" && body.contentHash.trim()
        ? body.contentHash.trim()
        : `pending-${randomUUID()}`;
    const type =
      typeof body.type === "string" && body.type.toUpperCase() in AssetType
        ? (body.type.toUpperCase() as AssetType)
        : AssetType.ORIGINAL;
    const duplicate = await db.asset.findUnique({
      where: {
        workspaceId_contentHash: {
          workspaceId: context.workspaceId,
          contentHash,
        },
      },
    });
    if (duplicate && duplicate.deletedAt === null)
      return NextResponse.json({
        data: {
          asset: duplicate,
          uploadUrl: null,
          expiresIn: 0,
          method: "PUT",
          headers: {},
          duplicate: true,
        },
      });
    const assetId = randomUUID();
    const objectKey = objectKeyFor(context.workspaceId, assetId, name);
    const upload = await createUploadIntent({ objectKey, mimeType, byteSize });
    const brandId = typeof body.brandId === "string" ? body.brandId : undefined;
    const productId = typeof body.productId === "string" ? body.productId : undefined;
    if (brandId || productId) {
      const [brand, product] = await Promise.all([
        brandId
          ? db.brand.findFirst({
              where: { id: brandId, workspaceId: context.workspaceId },
              select: { id: true },
            })
          : null,
        productId
          ? db.product.findFirst({
              where: { id: productId, workspaceId: context.workspaceId },
              select: { id: true },
            })
          : null,
      ]);
      if (brandId && !brand)
        throw new ApiError(404, "BRAND_NOT_FOUND", "The brand does not belong to this workspace.");
      if (productId && !product)
        throw new ApiError(
          404,
          "PRODUCT_NOT_FOUND",
          "The product does not belong to this workspace.",
        );
    }
    const asset = await db.asset.create({
      data: {
        id: assetId,
        workspaceId: context.workspaceId,
        brandId,
        productId,
        type,
        status: "UPLOADING",
        name,
        objectKey,
        contentHash,
        mimeType,
        byteSize,
        metadata: (body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return NextResponse.json(
      {
        data: {
          asset,
          uploadUrl: upload.uploadUrl,
          expiresIn: upload.expiresIn,
          method: "PUT",
          headers: { "content-type": mimeType },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
