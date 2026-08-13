import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scoreExpected(
  actual: unknown,
  expected: unknown,
): { score: number; details: Record<string, unknown> } {
  if (typeof expected === "string") {
    const passed = actual === expected;
    return { score: passed ? 1 : 0, details: { expected, actual, passed } };
  }
  if (typeof expected === "number" || typeof expected === "boolean") {
    const passed = actual === expected;
    return { score: passed ? 1 : 0, details: { expected, actual, passed } };
  }
  if (Array.isArray(expected)) {
    const actualArray = Array.isArray(actual) ? actual : [];
    const matches = expected.filter(
      (value, index) => scoreExpected(actualArray[index], value).score === 1,
    ).length;
    return {
      score: expected.length ? matches / expected.length : actualArray.length === 0 ? 1 : 0,
      details: { expectedCount: expected.length, actualCount: actualArray.length, matches },
    };
  }
  const expectedObject = object(expected);
  const actualObject = object(actual);
  const keys = Object.keys(expectedObject);
  const scores = keys.map((key) => scoreExpected(actualObject[key], expectedObject[key]).score);
  const score = keys.length ? scores.reduce((sum, value) => sum + value, 0) / keys.length : 1;
  return { score, details: { keys, missing: keys.filter((key) => !(key in actualObject)), score } };
}

export async function createBenchmarkSuite(
  context: RequestContext,
  input: {
    name: string;
    slug: string;
    groundTruth?: Record<string, unknown>;
    cases: Array<{ name: string; input: unknown; expected: unknown; weight?: number }>;
  },
) {
  requireRole(context, "EDITOR");
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || !/^[a-z0-9][a-z0-9-]+$/.test(slug))
    throw new ApiError(400, "INVALID_BENCHMARK_SUITE", "name and a URL-safe slug are required.");
  if (input.cases.length < 1 || input.cases.length > 100)
    throw new ApiError(
      400,
      "INVALID_BENCHMARK_CASES",
      "A benchmark suite must contain 1 to 100 cases.",
    );
  const suite = await db.benchmarkSuite.create({
    data: {
      workspaceId: context.workspaceId,
      name,
      slug,
      groundTruth: json(input.groundTruth ?? {}),
      createdBy: context.userId,
      cases: {
        create: input.cases.map((item) => ({
          workspaceId: context.workspaceId,
          name: item.name.trim(),
          input: json(item.input),
          expected: json(item.expected),
          weight: Number.isInteger(item.weight) && (item.weight ?? 0) > 0 ? item.weight : 1,
        })),
      },
    },
    include: { cases: true },
  });
  await db.auditEvent.create({
    data: {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "benchmark.suite.created",
      targetType: "benchmark_suite",
      targetId: suite.id,
      correlationId: context.correlationId,
      metadata: { caseCount: suite.cases.length },
    },
  });
  return suite;
}

export async function listBenchmarkSuites(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.benchmarkSuite.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cases: true, runs: true } } },
  });
}

export async function runBenchmarkSuite(
  context: RequestContext,
  suiteId: string,
  modelRef?: string,
  outputs?: Record<string, unknown>,
) {
  requireRole(context, "EDITOR");
  const suite = await db.benchmarkSuite.findFirst({
    where: { id: suiteId, workspaceId: context.workspaceId },
    include: { cases: true },
  });
  if (!suite) throw new ApiError(404, "BENCHMARK_NOT_FOUND", "The benchmark suite was not found.");
  const run = await db.benchmarkRun.create({
    data: {
      workspaceId: context.workspaceId,
      suiteId: suite.id,
      modelRef,
      createdBy: context.userId,
    },
  });
  let weightedScore = 0;
  let weightTotal = 0;
  for (const benchmarkCase of suite.cases) {
    const candidate = outputs
      ? (outputs[benchmarkCase.id] ?? outputs[benchmarkCase.name])
      : benchmarkCase.input;
    const result = scoreExpected(candidate, benchmarkCase.expected);
    weightedScore += result.score * benchmarkCase.weight;
    weightTotal += benchmarkCase.weight;
    await db.benchmarkResult.create({
      data: {
        workspaceId: context.workspaceId,
        runId: run.id,
        caseId: benchmarkCase.id,
        score: result.score,
        passed: result.score >= 0.9,
        details: json(result.details),
      },
    });
  }
  const score = weightTotal ? weightedScore / weightTotal : 0;
  const completed = await db.benchmarkRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      summary: {
        score,
        passed: score >= 0.9,
        caseCount: suite.cases.length,
        evaluationMode: outputs ? "provided-model-outputs" : "fixture-baseline",
      },
    },
    include: { results: true, suite: true },
  });
  await db.auditEvent.create({
    data: {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "benchmark.run.completed",
      targetType: "benchmark_run",
      targetId: run.id,
      correlationId: context.correlationId,
      metadata: { score, passed: score >= 0.9, modelRef },
    },
  });
  return completed;
}

export async function createPolicy(
  context: RequestContext,
  input: { kind: string; content: Record<string, unknown> },
) {
  requireRole(context, "ADMIN");
  const kind = input.kind.trim().toUpperCase();
  if (!["PRIVACY", "IP_RIGHTS", "AI_DISCLOSURE", "RETENTION"].includes(kind))
    throw new ApiError(400, "INVALID_POLICY_KIND", "Unsupported policy kind.");
  const latest = await db.workspacePolicy.findFirst({
    where: { workspaceId: context.workspaceId, kind },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return db.workspacePolicy.create({
    data: {
      workspaceId: context.workspaceId,
      kind,
      version: (latest?.version ?? 0) + 1,
      content: json(input.content),
      createdBy: context.userId,
    },
  });
}

export async function listPolicies(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.workspacePolicy.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: [{ kind: "asc" }, { version: "desc" }],
  });
}

export async function approvePolicy(context: RequestContext, policyId: string) {
  requireRole(context, "ADMIN");
  const policy = await db.workspacePolicy.findFirst({
    where: { id: policyId, workspaceId: context.workspaceId },
  });
  if (!policy) throw new ApiError(404, "POLICY_NOT_FOUND", "The policy was not found.");
  await db.workspacePolicy.updateMany({
    where: { workspaceId: context.workspaceId, kind: policy.kind, status: "APPROVED" },
    data: { status: "SUPERSEDED" },
  });
  return db.workspacePolicy.update({
    where: { id: policy.id },
    data: { status: "APPROVED", approvedBy: context.userId, approvedAt: new Date() },
  });
}
