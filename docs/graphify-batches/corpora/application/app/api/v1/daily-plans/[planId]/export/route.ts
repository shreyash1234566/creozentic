import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { exportDailyPlan } from "../../../../../../src/server/daily-delivery";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { planId } = await params;
    return NextResponse.json({ data: await exportDailyPlan(context, planId) });
  } catch (error) {
    return jsonError(error);
  }
}
