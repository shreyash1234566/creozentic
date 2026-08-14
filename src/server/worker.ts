import { loadEnvFile } from "node:process";
import { Prisma, NodeState, RunState } from "@prisma/client";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "./db";
import {
  executeCreativeRequest,
  type CreativeResult,
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
import { topologicalWorkflowNodePlan, workflowReviewAndExportKeys } from "./workflow-catalog";
import {
  executeWorkflowPreparation,
  shouldRunWorkflowNode,
  workflowPromptForNode,
} from "./workflow-runtime";
import { assertProductionConfiguration } from "./runtime-config";
import { createMediaJob } from "./media-jobs";

for (const envFile of [".env", ".env.local"]) {
  try {
    loadEnvFile(envFile);
  } catch {
    // Deployments inject environment variables; local workers use the workspace env files.
  }
}

type WorkflowJob = { runId: string; workspaceId: string; correlationId: string };

function evidenceFromScan(
  scan: { status: string; scanner: string; version: string | null } | null,
) {
  return scan
    ? { status: scan.status, scanner: scan.scanner, version: scan.version ?? "unknown" }
    : { status: "NOT_REQUIRED", scanner: "none", version: "1" };
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function executeComposerNodes(input: {
  runId: string;
  workspaceId: string;
  correlationId: string;
  composerNodes: Array<{ id: string; config: Record<string, unknown> }>;
  sourceAssetIds: string[];
  formats: string[];
  brief: Record<string, unknown>;
  brand: Record<string, unknown>;
}) {
  const results: Array<{
    outputAssetId: string;
    format: string;
    nodeKey: string;
  }> = [];
  const context = {
    workspaceId: input.workspaceId,
    userId: "system-runner",
    role: "OWNER" as const,
    correlationId: input.correlationId,
  };
  for (const node of input.composerNodes) {
    await db.nodeRun.updateMany({
      where: { runId: input.runId, nodeKey: node.id },
      data: { state: NodeState.RUNNING, startedAt: new Date(), attempts: { increment: 1 } },
    });
    try {
      for (const format of input.formats) {
        const config = node.config;
        const profile = record(input.brand.profile);
        const colors = Array.isArray(profile.colors)
          ? profile.colors.filter((value): value is string => typeof value === "string")
          : [];
        const job = await createMediaJob(context, {
          kind: "composition.render",
          sourceAssetIds: input.sourceAssetIds,
          runId: input.runId,
          config: {
            templateId: text(config.templateId) || "daily-locked-poster",
            ratio: text(config.ratio) || format,
            accent: colors[0] ?? "#d1560f",
            overlay: typeof config.overlay === "number" ? config.overlay : 20,
            layers: Array.isArray(config.layers)
              ? config.layers
              : [
                  { id: "logo", kind: "logo", text: text(input.brand.name) || "Brand", x: 8, y: 8 },
                  {
                    id: "headline",
                    kind: "headline",
                    text: text(input.brief.headline) || text(input.brief.product),
                    x: 8,
                    y: 22,
                  },
                  {
                    id: "body",
                    kind: "body",
                    text: text(input.brief.body) || text(input.brief.scene),
                    x: 8,
                    y: 42,
                  },
                  {
                    id: "cta",
                    kind: "cta",
                    text: text(input.brief.cta) || "Learn more",
                    x: 8,
                    y: 78,
                  },
                ],
          },
          idempotencyKey: `${input.runId}:composer:${node.id}:${format}`,
        });
        for (const outputAssetId of Array.isArray(job.job.outputAssetIds)
          ? job.job.outputAssetIds.filter((value): value is string => typeof value === "string")
          : []) {
          results.push({ outputAssetId, format, nodeKey: node.id });
        }
      }
      await db.nodeRun.updateMany({
        where: { runId: input.runId, nodeKey: node.id },
        data: {
          state: NodeState.SUCCEEDED,
          outputRefs: { outputAssetIds: results.filter((item) => item.nodeKey === node.id) },
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await db.nodeRun.updateMany({
        where: { runId: input.runId, nodeKey: node.id },
        data: {
          state: NodeState.FAILED,
          errorClass: "COMPOSER_FAILED",
          errorMessage: error instanceof Error ? error.message : "Composer failed.",
        },
      });
      throw error;
    }
  }
  return results;
}

const redisUrl = process.env.REDIS_URL;
assertProductionConfiguration("workflow worker");
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
    // The persisted graph is the source of truth for execution order. A raw
    // node-array order is only an authoring detail and must never decide which
    // provider call runs first.
    const graphNodes = topologicalWorkflowNodePlan(run.workflowVersion.graph);
    const creativeNodes = graphNodes.filter(
      (node) =>
        node.type === "image_generation" ||
        node.type === "image_edit" ||
        node.type === "model_comparison",
    );
    const composerNodes = graphNodes.filter((node) => node.type === "composer");
    if (!creativeNodes.length)
      throw new ProviderExecutionError(
        "The workflow has no supported image generation, edit, or model comparison node.",
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
        headline?: string;
        body?: string;
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
      const runnableCreativeNodes = creativeNodes.filter((node) =>
        shouldRunWorkflowNode(run.workflowVersion.graph, node.id, prepared.state),
      );
      const skippedCreativeNodes = creativeNodes.filter(
        (node) => !runnableCreativeNodes.some((runnable) => runnable.id === node.id),
      );
      if (skippedCreativeNodes.length)
        await db.nodeRun.updateMany({
          where: { runId: run.id, nodeKey: { in: skippedCreativeNodes.map((node) => node.id) } },
          data: {
            state: NodeState.SUCCEEDED,
            completedAt: new Date(),
            outputRefs: { skipped: true, reason: "conditional branch not selected" },
          },
        });
      if (!runnableCreativeNodes.length)
        throw new ProviderExecutionError(
          "The selected workflow branches produced no executable generation node.",
          "workflow-runtime",
          false,
        );
      const requestedFormats = [...new Set(brief.outputFormats?.filter(Boolean) ?? [])];
      if (!requestedFormats.length) requestedFormats.push("1:1");
      const generationResults: Array<{
        nodeKey: string;
        format: string;
        modelRef?: string;
        result: CreativeResult;
      }> = [];
      // Each format is a distinct provider request with a stable idempotency key.
      // This eliminates the previous one-ratio shortcut and makes costs traceable.
      for (const generationNode of runnableCreativeNodes) {
        await db.nodeRun.updateMany({
          where: { runId: run.id, nodeKey: generationNode.id },
          data: {
            state: NodeState.RUNNING,
            startedAt: new Date(),
            attempts: { increment: 1 },
            errorClass: null,
            errorMessage: null,
          },
        });
        const configuredModelRefs = Array.isArray(generationNode.config.modelRefs)
          ? generationNode.config.modelRefs.filter(
              (ref): ref is string => typeof ref === "string" && Boolean(ref.trim()),
            )
          : [];
        const modelRefs =
          generationNode.type === "model_comparison"
            ? configuredModelRefs.length
              ? configuredModelRefs.slice(0, 3)
              : ["comparison-a", "comparison-b"]
            : [
                typeof generationNode.config.modelRef === "string"
                  ? generationNode.config.modelRef
                  : undefined,
              ];
        for (const modelRef of modelRefs) {
          for (const format of requestedFormats) {
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
                    : format,
              },
              workspaceId: job.data.workspaceId,
              idempotencyKey: `${run.id}:${generationNode.id}:${modelRef ?? "default"}:${format}`,
              modelRef,
              brandContext: record(run.brandSnapshot),
            });
            generationResults.push({ nodeKey: generationNode.id, format, modelRef, result });
          }
        }
        await db.nodeRun.updateMany({
          where: { runId: run.id, nodeKey: generationNode.id },
          data: {
            state: NodeState.SUCCEEDED,
            completedAt: new Date(),
            outputRefs: {
              formats: requestedFormats,
              modelRefs: modelRefs.filter((value): value is string => typeof value === "string"),
              outputCount: generationResults
                .filter((entry) => entry.nodeKey === generationNode.id)
                .reduce((total, entry) => total + entry.result.outputs.length, 0),
            },
          },
        });
        (prepared.state.nodes as Record<string, unknown>)[generationNode.id] = {
          formats: requestedFormats,
          modelRefs: modelRefs.filter((value): value is string => typeof value === "string"),
          outputCount: generationResults
            .filter((entry) => entry.nodeKey === generationNode.id)
            .reduce((total, entry) => total + entry.result.outputs.length, 0),
        };
      }
      const generatedProviderOutputs = generationResults.flatMap((entry) =>
        entry.result.outputs.map((output) => ({ ...entry, output })),
      );
      if (generatedProviderOutputs.length === 0)
        throw new ProviderExecutionError(
          "Provider returned no output assets.",
          generationResults[0]?.result.provider ?? "workflow-runtime",
          false,
        );
      const runnableComposerNodes = composerNodes.filter((node) =>
        shouldRunWorkflowNode(run.workflowVersion.graph, node.id, prepared.state),
      );
      const skippedComposerNodes = composerNodes.filter(
        (node) => !runnableComposerNodes.some((runnable) => runnable.id === node.id),
      );
      if (skippedComposerNodes.length)
        await db.nodeRun.updateMany({
          where: { runId: run.id, nodeKey: { in: skippedComposerNodes.map((node) => node.id) } },
          data: {
            state: NodeState.SUCCEEDED,
            completedAt: new Date(),
            outputRefs: { skipped: true, reason: "conditional branch not selected" },
          },
        });
      await db.nodeRun.updateMany({
        where: { runId: run.id, nodeKey: { in: controlNodes.review } },
        data: { state: NodeState.AWAITING_REVIEW, completedAt: null },
      });

      const persistedOutputs = await db.$transaction(async (tx) => {
        await Promise.all(
          generationResults.map(({ nodeKey, format, modelRef, result }) => {
            const providerCallId =
              result.providerRequestId ??
              `${run.id}:${nodeKey}:${modelRef ?? "default"}:${format}:${result.provider}`;
            return tx.providerCost.upsert({
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
          }),
        );
        return Promise.all(
          generatedProviderOutputs.map(
            async ({ output, result, format, modelRef, nodeKey }, index) => {
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
              return { asset, output, result, format, modelRef, nodeKey };
            },
          ),
        );
      });

      const comparisonNodes = runnableCreativeNodes.filter(
        (node) => node.type === "model_comparison",
      );
      for (const comparisonNode of comparisonNodes) {
        const comparison = await db.modelComparison.upsert({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: job.data.workspaceId,
              idempotencyKey: `${run.id}:workflow-comparison:${comparisonNode.id}`,
            },
          },
          update: {
            status: "COMPLETED",
            constraints: {
              formats: requestedFormats,
              runId: run.id,
              nodeKey: comparisonNode.id,
            },
          },
          create: {
            workspaceId: job.data.workspaceId,
            createdBy: "system-runner",
            prompt: workflowPromptForNode(comparisonNode, prepared.state, [
              brief.product,
              brief.scene,
              brief.audience,
              brief.cta,
            ]),
            constraints: {
              formats: requestedFormats,
              runId: run.id,
              nodeKey: comparisonNode.id,
            },
            status: "COMPLETED",
            idempotencyKey: `${run.id}:workflow-comparison:${comparisonNode.id}`,
          },
        });
        const comparisonOutputs = persistedOutputs.filter(
          (entry) => entry.nodeKey === comparisonNode.id,
        );
        for (const [comparisonIndex, entry] of comparisonOutputs.entries()) {
          const model = entry.modelRef ?? entry.result.model;
          const format = entry.format;
          const outputId = `${comparison.id}:${model}:${format}:${comparisonIndex}`;
          await db.modelComparisonOutput.upsert({
            where: { id: outputId },
            update: {
              provider: entry.result.provider,
              model,
              status: "COMPLETED",
              assetId: entry.asset.id,
              quote: {
                format,
                providerCostMinor: entry.result.usage.providerCostMinor,
                currency: entry.result.usage.currency,
              },
              metadata: {
                providerModel: entry.result.model,
                providerVersion: entry.result.modelVersion,
                requestedModelRef: entry.modelRef ?? null,
                contentHash: entry.asset.contentHash,
              },
            },
            create: {
              id: outputId,
              workspaceId: job.data.workspaceId,
              comparisonId: comparison.id,
              provider: entry.result.provider,
              model,
              status: "COMPLETED",
              assetId: entry.asset.id,
              quote: {
                format,
                providerCostMinor: entry.result.usage.providerCostMinor,
                currency: entry.result.usage.currency,
              },
              metadata: {
                providerModel: entry.result.model,
                providerVersion: entry.result.modelVersion,
                requestedModelRef: entry.modelRef ?? null,
                contentHash: entry.asset.contentHash,
              },
            },
          });
        }
      }

      const generatedOutputRecords = persistedOutputs.map(
        ({ asset, output, result, format, modelRef, nodeKey }, index) => ({
          id: `${run.id}-output-${index}`,
          assetId: asset.id,
          name: output.name ?? asset.name,
          format: output.format ?? format,
          width: output.width,
          height: output.height,
          metadata: {
            ...(output.metadata ?? {}),
            provider: result.provider,
            model: result.model,
            modelVersion: result.modelVersion,
            requestedModelRef: modelRef,
            contentHash: asset.contentHash,
            objectKey: asset.objectKey,
            workflowNode: nodeKey,
          },
        }),
      );
      const composerResults = runnableComposerNodes.length
        ? await executeComposerNodes({
            runId: run.id,
            workspaceId: job.data.workspaceId,
            correlationId: job.data.correlationId,
            composerNodes: runnableComposerNodes,
            sourceAssetIds: persistedOutputs.map(({ asset }) => asset.id),
            formats: requestedFormats,
            brief: {
              ...brief,
              headline: text(brief.headline) || text(brief.product),
              body: text(brief.body) || text(brief.scene),
            },
            brand: record(run.brandSnapshot),
          })
        : [];
      const composedOutputAssets = composerResults.length
        ? await db.outputAsset.findMany({
            where: {
              id: { in: composerResults.map((item) => item.outputAssetId) },
              workspaceId: job.data.workspaceId,
            },
            include: { asset: true },
          })
        : [];
      const composedOutputs = composedOutputAssets.map((output) => {
        const composition = composerResults.find((item) => item.outputAssetId === output.id);
        return {
          id: output.id,
          assetId: output.assetId,
          name: output.name,
          format: composition?.format ?? output.format,
          width: output.width,
          height: output.height,
          metadata: {
            ...record(output.metadata),
            provider: "media-renderer",
            contentHash: output.asset?.contentHash,
            objectKey: output.asset?.objectKey,
            workflowNode: composition?.nodeKey,
          },
        };
      });
      const outputs = [...generatedOutputRecords, ...composedOutputs].map((output) => ({
        ...output,
        assetId: output.assetId ?? undefined,
        width: output.width ?? undefined,
        height: output.height ?? undefined,
      }));
      const outputGates = await Promise.all(
        [
          ...persistedOutputs.map(({ asset }) => asset),
          ...composedOutputAssets.map((output) => output.asset).filter(Boolean),
        ].map((asset) => runAssetGate(safetyContext, asset!.id)),
      );
      const checkedOutputs = outputs.map((output, index) => ({
        ...output,
        objectKey:
          typeof output.metadata?.objectKey === "string" ? output.metadata.objectKey : undefined,
        contentHash:
          typeof output.metadata?.contentHash === "string"
            ? output.metadata.contentHash
            : undefined,
        metadata: {
          ...(output.metadata ?? {}),
          outputSafety: outputGates[index],
          ocrChecked: outputGates[index]?.ocr?.status === "PASSED",
          maskingChecked: outputGates[index]?.masking?.status === "PASSED",
          integrityChecked: outputGates[index]?.integrity?.status === "PASSED",
          // These records come from the persisted output-asset gates. They are
          // evidence, not a caller-provided pass flag. Product, claim, brand,
          // typography, rights, and safe-area evidence remains provider-backed.
          ocrEvidence: evidenceFromScan(outputGates[index]?.ocr ?? null),
          maskingEvidence: evidenceFromScan(outputGates[index]?.masking ?? null),
          integrityEvidence: evidenceFromScan(outputGates[index]?.integrity ?? null),
        },
      }));
      const verdicts = evaluateCreativeOutputs(brief as ProductLockBrief, checkedOutputs);
      await db.nodeRun.updateMany({
        where: {
          runId: run.id,
          nodeKey: {
            in: [
              ...runnableCreativeNodes.map((node) => node.id),
              ...runnableComposerNodes.map((node) => node.id),
            ],
          },
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
        {
          outputs,
          verdicts,
          actualUnits: generationResults.reduce(
            (total, entry) =>
              total + (entry.result.usage.outputUnits ?? entry.result.outputs.length),
            0,
          ),
        },
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
