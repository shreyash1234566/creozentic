import { NextResponse } from "next/server";
import { db } from "../../../../src/server/db";
import { ApiError, jsonError, requestId } from "../../../../src/server/api";
import { authenticatedUserId } from "../../../../src/server/auth";

export async function GET(request: Request) {
  try {
    const userId = authenticatedUserId(request);
    const memberships = await db.membership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      data: memberships.map((membership) => ({ ...membership.workspace, role: membership.role })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const userId = authenticatedUserId(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!name || !slug) throw new ApiError(400, "INVALID_WORKSPACE", "name and slug are required.");
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(401, "AUTH_REQUIRED", "The authenticated user does not exist.");
    const workspace = await db.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { name, slug, ownerId: user.id } });
      await tx.membership.create({
        data: { workspaceId: created.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
      });
      await tx.creditAccount.create({ data: { workspaceId: created.id, balance: 0, reserved: 0 } });
      await tx.auditEvent.create({
        data: {
          workspaceId: created.id,
          actorId: user.id,
          action: "workspace.created",
          targetType: "workspace",
          targetId: created.id,
          correlationId,
          metadata: { slug },
        },
      });
      return created;
    });
    return NextResponse.json({ data: workspace }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
