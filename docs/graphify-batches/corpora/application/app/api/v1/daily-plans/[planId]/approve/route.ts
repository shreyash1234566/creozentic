import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { approveDailyPlan } from "../../../../../../src/server/daily-autopilot";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { planId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const gateIds = Array.isArray(body.gateIds)
      ? body.gateIds.filter((item): item is string => typeof item === "string")
      : undefined;
    return NextResponse.json({ data: await approveDailyPlan(context, planId, gateIds) });
  } catch (error) {
    return jsonError(error);
  }
}
