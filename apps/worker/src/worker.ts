import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
const queues = [
  "media-analysis",
  "editor-render",
  "editor-evaluate",
  "social-publish",
  "analytics-ingest",
  "notifications",
] as const;
type QueueName = (typeof queues)[number];

async function dispatch(queue: QueueName, job: Job) {
  switch (queue) {
    case "media-analysis":
      return { queue, status: "ANALYSIS_DISPATCHED", jobId: job.id };
    case "editor-render":
      return { queue, status: "RENDER_DISPATCHED", jobId: job.id };
    case "editor-evaluate":
      return { queue, status: "EVALUATION_DISPATCHED", jobId: job.id };
    case "social-publish":
      return { queue, status: "PUBLISH_DISPATCHED", jobId: job.id };
    case "analytics-ingest":
      return { queue, status: "ANALYTICS_DISPATCHED", jobId: job.id };
    case "notifications":
      return { queue, status: "NOTIFICATION_DISPATCHED", jobId: job.id };
  }
}

export function createWorkers() {
  return queues.map(
    (queue) =>
      new Worker(queue, (job) => dispatch(queue, job), {
        connection,
        concurrency: Number(
          process.env[`${queue.toUpperCase().replaceAll("-", "_")}_CONCURRENCY`] ?? 2,
        ),
        limiter: { max: 30, duration: 60_000 },
      }),
  );
}

if (process.env.RUN_WORKER === "true") createWorkers();
