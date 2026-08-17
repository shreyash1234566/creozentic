import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../src/server/api";
import { integrationRegistry } from "../../../../../src/server/integration-registry";

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { kind } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const registry = integrationRegistry();
    if (kind === "experiment") {
      if (!registry.experiments)
        throw new ApiError(503, "EXPERIMENT_PROVIDER_UNAVAILABLE", "GrowthBook is not configured.");
      return NextResponse.json({
        data: await registry.experiments.evaluate({
          key: String(body.key),
          subject: context.userId,
          attributes: body.attributes as Record<string, unknown> | undefined,
        }),
      });
    }
    if (kind === "notification") {
      if (!registry.notifications)
        throw new ApiError(503, "NOTIFICATION_PROVIDER_UNAVAILABLE", "Novu is not configured.");
      return NextResponse.json({
        data: await registry.notifications.send({
          workflow: String(body.workflow),
          recipient: context.userId,
          payload: (body.payload ?? {}) as Record<string, unknown>,
          idempotencyKey: String(
            body.idempotencyKey ?? `${context.workspaceId}:${body.workflow}:${Date.now()}`,
          ),
        }),
      });
    }
    if (kind === "billing") {
      if (!registry.billing)
        throw new ApiError(503, "BILLING_PROVIDER_UNAVAILABLE", "Lago is not configured.");
      return NextResponse.json({
        data: await registry.billing.createCheckout({
          customerId: context.workspaceId,
          priceId: String(body.priceId),
          successUrl: String(body.successUrl),
          cancelUrl: String(body.cancelUrl),
        }),
      });
    }
    if (kind === "webhook") {
      const payload = JSON.stringify(body.payload ?? {});
      const signature = request.headers.get("x-webhook-signature") ?? "";
      const secret = process.env.WEBHOOK_SIGNING_SECRET ?? "";
      if (!secret || !registry.webhooks.verify(payload, signature, secret))
        throw new ApiError(401, "WEBHOOK_SIGNATURE_INVALID", "The webhook signature is invalid.");
      return NextResponse.json({ data: { accepted: true, workspaceId: context.workspaceId } });
    }
    throw new ApiError(404, "INTEGRATION_NOT_FOUND", `Unknown integration: ${kind}`);
  } catch (error) {
    return jsonError(error);
  }
}
