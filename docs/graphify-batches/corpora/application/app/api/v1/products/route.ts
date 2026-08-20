import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const products = await db.product.findMany({
      where: {
        workspaceId: context.workspaceId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 1000),
      include: {
        brand: { select: { id: true, name: true, version: true } },
        assets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    return NextResponse.json({ data: products });
  } catch (error) {
    return jsonError(error);
  }
}
