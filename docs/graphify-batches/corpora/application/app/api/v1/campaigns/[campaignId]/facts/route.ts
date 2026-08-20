import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { createCampaignFacts } from "../../../../../../src/server/campaign-reliability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const body = (await request.json()) as { facts?: unknown };
    const facts = Array.isArray(body.facts)
      ? body.facts
          .filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item)),
          )
          .map((item) => ({
            field: typeof item.field === "string" ? item.field : "",
            value: item.value,
            source: typeof item.source === "string" ? item.source : undefined,
            state: typeof item.state === "string" ? item.state : undefined,
            expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : undefined,
          }))
      : [];
    const { campaignId } = await params;
    return NextResponse.json(
      { data: await createCampaignFacts(await getRequestContext(request), campaignId, facts) },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
