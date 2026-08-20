import { NextResponse } from "next/server";
import { MembershipRole, Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

const inviteRoles: MembershipRole[] = [
  "STRATEGIST",
  "EDITOR",
  "REVIEWER",
  "CLIENT",
  "PUBLISHER",
  "BILLING",
  "VIEWER",
];

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const members = await db.membership.findMany({
      where: { workspaceId: context.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: members });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role =
      typeof body.role === "string" &&
      inviteRoles.includes(body.role.toUpperCase() as MembershipRole)
        ? (body.role.toUpperCase() as MembershipRole)
        : "VIEWER";
    if (!email || !name)
      throw new ApiError(400, "INVALID_MEMBERSHIP", "name and email are required.");
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: { name },
        create: { email, name },
      });
      const membership = await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId: context.workspaceId, userId: user.id } },
        update: { role, status: "INVITED" },
        create: { workspaceId: context.workspaceId, userId: user.id, role, status: "INVITED" },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "membership.invited",
          targetType: "membership",
          targetId: membership.id,
          correlationId: context.correlationId,
          metadata: { email, role } as Prisma.InputJsonValue,
        },
      });
      return membership;
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
