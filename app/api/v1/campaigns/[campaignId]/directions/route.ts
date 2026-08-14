import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import {
  createCampaignDirections,
  getCampaignAggregate,
  selectCampaignDirection,
} from "../../../../../../src/server/campaign-reliability";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const campaign = await getCampaignAggregate(await getRequestContext(request), campaignId);
    return NextResponse.json({ data: campaign.directions ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { campaignId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.directionId === "string")
      return NextResponse.json({
        data: await selectCampaignDirection(context, campaignId, body.directionId),
      });
    return NextResponse.json(
      { data: await createCampaignDirections(context, campaignId) },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
