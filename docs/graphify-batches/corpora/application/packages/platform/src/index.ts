import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingEvent = {
  id: string;
  type: string;
  workspaceId: string;
  amount?: number;
  credits?: number;
  payload: unknown;
};
export interface BillingAdapter {
  createCheckout(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  reconcile(event: BillingEvent): Promise<void>;
}
export class LagoBillingAdapter implements BillingAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  async createCheckout(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const response = await fetch(`${this.baseUrl}/api/v1/checkout`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Lago checkout failed: ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    return { url: String(body.url ?? body.checkout_url ?? "") };
  }
  async reconcile(_event: BillingEvent) {
    return;
  }
}

export interface ExperimentAdapter {
  evaluate(input: {
    key: string;
    subject: string;
    attributes?: Record<string, unknown>;
  }): Promise<{ value: string | boolean | number; variation?: string; reason: string }>;
}
export class GrowthBookAdapter implements ExperimentAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  async evaluate(input: { key: string; subject: string; attributes?: Record<string, unknown> }) {
    const response = await fetch(`${this.baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`GrowthBook evaluation failed: ${response.status}`);
    return (await response.json()) as {
      value: string | boolean | number;
      variation?: string;
      reason: string;
    };
  }
}

export interface NotificationAdapter {
  send(input: {
    workflow: string;
    recipient: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ deliveryId: string }>;
}
export class NovuNotificationAdapter implements NotificationAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  async send(input: {
    workflow: string;
    recipient: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }) {
    const response = await fetch(`${this.baseUrl}/v1/events/trigger`, {
      method: "POST",
      headers: {
        authorization: `ApiKey ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({ name: input.workflow, to: input.recipient, payload: input.payload }),
    });
    if (!response.ok) throw new Error(`Novu notification failed: ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    return { deliveryId: String(body.data ?? body.id ?? input.idempotencyKey) };
  }
}

export interface WebhookAdapter {
  sign(payload: string, secret: string): string;
  verify(payload: string, signature: string, secret: string): boolean;
}
export class SvixCompatibleWebhookAdapter implements WebhookAdapter {
  sign(payload: string, secret: string) {
    return createHmac("sha256", secret).update(payload).digest("base64");
  }
  verify(payload: string, signature: string, secret: string) {
    const expected = Buffer.from(this.sign(payload, secret));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
