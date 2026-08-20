import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function recordDeadLetter(input: {
  workspaceId: string;
  kind: string;
  runId?: string;
  batchId?: string;
  payload: Record<string, unknown>;
  error: Record<string, unknown>;
  attempts: number;
  idempotencyKey: string;
}) {
  return db.deadLetterJob.upsert({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    update: {
      error: json(input.error),
      attempts: input.attempts,
      status: "OPEN",
      resolvedAt: null,
    },
    create: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      runId: input.runId,
      batchId: input.batchId,
      payload: json(input.payload),
      error: json(input.error),
      attempts: input.attempts,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function listDeadLetters(context: RequestContext, status?: string) {
  requireRole(context, "EDITOR");
  return db.deadLetterJob.findMany({
    where: { workspaceId: context.workspaceId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function resolveDeadLetter(
  context: RequestContext,
  deadLetterId: string,
  status: "DISMISSED" | "REPLAYED",
) {
  requireRole(context, "EDITOR");
  const job = await db.deadLetterJob.findFirst({
    where: { id: deadLetterId, workspaceId: context.workspaceId, status: "OPEN" },
  });
  if (!job) throw new ApiError(404, "DEAD_LETTER_NOT_FOUND", "The failed job was not found.");
  return db.deadLetterJob.update({
    where: { id: job.id },
    data: { status, resolvedAt: new Date() },
  });
}
