import { NextResponse } from "next/server";
import { db } from "../../../../../src/server/db";
import { checkQueueReadiness } from "../../../../../src/server/health";

export async function GET() {
  const checks: Record<string, unknown> = {};
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ready: true };
  } catch {
    checks.database = { ready: false };
  }
  checks.queue = await checkQueueReadiness();
  const ready = Object.values(checks).every(
    (check) => (check as { ready?: boolean }).ready === true,
  );
  return NextResponse.json({ ok: ready, checks }, { status: ready ? 200 : 503 });
}
