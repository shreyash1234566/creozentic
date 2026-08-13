import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { db } from "../../../../src/server/db";
import { jsonError } from "../../../../src/server/api";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const [account, ledger, providerCosts] = await Promise.all([
      db.creditAccount.findUnique({ where: { workspaceId: context.workspaceId } }),
      db.ledgerEntry.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.providerCost.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);
    const creditsConsumed = ledger
      .filter((entry) => entry.kind === "CONSUME")
      .reduce((total, entry) => total + Math.abs(entry.amount), 0);
    const creditsPurchased = ledger
      .filter((entry) => entry.kind === "TOPUP")
      .reduce((total, entry) => total + Math.max(entry.amount, 0), 0);
    const providerCostMinor = providerCosts.reduce((total, cost) => total + cost.costMinor, 0);
    return NextResponse.json({
      data: {
        account,
        ledger,
        providerCosts,
        summary: {
          creditsConsumed,
          creditsPurchased,
          providerCostMinor,
          providerCostCurrency: providerCosts[0]?.currency ?? "USD",
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
