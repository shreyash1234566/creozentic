import { NextResponse } from "next/server";
import { AssetStatus, AssetType } from "@prisma/client";
import { getRequestContext } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

function oneOf<T extends string>(value: string | null, values: readonly T[]) {
  if (!value || !values.includes(value as T)) return undefined;
  return value as T;
}

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const type = oneOf(url.searchParams.get("type"), Object.values(AssetType));
    const status = oneOf(url.searchParams.get("status"), Object.values(AssetStatus));
    const take = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
    const assets = await db.asset.findMany({
      where: {
        workspaceId: context.workspaceId,
        deletedAt: url.searchParams.get("includeDeleted") === "true" ? undefined : null,
        type,
        status,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { contentHash: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        brand: { select: { id: true, name: true, version: true } },
        product: { select: { id: true, sku: true, title: true } },
      },
    });
    return NextResponse.json({ data: assets });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as { assetIds?: unknown };
    const assetIds = Array.isArray(body.assetIds)
      ? body.assetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (assetIds.length === 0 || assetIds.length > 100)
      throw new ApiError(400, "INVALID_ASSET_IDS", "assetIds must contain between 1 and 100 IDs.");
    const result = await db.asset.updateMany({
      where: { workspaceId: context.workspaceId, id: { in: assetIds }, deletedAt: null },
      data: { status: "SOFT_DELETED", deletedAt: new Date() },
    });
    return NextResponse.json({ data: { deleted: result.count } });
  } catch (error) {
    return jsonError(error);
  }
}
