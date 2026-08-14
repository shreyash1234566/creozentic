import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { updateDeliveryRule } from "../../../../../../../src/server/campaign-reliability";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; ruleId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { campaignId, ruleId } = await params;
    return NextResponse.json({
      data: await updateDeliveryRule(await getRequestContext(request), campaignId, ruleId, {
        paused: typeof body.paused === "boolean" ? body.paused : undefined,
        maxCostMinor: typeof body.maxCostMinor === "number" ? body.maxCostMinor : undefined,
        approvalMode: typeof body.approvalMode === "string" ? body.approvalMode : undefined,
        fallback: typeof body.fallback === "string" ? body.fallback : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
