import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { dispatchPendingNotifications } from "../../../../../src/server/notifications";

function cronAuthorized(request: Request) {
  const configured = process.env.NOTIFICATION_CRON_SECRET;
  const supplied = request.headers.get("x-notification-cron-secret");
  if (!configured || !supplied) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const cron = cronAuthorized(request);
    if (!cron) {
      const context = await getRequestContext(request);
      requireRole(context, "ADMIN");
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = typeof body.limit === "number" ? body.limit : 100;
    return NextResponse.json({ data: await dispatchPendingNotifications(limit) });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error);
    return jsonError(error);
  }
}
