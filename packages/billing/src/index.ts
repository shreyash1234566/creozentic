export type BillingEvent = {
  workspaceId: string;
  provider: string;
  externalId: string;
  amountCents: number;
  status: string;
};
export const billingBoundary = {
  providers: ["stripe", "lago"] as const,
  idempotent: true,
  ledger: true,
} as const;
