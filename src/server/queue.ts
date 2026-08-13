import type { Queue } from "bullmq";

type WorkflowJob = { runId: string; workspaceId: string; correlationId: string; jobId?: string };

let queuePromise: Promise<Queue<WorkflowJob> | null> | null = null;

async function getQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!queuePromise) {
    queuePromise = (async () => {
      const [{ Queue }, RedisModule] = await Promise.all([import("bullmq"), import("ioredis")]);
      const Redis = RedisModule.default;
      const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
      return new Queue<WorkflowJob>("creozentic-workflow-runs", { connection });
    })();
  }
  return queuePromise;
}

export async function enqueueWorkflowRun(job: WorkflowJob) {
  const queue = await getQueue();
  if (!queue) {
    return { accepted: false, driver: "unconfigured", reason: "REDIS_URL is not configured." };
  }

  try {
    await queue.add("workflow.run", job, {
      jobId: job.jobId ?? `workflow-run-${job.runId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2500 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return { accepted: true, driver: "bullmq" };
  } catch (error) {
    return {
      accepted: false,
      driver: "unavailable",
      reason:
        error instanceof Error ? error.message : "The configured queue could not accept this job.",
    };
  }
}
