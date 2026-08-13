import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";
import { encryptConnectionSecret } from "../../../../src/server/secrets";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const connections = await db.connection.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { provider: "asc" },
      select: {
        id: true,
        provider: true,
        scopes: true,
        health: true,
        expiresAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ data: connections });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const body = (await request.json()) as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    if (!provider || !accessToken)
      throw new ApiError(400, "INVALID_CONNECTION", "provider and accessToken are required.");
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime()))
      throw new ApiError(400, "INVALID_CONNECTION", "expiresAt must be a valid date.");
    const health = expiresAt && expiresAt.getTime() < Date.now() ? "EXPIRED" : "HEALTHY";
    const connection = await db.connection.upsert({
      where: { workspaceId_provider: { workspaceId: context.workspaceId, provider } },
      update: {
        encryptedRef: encryptConnectionSecret({
          accessToken,
          refreshToken: typeof body.refreshToken === "string" ? body.refreshToken : undefined,
        }),
        scopes,
        health,
        expiresAt,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      },
      create: {
        workspaceId: context.workspaceId,
        provider,
        encryptedRef: encryptConnectionSecret({
          accessToken,
          refreshToken: typeof body.refreshToken === "string" ? body.refreshToken : undefined,
        }),
        scopes,
        health,
        expiresAt,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      },
      select: {
        id: true,
        provider: true,
        scopes: true,
        health: true,
        expiresAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ data: connection }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
