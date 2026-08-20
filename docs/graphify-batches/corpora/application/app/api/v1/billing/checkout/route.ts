import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";
import { createCheckout } from "../../../../../src/server/billing-lifecycle";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const provider =
      body.provider === "stripe" || body.provider === "razorpay" ? body.provider : null;
    if (!provider || (typeof body.plan !== "string" && typeof body.units !== "number"))
      throw new ApiError(
        400,
        "INVALID_CHECKOUT",
        "provider and a plan or units value are required.",
      );
    return NextResponse.json(
      {
        data: await createCheckout(context, {
          provider,
          plan: typeof body.plan === "string" ? body.plan : undefined,
          units: typeof body.units === "number" ? body.units : undefined,
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
