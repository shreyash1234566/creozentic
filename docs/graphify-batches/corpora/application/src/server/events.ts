import { Prisma } from "@prisma/client";

type EventWriter = Pick<Prisma.TransactionClient, "outboxEvent">;

export type CreativeEventInput = {
  workspaceId: string;
  brandId?: string | null;
  runId?: string | null;
  eventType: string;
  correlationId: string;
  causationId?: string | null;
  actor?: { type: string; id?: string | null; channel?: string | null };
  policyContext?: Record<string, unknown>;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export async function appendCreativeEvent(tx: EventWriter, input: CreativeEventInput) {
  const createdAt = new Date().toISOString();
  const envelope = {
    eventType: input.eventType,
    schemaVersion: "1.0",
    eventId: input.idempotencyKey,
    workspaceId: input.workspaceId,
    ...(input.brandId ? { brandId: input.brandId } : {}),
    actor: {
      type: input.actor?.type ?? "system",
      ...(input.actor?.id ? { id: input.actor.id } : {}),
      ...(input.actor?.channel ? { channel: input.actor.channel } : {}),
    },
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    payload: input.payload,
    ...(input.policyContext ? { policyContext: input.policyContext } : {}),
    createdAt,
  };
  return tx.outboxEvent
    .create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId ?? undefined,
        runId: input.runId ?? undefined,
        eventType: input.eventType,
        schemaVersion: 1,
        correlationId: input.correlationId,
        causationId: input.causationId ?? undefined,
        actorType: input.actor?.type,
        actorId: input.actor?.id ?? undefined,
        channel: input.actor?.channel ?? undefined,
        policyContext: input.policyContext as Prisma.InputJsonValue | undefined,
        idempotencyKey: input.idempotencyKey,
        payload: envelope as Prisma.InputJsonValue,
      },
    })
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === "P2002") return null;
      throw error;
    });
}
