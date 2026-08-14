import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { listCampaignEvents } from "../../../../../../src/server/campaign-reliability";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    return NextResponse.json({
      data: await listCampaignEvents(await getRequestContext(request), campaignId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
