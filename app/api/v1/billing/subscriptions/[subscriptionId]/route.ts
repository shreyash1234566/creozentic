import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { updateSubscription } from "../../../../../../src/server/billing-lifecycle";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.cancelAtPeriodEnd !== "boolean")
      throw new ApiError(400, "INVALID_SUBSCRIPTION_UPDATE", "cancelAtPeriodEnd must be boolean.");
    return NextResponse.json({
      data: await updateSubscription(
        await getRequestContext(request),
        (await params).subscriptionId,
        body.cancelAtPeriodEnd,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
