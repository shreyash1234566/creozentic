import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const [subscriptions, invoices, events] = await Promise.all([
      db.subscription.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
      }),
      db.invoice.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
      }),
      db.billingEvent.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          provider: true,
          eventId: true,
          type: true,
          status: true,
          processedAt: true,
          createdAt: true,
        },
      }),
    ]);
    return NextResponse.json({ data: { subscriptions, invoices, events } });
  } catch (error) {
    return jsonError(error);
  }
}
