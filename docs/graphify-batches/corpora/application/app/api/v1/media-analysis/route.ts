import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { analyzeMediaAsset } from "../../../../src/server/asset-intelligence";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "VIEWER");
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (assetId)
      return NextResponse.json({
        data: await db.mediaAnalysis.findFirst({
          where: { workspaceId: context.workspaceId, assetId },
        }),
      });
    return NextResponse.json({
      data: await db.mediaAnalysis.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.assetId !== "string")
      throw new ApiError(400, "ASSET_ID_REQUIRED", "assetId is required.");
    return NextResponse.json(
      { data: await analyzeMediaAsset(context, body.assetId) },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
