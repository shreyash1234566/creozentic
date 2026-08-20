import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { getCoreEngineStatus, type CoreEngineId } from "@creozentic/video";

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

const queueEngines: Partial<Record<QueueName, CoreEngineId[]>> = {
  "media-analysis": ["openshorts", "pixeltable", "videoagent"],
  "editor-render": ["ave", "remotion"],
  "editor-evaluate": ["ave", "videoagent"],
  "social-publish": ["openshorts"],
};

async function dispatch(queue: QueueName, job: Job) {
  const engines = queueEngines[queue] ?? [];
  const available = (await getCoreEngineStatus()).filter(
    (engine) => engines.includes(engine.id) && engine.sourcePresent,
  );
  switch (queue) {
    case "media-analysis":
      return {
        queue,
        status: "ANALYSIS_DISPATCHED",
        jobId: job.id,
        engines: available.map((engine) => engine.id),
      };
    case "editor-render":
      return {
        queue,
        status: "RENDER_DISPATCHED",
        jobId: job.id,
        engines: available.map((engine) => engine.id),
      };
    case "editor-evaluate":
      return {
        queue,
        status: "EVALUATION_DISPATCHED",
        jobId: job.id,
        engines: available.map((engine) => engine.id),
      };
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
