import { Prisma, WorkflowVisibility } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";

const allowedNodeTypes = new Set([
  "input",
  "brand_context",
  "product_lookup",
  "prompt_template",
  "image_generation",
  "image_edit",
  "model_comparison",
  "text_generation",
  "condition",
  "split",
  "merge",
  "human_review",
  "composer",
  "export",
]);

export type WorkflowNodePlan = {
  id: string;
  type: string;
  config: Record<string, unknown>;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateWorkflowGraph(value: unknown) {
  const graph = asRecord(value);
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > 100)
    throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "graph.nodes must contain 1 to 100 nodes.");
  const nodes = graph.nodes
    .map((node) => asRecord(node))
    .filter((node): node is Record<string, unknown> => Boolean(node));
  if (nodes.length !== graph.nodes.length)
    throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "Every workflow node must be an object.");
  const ids = new Set<string>();
  for (const node of nodes) {
    const id = typeof node.id === "string" ? node.id.trim() : "";
    const type = typeof node.type === "string" ? node.type.trim() : "";
    if (!id || ids.has(id))
      throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "Node IDs must be unique and non-empty.");
    if (!allowedNodeTypes.has(type))
      throw new ApiError(
        400,
        "UNSUPPORTED_WORKFLOW_NODE",
        `Node type ${type || "unknown"} is not allowed.`,
      );
    ids.add(id);
  }
  const edges = Array.isArray(graph.edges) ? graph.edges.map(asRecord) : [];
  if (edges.length > 300)
    throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "A workflow may contain at most 300 edges.");
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  ids.forEach((id) => {
    outgoing.set(id, []);
    indegree.set(id, 0);
  });
  for (const edge of edges) {
    const from = typeof edge?.from === "string" ? edge.from : "";
    const to = typeof edge?.to === "string" ? edge.to : "";
    if (!ids.has(from) || !ids.has(to))
      throw new ApiError(
        400,
        "INVALID_WORKFLOW_GRAPH",
        "Every edge must reference existing nodes.",
      );
    outgoing.get(from)!.push(to);
    indegree.set(to, indegree.get(to)! + 1);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const child of outgoing.get(id) ?? []) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (visited !== ids.size)
    throw new ApiError(400, "WORKFLOW_CYCLE", "Workflow graphs must be acyclic.");
  return graph as Prisma.InputJsonObject;
}

/**
 * Older seeded workflows use a string-only node list. Keep those immutable
 * versions executable while all newly-authored versions retain the typed node
 * information required by the runtime.
 */
export function workflowNodePlan(value: unknown): WorkflowNodePlan[] {
  const graph = asRecord(value);
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  if (!rawNodes.length)
    throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "A workflow requires nodes.");
  const legacyTypes: Record<string, string> = {
    validate: "input",
    mask: "image_edit",
    environment: "image_generation",
    composite: "composer",
    quality: "condition",
    review: "human_review",
    export: "export",
  };
  const nodes = rawNodes.map((raw, index): WorkflowNodePlan => {
    if (typeof raw === "string") {
      const id = raw.trim();
      if (!id)
        throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "Workflow node IDs must be non-empty.");
      return { id, type: legacyTypes[id] ?? "input", config: {} };
    }
    const node = asRecord(raw);
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const type = typeof node?.type === "string" ? node.type.trim() : "";
    if (!id || !allowedNodeTypes.has(type))
      throw new ApiError(
        400,
        "INVALID_WORKFLOW_GRAPH",
        "Workflow nodes require a supported id and type.",
      );
    return { id, type, config: asRecord(node?.config) ?? {} };
  });
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
    throw new ApiError(400, "INVALID_WORKFLOW_GRAPH", "Workflow node IDs must be unique.");
  return nodes;
}

export function topologicalWorkflowNodePlan(value: unknown): WorkflowNodePlan[] {
  const nodes = workflowNodePlan(value);
  const graph = asRecord(value);
  if (!graph || !Array.isArray(graph.edges) || graph.edges.length === 0) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const rawEdge of graph.edges) {
    const edge = asRecord(rawEdge);
    const from = typeof edge?.from === "string" ? edge.from : "";
    const to = typeof edge?.to === "string" ? edge.to : "";
    if (!byId.has(from) || !byId.has(to))
      throw new ApiError(
        400,
        "INVALID_WORKFLOW_GRAPH",
        "Every edge must reference existing nodes.",
      );
    outgoing.get(from)!.push(to);
    indegree.set(to, indegree.get(to)! + 1);
  }
  const ready = nodes.filter((node) => indegree.get(node.id) === 0);
  const ordered: WorkflowNodePlan[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const child of outgoing.get(node.id) ?? []) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) ready.push(byId.get(child)!);
    }
  }
  if (ordered.length !== nodes.length)
    throw new ApiError(400, "WORKFLOW_CYCLE", "Workflow graphs must be acyclic.");
  return ordered;
}

export function workflowReviewAndExportKeys(value: unknown) {
  const nodes = workflowNodePlan(value);
  return {
    review: nodes.filter((node) => node.type === "human_review").map((node) => node.id),
    export: nodes.filter((node) => node.type === "export").map((node) => node.id),
  };
}

function versionNumber(version: string) {
  const match = version.match(/v?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

export async function createWorkflowTemplate(
  context: RequestContext,
  input: {
    name: string;
    category: string;
    graph: unknown;
    inputSchema?: unknown;
    permissions?: unknown;
    costFormula?: unknown;
    visibility?: string;
    autopilotMetadata?: unknown;
  },
) {
  requireRole(context, "STRATEGIST");
  const name = input.name.trim();
  const category = input.category.trim();
  if (!name || !category)
    throw new ApiError(400, "INVALID_WORKFLOW", "name and category are required.");
  const graph = validateWorkflowGraph(input.graph);
  const visibility = Object.values(WorkflowVisibility).includes(
    input.visibility as WorkflowVisibility,
  )
    ? (input.visibility as WorkflowVisibility)
    : WorkflowVisibility.PRIVATE;
  return db.$transaction(async (tx) => {
    const template = await tx.workflowTemplate.create({
      data: {
        workspaceId: context.workspaceId,
        ownerId: context.userId,
        name,
        category,
        visibility,
        autopilotMetadata: (input.autopilotMetadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    const version = await tx.workflowVersion.create({
      data: {
        templateId: template.id,
        version: "v1.0.0",
        graph,
        inputSchema: (input.inputSchema ?? {}) as Prisma.InputJsonValue,
        permissions: (input.permissions ?? {}) as Prisma.InputJsonValue,
        costFormula: (input.costFormula ?? {}) as Prisma.InputJsonValue,
      },
    });
    await tx.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "workflow.created",
        targetType: "workflow_template",
        targetId: template.id,
        correlationId: context.correlationId,
        metadata: { version: version.version },
      },
    });
    return { template, version };
  });
}

export async function createWorkflowVersion(
  context: RequestContext,
  templateId: string,
  input: {
    version: string;
    graph: unknown;
    inputSchema?: unknown;
    permissions?: unknown;
    costFormula?: unknown;
  },
) {
  requireRole(context, "STRATEGIST");
  const version = input.version.trim();
  if (!version || versionNumber(version) === undefined)
    throw new ApiError(
      400,
      "INVALID_WORKFLOW_VERSION",
      "version must contain a numeric major version.",
    );
  const template = await db.workflowTemplate.findFirst({
    where: { id: templateId, workspaceId: context.workspaceId },
    include: { versions: true },
  });
  if (!template)
    throw new ApiError(404, "WORKFLOW_NOT_FOUND", "The workflow is not in this workspace.");
  const graph = validateWorkflowGraph(input.graph);
  try {
    return await db.workflowVersion.create({
      data: {
        templateId,
        version,
        graph,
        inputSchema: (input.inputSchema ?? {}) as Prisma.InputJsonValue,
        permissions: (input.permissions ?? {}) as Prisma.InputJsonValue,
        costFormula: (input.costFormula ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new ApiError(
        409,
        "WORKFLOW_VERSION_EXISTS",
        "That immutable workflow version already exists.",
      );
    throw error;
  }
}

export async function publishWorkflowVersion(
  context: RequestContext,
  templateId: string,
  versionId: string,
) {
  requireRole(context, "STRATEGIST");
  const version = await db.workflowVersion.findFirst({
    where: { id: versionId, templateId, template: { workspaceId: context.workspaceId } },
    select: { id: true, version: true },
  });
  if (!version)
    throw new ApiError(404, "WORKFLOW_VERSION_NOT_FOUND", "The workflow version was not found.");
  const publishedVersion = versionNumber(version.version);
  if (publishedVersion === undefined)
    throw new ApiError(400, "INVALID_WORKFLOW_VERSION", "The version cannot be published.");
  return db.workflowTemplate.update({ where: { id: templateId }, data: { publishedVersion } });
}
