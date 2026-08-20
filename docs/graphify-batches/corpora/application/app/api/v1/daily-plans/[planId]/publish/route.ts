import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../../../src/server/api";
import { publishDailyPlan } from "../../../../../../src/server/daily-publishing";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await publishDailyPlan(await getRequestContext(request), {
          planId: (await params).planId,
          connectionId: String(body.connectionId ?? ""),
          platform: String(body.platform ?? ""),
          confirmation:
            body.confirmation &&
            typeof body.confirmation === "object" &&
            !Array.isArray(body.confirmation)
              ? (body.confirmation as Record<string, unknown>)
              : {},
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
