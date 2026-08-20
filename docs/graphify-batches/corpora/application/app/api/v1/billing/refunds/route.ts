import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";
import { listBillingRefunds, requestRefund } from "../../../../../src/server/billing-lifecycle";
export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listBillingRefunds(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      (body.provider !== "stripe" && body.provider !== "razorpay") ||
      typeof body.amountMinor !== "number" ||
      typeof body.reason !== "string"
    )
      throw new ApiError(400, "INVALID_REFUND", "provider, amountMinor, and reason are required.");
    return NextResponse.json(
      {
        data: await requestRefund(context, {
          provider: body.provider,
          invoiceId: typeof body.invoiceId === "string" ? body.invoiceId : undefined,
          amountMinor: body.amountMinor,
          reason: body.reason,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
