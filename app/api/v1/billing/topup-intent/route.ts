import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../src/server/api";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "BILLING");
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
    const endpoint = process.env[`BILLING_${provider.toUpperCase()}_CHECKOUT_URL`];
    if (!endpoint)
      throw new ApiError(
        503,
        "BILLING_ADAPTER_NOT_CONFIGURED",
        `No ${provider} checkout adapter is configured.`,
      );
    const key = idempotencyKey(request, body.idempotencyKey);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({
        workspaceId: context.workspaceId,
        userId: context.userId,
        units,
        provider,
        idempotencyKey: key,
      }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ApiError(
        502,
        "BILLING_ADAPTER_FAILED",
        `The ${provider} checkout adapter returned HTTP ${response.status}.`,
      );
    return NextResponse.json({ data: { ...responseBody, provider, units } });
  } catch (error) {
    return jsonError(error);
  }
}
