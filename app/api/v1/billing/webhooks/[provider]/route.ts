import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { handleBillingWebhook } from "../../../../../../src/server/billing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    const rawBody = await request.text();
    const signature =
      provider === "stripe"
        ? request.headers.get("stripe-signature")
        : request.headers.get("x-razorpay-signature");
    const result = await handleBillingWebhook(provider.toLowerCase(), rawBody, signature);
    return NextResponse.json({ data: { received: true, duplicate: result.duplicate } });
  } catch (error) {
    return jsonError(error);
  }
}
