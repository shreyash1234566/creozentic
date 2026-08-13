import { ApiError } from "./api";
import { db } from "./db";

type SpendCapClient = Pick<typeof db, "workspace" | "ledgerEntry">;

/**
 * Ledger consumption is recorded as a negative balance movement. A spend cap
 * is a usage limit, so it counts the magnitude of actual consumption and never
 * nets it against a temporary RESERVE entry.
 */
export function consumedCreditsFromLedgerAmount(amount: number | null | undefined) {
  return Math.max(0, -(amount ?? 0));
}

export async function enforceWorkspaceSpendCap(
  workspaceId: string,
  additionalCredits: number,
  client: SpendCapClient = db,
) {
  if (!Number.isFinite(additionalCredits) || additionalCredits < 0)
    throw new ApiError(
      400,
      "INVALID_SPEND_AMOUNT",
      "additionalCredits must be a non-negative number.",
    );
  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { spendingCap: true },
  });
  if (!workspace?.spendingCap) return;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const totals = await client.ledgerEntry.aggregate({
    where: {
      workspaceId,
      createdAt: { gte: monthStart },
      kind: "CONSUME",
    },
    _sum: { amount: true },
  });
  const used = consumedCreditsFromLedgerAmount(totals._sum.amount);
  if (used + additionalCredits > workspace.spendingCap)
    throw new ApiError(
      402,
      "WORKSPACE_SPEND_CAP_REACHED",
      "This run would exceed the workspace monthly spend limit.",
      { capCredits: workspace.spendingCap, usedCredits: used, requestedCredits: additionalCredits },
    );
}
