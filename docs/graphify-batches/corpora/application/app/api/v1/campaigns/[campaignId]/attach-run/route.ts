import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { attachCampaignToRun } from "../../../../../../src/server/campaign-reliability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.runId !== "string" || !body.runId.trim())
      throw new ApiError(400, "INVALID_RUN", "runId is required.");
    const { campaignId } = await params;
    return NextResponse.json({
      data: await attachCampaignToRun(await getRequestContext(request), body.runId, campaignId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
