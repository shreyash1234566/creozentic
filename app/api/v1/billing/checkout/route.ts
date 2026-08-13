import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";
import { createCheckout } from "../../../../../src/server/billing-lifecycle";
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (body.provider !== "stripe" && body.provider !== "razorpay")
      throw new ApiError(400, "INVALID_BILLING_PROVIDER", "provider must be stripe or razorpay.");
    return NextResponse.json(
      {
        data: await createCheckout(context, {
          provider: body.provider,
          units: typeof body.units === "number" ? body.units : undefined,
          plan: typeof body.plan === "string" ? body.plan : undefined,
          amountMinor: typeof body.amountMinor === "number" ? body.amountMinor : undefined,
          currency: typeof body.currency === "string" ? body.currency : undefined,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
