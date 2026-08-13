import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const keys = await db.apiKey.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        userId: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ data: keys });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "INVALID_API_KEY", "name is required.");
    const expiresInDays =
      typeof body.expiresInDays === "number" && Number.isInteger(body.expiresInDays)
        ? Math.min(Math.max(body.expiresInDays, 1), 3650)
        : undefined;
    const rawKey = `azk_live_${randomBytes(32).toString("base64url")}`;
    const key = await db.apiKey.create({
      data: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        name,
        keyPrefix: rawKey.slice(0, 16),
        keyHash: createHash("sha256").update(rawKey).digest("hex"),
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : undefined,
      },
    });
    return NextResponse.json(
      { data: { id: key.id, name: key.name, key: rawKey, expiresAt: key.expiresAt } },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
