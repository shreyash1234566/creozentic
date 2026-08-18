import type { JobStatus, MediaJobContract } from "@creozentic/contracts";

export type QueueName = "media-analysis" | "render" | "publish" | "notifications" | "analytics";
export type QueueJob<T = unknown> = MediaJobContract & {
  queue: QueueName;
  payload: T;
  attempt: number;
  maxAttempts: number;
};

export function queueKey(queue: QueueName, workspaceId: string, idempotencyKey: string) {
  return `${queue}:${workspaceId}:${idempotencyKey}`;
}

export function nextRetry(status: JobStatus, attempt: number, maxAttempts = 3) {
  if (status === "SUCCEEDED" || status === "CANCELLED" || attempt >= maxAttempts) return null;
  return Math.min(300_000, 1_000 * 2 ** attempt);
}

export function classifyDeadLetter(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { code: message.includes("credential") ? "EXTERNAL_CREDENTIAL" : "JOB_FAILURE", message };
}
