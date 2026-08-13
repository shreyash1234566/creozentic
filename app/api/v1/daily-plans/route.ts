import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../src/server/api";
import { createDailyPlan, listDailyPlans } from "../../../../src/server/daily-autopilot";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listDailyPlans(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createDailyPlan(context, {
      brandId: typeof body.brandId === "string" ? body.brandId : undefined,
      planDate: typeof body.planDate === "string" ? body.planDate : undefined,
      autonomyMode: typeof body.autonomyMode === "string" ? body.autonomyMode : undefined,
      channel: typeof body.channel === "string" ? body.channel : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
      contentTypes: Array.isArray(body.contentTypes)
        ? body.contentTypes.filter((item): item is string => typeof item === "string")
        : undefined,
      productIds: Array.isArray(body.productIds)
        ? body.productIds.filter((item): item is string => typeof item === "string")
        : undefined,
      campaignIds: Array.isArray(body.campaignIds)
        ? body.campaignIds.filter((item): item is string => typeof item === "string")
        : undefined,
      reviewerId: typeof body.reviewerId === "string" ? body.reviewerId : undefined,
      source: typeof body.source === "string" ? body.source : "DASHBOARD",
      scheduleId: typeof body.scheduleId === "string" ? body.scheduleId : undefined,
    });
    return NextResponse.json({ data: result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
