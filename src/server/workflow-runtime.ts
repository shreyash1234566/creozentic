import { NodeState, Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { providerApiError, requestProvider } from "./provider-http";
import { topologicalWorkflowNodePlan, type WorkflowNodePlan } from "./workflow-catalog";

type RuntimeState = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function readPath(state: RuntimeState, rawPath: unknown) {
  if (typeof rawPath !== "string" || !rawPath.trim()) return undefined;
  const parts = rawPath
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length || !["brief", "brand", "product", "nodes"].includes(parts[0])) return undefined;
  let current: unknown = state;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderWorkflowTemplate(template: string, state: RuntimeState) {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path: string) => {
    const value = readPath(state, path);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      return String(value);
    return "";
  });
}

function selectedBranch(config: Record<string, unknown>, state: RuntimeState) {
  const value = readPath(state, config.path);
  if ("equals" in config) return value === config.equals ? "true" : "false";
  if ("exists" in config) return Boolean(value) === Boolean(config.exists) ? "true" : "false";
  if (typeof value === "boolean") return value ? "true" : "false";
  return value ? "truthy" : "falsey";
}

async function executeTextNode(
  node: WorkflowNodePlan,
  state: RuntimeState,
  idempotencyKey: string,
) {
  const template = typeof node.config.prompt === "string" ? node.config.prompt : "";
  const prompt = renderWorkflowTemplate(template, state);
  if (!prompt)
    throw new ApiError(400, "TEXT_NODE_PROMPT_REQUIRED", "A text node needs a prompt template.");
  const endpoint = process.env.TEXT_PROVIDER_URL;
  if (!endpoint)
    throw new ApiError(
      503,
      "TEXT_PROVIDER_NOT_CONFIGURED",
      "TEXT_PROVIDER_URL is required for production text-generation workflow nodes.",
    );
  try {
    const response = await requestProvider<Record<string, unknown>>({
      provider: "workflow-text",
      endpoint,
      headers: process.env.TEXT_PROVIDER_API_KEY
        ? { authorization: `Bearer ${process.env.TEXT_PROVIDER_API_KEY}` }
        : undefined,
      idempotencyKey,
      timeoutMs: Number(process.env.TEXT_PROVIDER_TIMEOUT_MS ?? 30_000),
      body: {
        task: "workflow.text_generation",
        prompt,
        outputSchema: node.config.outputSchema ?? { type: "string" },
        context: { brief: state.brief, brand: state.brand, product: state.product },
      },
    });
    const text =
      typeof response.body.text === "string"
        ? response.body.text
        : typeof response.body.output === "string"
          ? response.body.output
          : "";
    if (!text.trim())
      throw new ApiError(
        502,
        "TEXT_PROVIDER_INVALID",
        "The text provider returned no usable text.",
      );
    return { prompt, text: text.trim(), providerRequestId: response.requestId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerApiError(error, "TEXT_PROVIDER_FAILED", "The text provider failed.");
  }
}

async function executeNode(node: WorkflowNodePlan, state: RuntimeState, idempotencyKey: string) {
  if (node.type === "input") return { accepted: true, brief: state.brief };
  if (node.type === "brand_context") return state.brand;
  if (node.type === "product_lookup") return state.product;
  if (node.type === "prompt_template") {
    const template = typeof node.config.template === "string" ? node.config.template : "";
    if (!template)
      throw new ApiError(
        400,
        "PROMPT_TEMPLATE_REQUIRED",
        "A prompt template node requires config.template.",
      );
    return { prompt: renderWorkflowTemplate(template, state) };
  }
  if (node.type === "text_generation") return executeTextNode(node, state, idempotencyKey);
  if (node.type === "condition") return { branch: selectedBranch(node.config, state) };
  if (node.type === "split") {
    const values = readPath(state, node.config.path);
    if (!Array.isArray(values))
      throw new ApiError(
        400,
        "SPLIT_INPUT_REQUIRED",
        "A split node requires an array at config.path.",
      );
    const maximum = Math.min(Math.max(Number(node.config.maxFanOut ?? 20), 1), 100);
    if (values.length > maximum)
      throw new ApiError(
        409,
        "SPLIT_FANOUT_LIMIT",
        `Split node exceeds its maximum fan-out of ${maximum}.`,
      );
    return { count: values.length, items: values };
  }
  if (node.type === "merge") {
    const values = readPath(state, node.config.path);
    if (!Array.isArray(values))
      throw new ApiError(
        400,
        "MERGE_INPUT_REQUIRED",
        "A merge node requires an array at config.path.",
      );
    return { count: values.length, items: values };
  }
  return { deferred: true, type: node.type };
}

/** Runs typed, deterministic preparation nodes before the costly image/video nodes. */
export async function executeWorkflowPreparation(input: {
  runId: string;
  graph: unknown;
  brief: unknown;
  brand: unknown;
  product: unknown;
  idempotencyKeyPrefix: string;
}) {
  const state: RuntimeState = {
    brief: record(input.brief),
    brand: record(input.brand),
    product: record(input.product),
    nodes: {},
  };
  const nodes = topologicalWorkflowNodePlan(input.graph);
  const preparation = nodes.filter((node) =>
    [
      "input",
      "brand_context",
      "product_lookup",
      "prompt_template",
      "text_generation",
      "condition",
      "split",
      "merge",
    ].includes(node.type),
  );
  for (const node of preparation) {
    await db.nodeRun.updateMany({
      where: { runId: input.runId, nodeKey: node.id },
      data: { state: NodeState.RUNNING, attempts: { increment: 1 }, startedAt: new Date() },
    });
    const output = await executeNode(node, state, `${input.idempotencyKeyPrefix}:${node.id}`);
    (state.nodes as Record<string, unknown>)[node.id] = output;
    await db.nodeRun.updateMany({
      where: { runId: input.runId, nodeKey: node.id },
      data: { state: NodeState.SUCCEEDED, outputRefs: json(output), completedAt: new Date() },
    });
  }
  return { state, nodes };
}

export function workflowPromptForNode(
  node: WorkflowNodePlan,
  state: RuntimeState,
  fallbackParts: Array<string | undefined>,
) {
  const configured =
    typeof node.config.promptTemplate === "string"
      ? renderWorkflowTemplate(node.config.promptTemplate, state)
      : typeof node.config.promptFrom === "string"
        ? readPath(state, node.config.promptFrom)
        : undefined;
  const fromPreparation = Object.values(record(state.nodes))
    .map((value) => record(value).prompt ?? record(value).text)
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return [
    typeof configured === "string" ? configured : undefined,
    ...fromPreparation,
    typeof node.config.promptPrefix === "string" ? node.config.promptPrefix : undefined,
    ...fallbackParts,
    typeof node.config.promptSuffix === "string" ? node.config.promptSuffix : undefined,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(". ");
}
