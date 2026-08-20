import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";

type NormalizedBillingEvent = {
  provider: string;
  eventId: string;
  type: string;
  workspaceId?: string;
  units?: number;
  amountMinor?: number;
  currency?: string;
  externalId?: string;
  plan?: string;
  status?: string;
  payload: Prisma.InputJsonValue;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyStripeSignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(",").map((item) => item.split("=", 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1)
    throw new ApiError(
      401,
      "INVALID_WEBHOOK_SIGNATURE",
      "The Stripe webhook signature is invalid or expired.",
    );
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  if (!safeEqual(expected, parts.v1))
    throw new ApiError(
      401,
      "INVALID_WEBHOOK_SIGNATURE",
      "The Stripe webhook signature is invalid.",
    );
}

export function verifyRazorpaySignature(rawBody: string, header: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqual(expected, header))
    throw new ApiError(
      401,
      "INVALID_WEBHOOK_SIGNATURE",
      "The Razorpay webhook signature is invalid.",
    );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeBillingEvent(provider: string, input: unknown): NormalizedBillingEvent {
  const body = asRecord(input);
  const data = asRecord(body.data);
  const object = asRecord(data.object ?? body.payload);
  const metadata = asRecord(object.metadata ?? object.notes ?? body.metadata);
  const eventId =
    typeof body.id === "string" ? body.id : typeof body.eventId === "string" ? body.eventId : "";
  const type =
    typeof body.type === "string"
      ? body.type
      : typeof body.event === "string"
        ? body.event
        : "unknown";
  const workspaceId = typeof metadata.workspaceId === "string" ? metadata.workspaceId : undefined;
  const units = asNumber(metadata.credits ?? metadata.units);
  const amountMinor = asNumber(object.amount_total ?? object.amount_paid ?? object.amount);
  const externalId = typeof object.id === "string" ? object.id : undefined;
  const plan = typeof metadata.plan === "string" ? metadata.plan : undefined;
  if (!eventId)
    throw new ApiError(400, "INVALID_BILLING_EVENT", "A provider event ID is required.");
  return {
    provider,
    eventId,
    type,
    workspaceId,
    units,
    amountMinor,
    currency: typeof object.currency === "string" ? object.currency.toUpperCase() : undefined,
    externalId,
    plan,
    status: typeof object.status === "string" ? object.status : undefined,
    payload: input as Prisma.InputJsonValue,
  };
}

export async function processBillingEvent(event: NormalizedBillingEvent) {
  return db.$transaction(async (tx) => {
    const existing = await tx.billingEvent.findUnique({
      where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
    });
    if (existing) return { duplicate: true, event: existing };
    let stored;
    try {
      stored = await tx.billingEvent.create({
        data: {
          provider: event.provider,
          eventId: event.eventId,
          workspaceId: event.workspaceId,
          type: event.type,
          payload: event.payload,
          status: "received",
        },
      });
    } catch (error) {
      if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
        const concurrent = await tx.billingEvent.findUnique({
          where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
        });
        if (concurrent) return { duplicate: true, event: concurrent };
      }
      throw error;
    }
    const isCreditEvent = /payment|checkout|topup|paid/i.test(event.type) && (event.units ?? 0) > 0;
    if (event.workspaceId && isCreditEvent) {
      const account = await tx.creditAccount.findUnique({
        where: { workspaceId: event.workspaceId },
      });
      if (!account)
        throw new ApiError(
          409,
          "CREDIT_ACCOUNT_NOT_READY",
          "The workspace credit account is not configured.",
        );
      await tx.creditAccount.update({
        where: { workspaceId: event.workspaceId },
        data: { balance: { increment: Math.floor(event.units!) } },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: event.workspaceId,
          kind: "TOPUP",
          amount: Math.floor(event.units!),
          reason: `${event.provider} ${event.type}`,
          paymentRef: event.externalId ?? event.eventId,
          idempotencyKey: `${event.provider}:${event.eventId}:credits`,
          metadata: { amountMinor: event.amountMinor ?? null, currency: event.currency ?? "INR" },
        },
      });
    }
    if (event.workspaceId && event.externalId && /subscription/i.test(event.type)) {
      await tx.subscription.upsert({
        where: { provider_externalId: { provider: event.provider, externalId: event.externalId } },
        update: {
          workspaceId: event.workspaceId,
          plan: event.plan ?? "unknown",
          status: event.status ?? "active",
          metadata: event.payload,
        },
        create: {
          workspaceId: event.workspaceId,
          provider: event.provider,
          externalId: event.externalId,
          plan: event.plan ?? "unknown",
          status: event.status ?? "active",
          metadata: event.payload,
        },
      });
    }
    if (event.workspaceId && event.externalId && /invoice/i.test(event.type)) {
      await tx.invoice.upsert({
        where: { provider_externalId: { provider: event.provider, externalId: event.externalId } },
        update: {
          workspaceId: event.workspaceId,
          status: event.status ?? "paid",
          amountMinor: event.amountMinor ?? 0,
          currency: event.currency ?? "INR",
          paidAt: /paid/i.test(event.type) ? new Date() : undefined,
          metadata: event.payload,
        },
        create: {
          workspaceId: event.workspaceId,
          provider: event.provider,
          externalId: event.externalId,
          status: event.status ?? "paid",
          amountMinor: event.amountMinor ?? 0,
          currency: event.currency ?? "INR",
          paidAt: /paid/i.test(event.type) ? new Date() : undefined,
          metadata: event.payload,
        },
      });
    }
    return {
      duplicate: false,
      event: await tx.billingEvent.update({
        where: { id: stored.id },
        data: { status: "processed", processedAt: new Date() },
      }),
    };
  });
}

export async function handleBillingWebhook(
  provider: string,
  rawBody: string,
  signature: string | null,
) {
  const secret =
    provider === "stripe"
      ? process.env.STRIPE_WEBHOOK_SECRET
      : provider === "razorpay"
        ? process.env.RAZORPAY_WEBHOOK_SECRET
        : undefined;
  if (!secret)
    throw new ApiError(
      503,
      "BILLING_WEBHOOK_NOT_CONFIGURED",
      `No webhook secret is configured for ${provider}.`,
    );
  if (!signature)
    throw new ApiError(
      401,
      "INVALID_WEBHOOK_SIGNATURE",
      "The billing webhook signature is required.",
    );
  if (provider === "stripe") verifyStripeSignature(rawBody, signature, secret);
  else if (provider === "razorpay") verifyRazorpaySignature(rawBody, signature, secret);
  else
    throw new ApiError(
      400,
      "UNSUPPORTED_BILLING_PROVIDER",
      "The billing provider is not supported.",
    );
  return processBillingEvent(normalizeBillingEvent(provider, JSON.parse(rawBody)));
}
