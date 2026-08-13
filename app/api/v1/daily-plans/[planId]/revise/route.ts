import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { reviseDailyPlan } from "../../../../../../src/server/daily-autopilot";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { planId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.instruction !== "string")
      throw new ApiError(400, "REVISION_REQUIRED", "instruction is required.");
    return NextResponse.json({
      data: await reviseDailyPlan(context, planId, {
        gateId: typeof body.gateId === "string" ? body.gateId : undefined,
        instruction: body.instruction,
        category: typeof body.category === "string" ? body.category : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
