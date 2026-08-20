import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getRequestContext } from "../../../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";
import { triggerSchedule } from "../../../../../../src/server/schedule";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  try {
    const { scheduleId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      select: { workspaceId: true, createdBy: true, triggerSecretHash: true },
    });
    if (!schedule)
      return NextResponse.json(
        { error: { code: "SCHEDULE_NOT_FOUND", message: "The schedule was not found." } },
        { status: 404 },
      );
    const supplied = request.headers.get("x-schedule-secret");
    const secretValid = Boolean(
      supplied &&
      schedule.triggerSecretHash &&
      createHash("sha256").update(supplied).digest("hex") === schedule.triggerSecretHash,
    );
    let context;
    try {
      context = await getRequestContext(request);
    } catch (error) {
      if (!secretValid) throw error;
      const membership = await db.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: schedule.workspaceId,
            userId: schedule.createdBy,
          },
        },
        select: { role: true, status: true },
      });
      if (!membership || membership.status !== "ACTIVE") throw error;
      context = {
        workspaceId: schedule.workspaceId,
        userId: schedule.createdBy,
        role: membership.role,
        correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      };
    }
    if (context.workspaceId !== schedule.workspaceId)
      return NextResponse.json(
        {
          error: {
            code: "WORKSPACE_ACCESS_DENIED",
            message: "The schedule is outside this workspace.",
          },
        },
        { status: 403 },
      );
    if (schedule.triggerSecretHash) {
      const apiKey = request.headers.get("x-api-key");
      if (!secretValid && !apiKey)
        return NextResponse.json(
          {
            error: {
              code: "SCHEDULE_SECRET_REQUIRED",
              message: "A schedule secret or API key is required.",
            },
          },
          { status: 401 },
        );
      if (supplied && !secretValid)
        return NextResponse.json(
          {
            error: { code: "SCHEDULE_SECRET_INVALID", message: "The schedule secret is invalid." },
          },
          { status: 403 },
        );
    }
    const result = await triggerSchedule(
      context,
      scheduleId,
      idempotencyKey(request, body.triggerKey),
    );
    return NextResponse.json({ data: result }, { status: result.deduplicated ? 200 : 202 });
  } catch (error) {
    return jsonError(error);
  }
}
