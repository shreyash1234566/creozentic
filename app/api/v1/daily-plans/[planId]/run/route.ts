import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { runDailyPlan } from "../../../../../../src/server/daily-autopilot";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { planId } = await params;
    return NextResponse.json({ data: await runDailyPlan(context, planId) });
  } catch (error) {
    return jsonError(error);
  }
}
