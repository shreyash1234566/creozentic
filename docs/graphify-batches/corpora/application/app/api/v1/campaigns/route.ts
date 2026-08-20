import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../src/server/api";
import { getRequestContext } from "../../../../src/server/auth";
import { createCampaign, listCampaigns } from "../../../../src/server/campaigns";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listCampaigns(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.name !== "string" || typeof body.objective !== "string")
      throw new ApiError(400, "INVALID_CAMPAIGN", "name and objective are required.");
    return NextResponse.json(
      {
        data: await createCampaign(await getRequestContext(request), {
          name: body.name,
          objective: body.objective,
          brandId: typeof body.brandId === "string" ? body.brandId : undefined,
          productIds: Array.isArray(body.productIds)
            ? body.productIds.filter((value): value is string => typeof value === "string")
            : [],
          channels: Array.isArray(body.channels)
            ? body.channels.filter((value): value is string => typeof value === "string")
            : [],
          offer:
            body.offer && typeof body.offer === "object" && !Array.isArray(body.offer)
              ? (body.offer as Record<string, unknown>)
              : undefined,
          audience:
            body.audience && typeof body.audience === "object" && !Array.isArray(body.audience)
              ? (body.audience as Record<string, unknown>)
              : undefined,
          legalCopy:
            body.legalCopy && typeof body.legalCopy === "object" && !Array.isArray(body.legalCopy)
              ? (body.legalCopy as Record<string, unknown>)
              : undefined,
          evidence:
            body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence)
              ? (body.evidence as Record<string, unknown>)
              : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
