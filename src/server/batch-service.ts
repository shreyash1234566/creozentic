import { Prisma } from "@prisma/client";
import { db } from "./db";

export async function settleBatchRowForRun(
  workspaceId: string,
  runId: string,
  state: "COMPLETED" | "FAILED",
  error?: Record<string, unknown>,
) {
  const row = await db.batchRow.findFirst({ where: { workspaceId, runId } });
  if (!row) return null;
  await db.batchRow.update({
    where: { id: row.id },
    data: {
      state,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      error: error ? (error as Prisma.InputJsonValue) : undefined,
    },
  });
  const rows = await db.batchRow.findMany({
    where: { batchId: row.batchId, workspaceId },
    select: { state: true },
  });
  const completedRows = rows.filter((item) => item.state === "COMPLETED").length;
  const failedRows = rows.filter((item) => item.state === "FAILED").length;
  const terminal = completedRows + failedRows === rows.length;
  return db.batchRun.update({
    where: { id: row.batchId },
    data: {
      completedRows,
      failedRows,
      state: terminal ? (failedRows ? "PARTIAL_FAILURE" : "COMPLETED") : "RUNNING",
    },
  });
}
