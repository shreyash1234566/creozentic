import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const planId = new URL(request.url).searchParams.get("planId");
    const runs = await db.agentRun.findMany({
      where: { workspaceId: context.workspaceId, ...(planId ? { dailyPlanId: planId } : {}) },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: { failures: true },
    });
    return NextResponse.json({ data: runs });
  } catch (error) {
    return jsonError(error);
  }
}
