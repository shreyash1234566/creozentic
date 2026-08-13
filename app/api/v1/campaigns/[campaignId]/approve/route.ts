import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { approveCampaign } from "../../../../../../src/server/campaigns";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    return NextResponse.json({
      data: await approveCampaign(await getRequestContext(request), campaignId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
