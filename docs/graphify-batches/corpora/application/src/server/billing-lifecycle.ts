import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";
import { requiresProductionAuthentication } from "./runtime-config";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}
function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerUrl(provider: string, action: string) {
  return process.env[`BILLING_${provider.toUpperCase()}_${action.toUpperCase()}_URL`];
}

export async function createCheckout(
  context: RequestContext,
  input: {
    provider: "stripe" | "razorpay";
    units?: number;
    plan?: string;
    amountMinor?: number;
    currency?: string;
    idempotencyKey: string;
  },
) {
  requireRole(context, "BILLING");
  const units = Math.min(Math.max(Math.floor(input.units ?? 0), 0), 100_000);
  if (!units && !input.plan)
    throw new ApiError(400, "CHECKOUT_ITEM_REQUIRED", "units or plan is required.");
  const endpoint = providerUrl(input.provider, "checkout");
  if (!endpoint) {
    if (requiresProductionAuthentication())
      throw new ApiError(
        503,
        "BILLING_CHECKOUT_NOT_CONFIGURED",
        `Configure BILLING_${input.provider.toUpperCase()}_CHECKOUT_URL before starting live checkout.`,
      );
    return {
      status: "PENDING_PROVIDER_SETUP",
      provider: input.provider,
      units,
      plan: input.plan ?? null,
      message: `Configure BILLING_${input.provider.toUpperCase()}_CHECKOUT_URL to create a live checkout.`,
    };
  }
  let body: Record<string, unknown>;
  try {
    const response = await requestProvider<unknown>({
      provider: `billing:${input.provider}:checkout`,
      endpoint,
      idempotencyKey: input.idempotencyKey,
      body: { workspaceId: context.workspaceId, userId: context.userId, ...input, units },
    });
    body = record(response.body);
  } catch (error) {
    throw providerApiError(
      error,
      "BILLING_CHECKOUT_FAILED",
      "The billing checkout adapter failed.",
    );
  }
  return { ...body, provider: input.provider, units };
}

export async function requestRefund(
  context: RequestContext,
  input: {
    invoiceId?: string;
    provider: "stripe" | "razorpay";
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  requireRole(context, "BILLING");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
    throw new ApiError(400, "INVALID_REFUND", "A positive integer refund amount is required.");
  const invoice = input.invoiceId
    ? await db.invoice.findFirst({
        where: { id: input.invoiceId, workspaceId: context.workspaceId },
      })
    : null;
  if (input.invoiceId && !invoice)
    throw new ApiError(404, "INVOICE_NOT_FOUND", "The invoice was not found in this workspace.");
  if (requiresProductionAuthentication() && !invoice)
    throw new ApiError(
      400,
      "INVOICE_REQUIRED",
      "A live refund must be tied to a verified workspace invoice.",
    );
  if (invoice) {
    if (!/paid|succeeded|complete/i.test(invoice.status))
      throw new ApiError(409, "INVOICE_NOT_REFUNDABLE", "Only paid invoices may be refunded.");
    const totals = await db.billingRefund.aggregate({
      where: {
        workspaceId: context.workspaceId,
        invoiceId: invoice.id,
        status: { in: ["SUBMITTED", "SUCCEEDED", "PENDING", "PROCESSING"] },
      },
      _sum: { amountMinor: true },
    });
    const alreadyRefunded = totals._sum.amountMinor ?? 0;
    if (input.amountMinor + alreadyRefunded > invoice.amountMinor)
      throw new ApiError(
        409,
        "REFUND_EXCEEDS_INVOICE",
        "The requested refund would exceed the remaining paid invoice amount.",
        {
          invoiceAmountMinor: invoice.amountMinor,
          alreadyRefunded,
          requestedAmountMinor: input.amountMinor,
        },
      );
  }
  const existing = await db.billingRefund.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return { refund: existing, deduplicated: true };
  const endpoint = providerUrl(input.provider, "refund");
  const refund = await db.billingRefund.create({
    data: {
      workspaceId: context.workspaceId,
      invoiceId: invoice?.id,
      provider: input.provider,
      amountMinor: input.amountMinor,
      currency: invoice?.currency ?? "INR",
      reason: input.reason.trim(),
      status: endpoint ? "SUBMITTED" : "AWAITING_PROVIDER",
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (!endpoint)
    return {
      refund,
      deduplicated: false,
      message: `Configure BILLING_${input.provider.toUpperCase()}_REFUND_URL to submit a live refund.`,
    };
  let response: { status: number; body: unknown };
  try {
    const providerResponse = await requestProvider<unknown>({
      provider: `billing:${input.provider}:refund`,
      endpoint,
      idempotencyKey: input.idempotencyKey,
      body: { workspaceId: context.workspaceId, invoiceExternalId: invoice?.externalId, ...input },
    });
    response = { status: providerResponse.status, body: providerResponse.body };
  } catch (error) {
    const body = error instanceof Error ? { message: error.message } : {};
    const updated = await db.billingRefund.update({
      where: { id: refund.id },
      data: { status: "FAILED", error: json(body) },
    });
    throw new ApiError(502, "BILLING_REFUND_FAILED", "The billing refund adapter failed.", {
      refundId: updated.id,
    });
  }
  const body = record(response.body);
  const updated = await db.billingRefund.update({
    where: { id: refund.id },
    data: {
      status: String(body.status ?? "SUBMITTED"),
      externalId: typeof body.id === "string" ? body.id : undefined,
      metadata: json(body),
      error: undefined,
    },
  });
  return { refund: updated, deduplicated: false };
}

export async function listBillingRefunds(context: RequestContext) {
  requireRole(context, "BILLING");
  return db.billingRefund.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function updateSubscription(
  context: RequestContext,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
) {
  requireRole(context, "BILLING");
  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId, workspaceId: context.workspaceId },
  });
  if (!subscription)
    throw new ApiError(
      404,
      "SUBSCRIPTION_NOT_FOUND",
      "The subscription was not found in this workspace.",
    );
  const endpoint = providerUrl(subscription.provider, "subscription");
  if (endpoint) {
    try {
      await requestProvider({
        provider: `billing:${subscription.provider}:subscription`,
        endpoint,
        method: "PATCH",
        body: {
          workspaceId: context.workspaceId,
          externalId: subscription.externalId,
          cancelAtPeriodEnd,
        },
        idempotencyKey: `subscription:${subscription.id}:${cancelAtPeriodEnd}`,
      });
    } catch (error) {
      throw providerApiError(
        error,
        "SUBSCRIPTION_UPDATE_FAILED",
        "The subscription adapter failed.",
      );
    }
  } else if (requiresProductionAuthentication()) {
    throw new ApiError(
      503,
      "SUBSCRIPTION_ADAPTER_NOT_CONFIGURED",
      `Configure BILLING_${subscription.provider.toUpperCase()}_SUBSCRIPTION_URL before changing a live subscription.`,
    );
  }
  return db.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd } });
}
