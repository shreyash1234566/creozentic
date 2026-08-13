import { NextResponse } from "next/server";
import { db } from "../../../../src/server/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "creozentic-api", database: "ready" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, service: "creozentic-api", database: "unavailable" },
      { status: 503 },
    );
  }
}
