import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";
import { createCheckout } from "../../../../../src/server/billing-lifecycle";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const units = typeof body.units === "number" && Number.isInteger(body.units) ? body.units : 0;
    const provider =
      body.provider === "stripe" ? "stripe" : body.provider === "razorpay" ? "razorpay" : "";
    if (units < 1 || units > 100000 || !provider)
      throw new ApiError(
        400,
        "INVALID_TOPUP",
        "provider and units between 1 and 100000 are required.",
      );
    const key = idempotencyKey(request, body.idempotencyKey);
    return NextResponse.json(
      {
        data: await createCheckout(context, {
          provider,
          units,
          amountMinor: typeof body.amountMinor === "number" ? body.amountMinor : undefined,
          currency: typeof body.currency === "string" ? body.currency : undefined,
          plan: typeof body.plan === "string" ? body.plan : undefined,
          idempotencyKey: key,
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
