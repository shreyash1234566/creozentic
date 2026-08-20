import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { getDailyPlan } from "../../../../../src/server/daily-autopilot";

export async function GET(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { planId } = await params;
    return NextResponse.json({ data: await getDailyPlan(context, planId) });
  } catch (error) {
    return jsonError(error);
  }
}
