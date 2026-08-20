import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { triggerDueSchedules } from "../../../../../src/server/schedule";

function validSecret(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const expected = process.env.SCHEDULE_CRON_SECRET;
    if (!expected)
      throw new ApiError(
        503,
        "SCHEDULE_CRON_NOT_CONFIGURED",
        "SCHEDULE_CRON_SECRET is required for the scheduler tick.",
      );
    const supplied =
      request.headers.get("x-cron-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!validSecret(supplied ?? null, expected))
      throw new ApiError(
        401,
        "SCHEDULE_CRON_UNAUTHORIZED",
        "The scheduler tick secret is invalid.",
      );
    return NextResponse.json({ data: await triggerDueSchedules() });
  } catch (error) {
    return jsonError(error);
  }
}
