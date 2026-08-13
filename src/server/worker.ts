import { loadEnvFile } from "node:process";
import { Prisma, NodeState, RunState } from "@prisma/client";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "./db";
import {
  executeCreativeRequest,
  ProviderExecutionError,
  ProviderNotConfiguredError,
} from "./gateway";
import { evaluateCreativeOutputs } from "./qa";
import { isWorkspaceObjectKey, verifyUploadedObject } from "./storage";
import { completeRunInternal, failRunInternal, markRunRetryableInternal } from "./workflow-service";
import type { ProductLockBrief } from "../domain";
import { recordDeadLetter } from "./dead-letter";
import { createNotifications } from "./notifications";
import { settleBatchRowForRun } from "./batch-service";
import { runAssetGate } from "./asset-intelligence";
import { workflowNodePlan, workflowReviewAndExportKeys } from "./workflow-catalog";
import { executeWorkflowPreparation, workflowPromptForNode } from "./workflow-runtime";

for (const envFile of [".env", ".env.local"]) {
  try {
    loadEnvFile(envFile);
  } catch {
    // Deployments inject environment variables; local workers use the workspace env files.
  }
}

type WorkflowJob = { runId: string; workspaceId: string; correlationId: string };

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required to start the Creozentic workflow worker.");

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker<WorkflowJob>(
  "creozentic-workflow-runs",
  async (job) => {
    const run = await db.workflowRun.findFirst({
      where: { id: job.data.runId, workspaceId: job.data.workspaceId },
      include: { workflowVersion: true },
    });
    const terminalStates: RunState[] = [
      RunState.CANCELLED,
      RunState.TERMINAL_FAILURE,
      RunState.AWAITING_REVIEW,
      RunState.APPROVED,
      RunState.EXPORTED,
      RunState.PUBLISHED,
    ];
    if (!run || terminalStates.includes(run.state)) return;
    const batchRow = await db.batchRow.findFirst({
      where: { workspaceId: job.data.workspaceId, runId: run.id },
      include: { batch: { select: { state: true } } },
    });
    if (batchRow?.batch.state === "PAUSED") return;
    if (batchRow?.batch.state === "CANCELLED") return;
    const graphNodes = workflowNodePlan(run.workflowVersion.graph);
    const generationNode = graphNodes.find(
      (node) => node.type === "image_generation" || node.type === "image_edit",
    );
    if (!generationNode)
      throw new ProviderExecutionError(
        "The workflow has no supported image generation or image edit node.",
        "workflow-runtime",
        false,
      );
    const controlNodes = workflowReviewAndExportKeys(run.workflowVersion.graph);

    await db.workflowRun.update({
      where: { id: run.id },
      data: { state: RunState.RUNNING, error: Prisma.JsonNull },
    });
    try {
      const brief = run.briefSnapshot as {
        product?: string;
        sku?: string;
        qualityMode?: "fast" | "balanced" | "quality";
        count?: number;
        mode?: "lock" | "creative";
        outputFormats?: string[];
        audience?: string;
        language?: string;
        cta?: string;
        scene?: string;
      };
      const productSnapshot =
        run.productSnapshot && typeof run.productSnapshot === "object"
          ? (run.productSnapshot as { sourceAssetIds?: unknown[] })
          : {};
      const inputAssets = Array.isArray(productSnapshot.sourceAssetIds)
        ? productSnapshot.sourceAssetIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const safetyContext = {
        workspaceId: job.data.workspaceId,
        userId: "system-runner",
        role: "OWNER" as const,
        correlationId: job.data.correlationId,
      };
      await Promise.all(inputAssets.map((assetId) => runAssetGate(safetyContext, assetId)));
      const prepared = await executeWorkflowPreparation({
        runId: run.id,
        graph: run.workflowVersion.graph,
        brief,
        brand: run.brandSnapshot,
        product: run.productSnapshot,
        idempotencyKeyPrefix: `${run.id}:prepare`,
      });
      await db.nodeRun.updateMany({
        where: { runId: run.id, nodeKey: generationNode.id },
        data: { state: NodeState.RUNNING, startedAt: new Date(), attempts: { increment: 1 } },
      });
      const result = await executeCreativeRequest({
        capability: generationNode.type === "image_edit" ? "image.edit" : "image.generate",
        inputAssets,
        prompt: workflowPromptForNode(generationNode, prepared.state, [
          brief.product,
          brief.sku,
          brief.scene,
          brief.audience,
          brief.cta,
        ]),
        constraints: {
          qualityMode: brief.qualityMode ?? "balanced",
          productLock: brief.mode === "lock",
          outputCount: brief.count,
          locale: brief.language,
          aspectRatio:
            typeof generationNode.config.aspectRatio === "string"
              ? generationNode.config.aspectRatio
              : undefined,
        },
        workspaceId: job.data.workspaceId,
        idempotencyKey: `${run.id}:${generationNode.id}`,
      });
      if (result.outputs.length === 0)
        throw new ProviderExecutionError(
          "Provider returned no output assets.",
          result.provider,
          false,
        );
      await db.nodeRun.updateMany({
        where: {
          runId: run.id,
          nodeKey: { notIn: [...controlNodes.review, ...controlNodes.export] },
        },
        data: {
          state: NodeState.SUCCEEDED,
          completedAt: new Date(),
          errorClass: null,
          errorMessage: null,
        },
      });
      await db.nodeRun.updateMany({
        where: { runId: run.id, nodeKey: { in: controlNodes.review } },
        data: { state: NodeState.AWAITING_REVIEW, completedAt: null },
      });

      const persistedOutputs = await db.$transaction(async (tx) => {
        const providerCallId =
          result.providerRequestId ?? `${run.id}:${result.provider}:image.generate`;
        await tx.providerCost.upsert({
          where: {
            workspaceId_providerCallId: {
              workspaceId: job.data.workspaceId,
              providerCallId,
            },
          },
          create: {
            workspaceId: job.data.workspaceId,
            runId: run.id,
            provider: result.provider,
            model: result.model,
            modelVersion: result.modelVersion,
            providerCallId,
            rawUsage: result.usage,
            costMinor: result.usage.providerCostMinor,
            currency: result.usage.currency,
            retry: job.attemptsMade > 0,
          },
          update: {
            runId: run.id,
            rawUsage: result.usage,
            costMinor: result.usage.providerCostMinor,
            currency: result.usage.currency,
            retry: job.attemptsMade > 0,
          },
        });
        return Promise.all(
          result.outputs.map(async (output, index) => {
            if (!output.assetId || !output.mimeType || !output.objectKey || !output.contentHash)
              throw new ProviderExecutionError(
                "Provider output is missing an asset ID, MIME type, storage object key, or content hash.",
                result.provider,
                false,
              );
            if (!isWorkspaceObjectKey(job.data.workspaceId, output.objectKey))
              throw new ProviderExecutionError(
                "Provider output object key is outside the workspace namespace.",
                result.provider,
                false,
              );
            const stored = await verifyUploadedObject({ objectKey: output.objectKey });
            const existing = await tx.asset.findUnique({
              where: { id: output.assetId },
              select: { id: true, workspaceId: true },
            });
            if (existing && existing.workspaceId !== job.data.workspaceId)
              throw new ProviderExecutionError(
                "Provider output asset ID belongs to another workspace.",
                result.provider,
                false,
              );
            const asset = existing
              ? await tx.asset.update({
                  where: { id: existing.id },
                  data: {
                    status: "READY",
                    name: output.name ?? `generated-${index + 1}`,
                    objectKey: output.objectKey,
                    contentHash: output.contentHash,
                    mimeType: output.mimeType,
                    byteSize: stored.byteSize,
                    width: output.width,
                    height: output.height,
                    metadata: output.metadata
                      ? (output.metadata as Prisma.InputJsonValue)
                      : undefined,
                  },
                })
              : await tx.asset.create({
                  data: {
                    id: output.assetId,
                    workspaceId: job.data.workspaceId,
                    type: "GENERATED",
                    status: "READY",
                    name: output.name ?? `generated-${index + 1}`,
                    objectKey: output.objectKey,
                    contentHash: output.contentHash,
                    mimeType: output.mimeType,
                    byteSize: stored.byteSize,
                    width: output.width,
                    height: output.height,
                    metadata: output.metadata
                      ? (output.metadata as Prisma.InputJsonValue)
                      : undefined,
                  },
                });
            return { asset, output };
          }),
        );
      });

      const outputs = persistedOutputs.map(({ asset, output }, index) => ({
        id: `${run.id}-output-${index}`,
        assetId: asset.id,
        name: output.name ?? asset.name,
        format: output.format ?? brief.outputFormats?.[index] ?? "1:1",
        width: output.width,
        height: output.height,
        metadata: {
          ...(output.metadata ?? {}),
          provider: result.provider,
          model: result.model,
          modelVersion: result.modelVersion,
          contentHash: asset.contentHash,
          objectKey: asset.objectKey,
        },
      }));
      const outputGates = await Promise.all(
        persistedOutputs.map(({ asset }) => runAssetGate(safetyContext, asset.id)),
      );
      const checkedOutputs = result.outputs.map((output, index) => ({
        ...output,
        metadata: {
          ...(output.metadata ?? {}),
          outputSafety: outputGates[index],
          ocrChecked: outputGates[index]?.ocr?.status === "PASSED",
          maskingChecked: outputGates[index]?.masking?.status === "PASSED",
          integrityChecked: outputGates[index]?.integrity?.status === "PASSED",
        },
      }));
      const verdicts = evaluateCreativeOutputs(brief as ProductLockBrief, checkedOutputs);
      await db.nodeRun.updateMany({
        where: {
          runId: run.id,
          nodeKey: { notIn: [...controlNodes.review, ...controlNodes.export] },
        },
        data: { state: NodeState.SUCCEEDED, completedAt: new Date(), outputRefs: { verdicts } },
      });
      await completeRunInternal(
        {
          workspaceId: job.data.workspaceId,
          userId: "system-runner",
          role: "OWNER",
          correlationId: job.data.correlationId,
        },
        run.id,
        { outputs, verdicts, actualUnits: result.usage.outputUnits ?? result.outputs.length },
      );
      await settleBatchRowForRun(job.data.workspaceId, run.id, "COMPLETED");
      await createNotifications({
        workspaceId: job.data.workspaceId,
        type: "WORKFLOW_COMPLETED",
        title: "Creative run ready for review",
        body: `${run.title} completed and is ready for the next approval step.`,
        payload: { runId: run.id },
        channels: ["IN_APP"],
        idempotencyKey: `workflow-completed:${run.id}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The workflow worker failed.";
      const providerNotConfigured = error instanceof ProviderNotConfiguredError;
      const providerError = error instanceof ProviderExecutionError;
      const retryable = providerError ? error.retryable : !providerNotConfigured;
      const attempts = Number(job.opts.attempts ?? 1);
      if (retryable && job.attemptsMade + 1 < attempts) {
        await markRunRetryableInternal({
          workspaceId: job.data.workspaceId,
          runId: run.id,
          correlationId: job.data.correlationId,
          attempt: job.attemptsMade + 1,
          error: {
            code: providerError ? "PROVIDER_RETRYABLE_FAILURE" : "WORKFLOW_RETRYABLE_FAILURE",
            message,
          },
        });
        throw error;
      }
      await failRunInternal({
        workspaceId: job.data.workspaceId,
        runId: run.id,
        correlationId: job.data.correlationId,
        error: {
          code: providerNotConfigured
            ? "PROVIDER_NOT_CONFIGURED"
            : providerError
              ? "PROVIDER_EXECUTION_FAILED"
              : "WORKFLOW_EXECUTION_FAILED",
          message,
        },
      });
      await settleBatchRowForRun(job.data.workspaceId, run.id, "FAILED", {
        code: providerNotConfigured
          ? "PROVIDER_NOT_CONFIGURED"
          : providerError
            ? "PROVIDER_EXECUTION_FAILED"
            : "WORKFLOW_EXECUTION_FAILED",
        message,
      });
      await recordDeadLetter({
        workspaceId: job.data.workspaceId,
        kind: "workflow.run",
        runId: run.id,
        payload: { runId: run.id, correlationId: job.data.correlationId },
        error: { message, retryable, attempts: job.attemptsMade + 1 },
        attempts: job.attemptsMade + 1,
        idempotencyKey: `workflow-run-terminal:${run.id}`,
      });
      await createNotifications({
        workspaceId: job.data.workspaceId,
        type: "WORKFLOW_FAILED",
        title: "Creative run needs attention",
        body: `${run.title} could not complete. You can review the failure and retry safely.`,
        payload: { runId: run.id, message },
        channels: ["IN_APP", "EMAIL"],
        idempotencyKey: `workflow-failed:${run.id}`,
      });
    }
  },
  { connection, concurrency: 4 },
);

worker.on("completed", (job) =>
  console.log(JSON.stringify({ event: "workflow.job.completed", jobId: job.id })),
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({ event: "workflow.job.failed", jobId: job?.id, error: error.message }),
  ),
);

async function shutdown() {
  await worker.close();
  await connection.quit();
  await db.$disconnect();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
