import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { db } from "../../../../../../src/server/db";
import { createDeliveryRule } from "../../../../../../src/server/campaign-reliability";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { campaignId } = await params;
    return NextResponse.json({
      data: await db.deliveryRule.findMany({
        where: { workspaceId: context.workspaceId, campaignId },
        orderBy: { updatedAt: "desc" },
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.what !== "string")
      throw new ApiError(400, "INVALID_DELIVERY_RULE", "what is required.");
    const { campaignId } = await params;
    return NextResponse.json(
      {
        data: await createDeliveryRule(await getRequestContext(request), campaignId, {
          what: body.what,
          source:
            body.source && typeof body.source === "object" && !Array.isArray(body.source)
              ? (body.source as Record<string, unknown>)
              : { type: "campaign" },
          maxCostMinor: typeof body.maxCostMinor === "number" ? body.maxCostMinor : undefined,
          approvalMode: typeof body.approvalMode === "string" ? body.approvalMode : undefined,
          schedule:
            body.schedule && typeof body.schedule === "object" && !Array.isArray(body.schedule)
              ? (body.schedule as Record<string, unknown>)
              : undefined,
          fallback: typeof body.fallback === "string" ? body.fallback : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
