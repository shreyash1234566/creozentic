import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function listPerformanceRecommendations(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.performanceRecommendation.findMany({
    where: { workspaceId: context.workspaceId, optOut: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function refreshPerformanceRecommendations(context: RequestContext) {
  requireRole(context, "EDITOR");
  const metrics = await db.performanceMetric.groupBy({
    where: { workspaceId: context.workspaceId },
    by: ["metric"],
    _avg: { value: true },
    _count: { _all: true },
  });
  const suggestions = metrics.flatMap((metric) => {
    const average = metric._avg.value;
    if (average === null) return [];
    const normalized = metric.metric.toLowerCase();
    if (normalized === "ctr") {
      const strong = average >= 4;
      return [
        {
          metric: metric.metric,
          title: strong
            ? "Prioritize the strongest CTR creative route"
            : "Review low-CTR creative routes before scaling",
          rationale: `The imported ${metric.metric} average is ${average.toFixed(2)} across ${metric._count._all} observations. This is a descriptive signal, not a causal claim.`,
          action: strong
            ? "Use this route as the next controlled creative test."
            : "Keep the route in review and test a targeted hook or format change.",
          evidence: { average, observations: metric._count._all, source: "performanceMetric" },
        },
      ];
    }
    if (normalized === "conversion" || normalized === "conversions") {
      return [
        {
          metric: metric.metric,
          title: "Keep conversion evidence attached to creative decisions",
          rationale: `Conversion observations average ${average.toFixed(2)} across ${metric._count._all} records; audience, placement, and budget are not treated as creative causality.`,
          action: "Compare approved creative attributes before changing the template.",
          evidence: { average, observations: metric._count._all, source: "performanceMetric" },
        },
      ];
    }
    return [
      {
        metric: metric.metric,
        title: `Review ${metric.metric} before the next campaign decision`,
        rationale: `The imported ${metric.metric} series has an average of ${average.toFixed(2)} across ${metric._count._all} observations.`,
        action:
          "Use the signal as a human-reviewed input; do not rewrite brand rules automatically.",
        evidence: { average, observations: metric._count._all, source: "performanceMetric" },
      },
    ];
  });
  for (const suggestion of suggestions) {
    await db.performanceRecommendation.upsert({
      where: {
        workspaceId_metric_title: {
          workspaceId: context.workspaceId,
          metric: suggestion.metric,
          title: suggestion.title,
        },
      },
      update: {
        rationale: suggestion.rationale,
        action: suggestion.action,
        evidence: json(suggestion.evidence),
        status: "OPEN",
        optOut: false,
      },
      create: {
        workspaceId: context.workspaceId,
        metric: suggestion.metric,
        title: suggestion.title,
        rationale: suggestion.rationale,
        action: suggestion.action,
        evidence: json(suggestion.evidence),
        createdBy: context.userId,
      },
    });
  }
  return listPerformanceRecommendations(context);
}

export async function assessCreativeFatigue(context: RequestContext) {
  requireRole(context, "EDITOR");
  const outputs = await db.outputAsset.findMany({
    where: { workspaceId: context.workspaceId, status: { in: ["APPROVED", "PUBLISHED"] } },
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: { asset: { select: { contentHash: true } } },
  });
  const grouped = new Map<string, typeof outputs>();
  for (const output of outputs) {
    const metadata =
      output.metadata && typeof output.metadata === "object"
        ? (output.metadata as Record<string, unknown>)
        : {};
    const key = String(metadata.templateId ?? metadata.route ?? output.format ?? "unknown");
    grouped.set(key, [...(grouped.get(key) ?? []), output]);
  }
  const findings: Array<Record<string, unknown>> = [];
  for (const [route, items] of grouped) {
    const hashes = new Map<string, number>();
    for (const item of items) {
      const hash = item.asset?.contentHash;
      if (hash) hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
    }
    const duplicates = [...hashes.values()]
      .filter((count) => count > 1)
      .reduce((sum, count) => sum + count - 1, 0);
    const concentration = items.length ? Math.max(...hashes.values(), 0) / items.length : 0;
    if (items.length >= 4 && (duplicates > 0 || concentration >= 0.6)) {
      const title = `Diversify ${route} to reduce exact creative repetition`;
      const evidence = {
        route,
        approvedOutputs: items.length,
        exactDuplicateOutputs: duplicates,
        hashConcentration: concentration,
      };
      const rationale = `Exact content-hash repetition was detected in ${route}. This is a deterministic duplicate check; connect a visual-similarity provider for semantic fatigue scoring.`;
      await db.performanceRecommendation.upsert({
        where: {
          workspaceId_metric_title: {
            workspaceId: context.workspaceId,
            metric: "creative_fatigue",
            title,
          },
        },
        update: {
          rationale,
          action:
            "Require a different hook, source shot, or template route before the next approval.",
          evidence: json(evidence),
          status: "OPEN",
          optOut: false,
        },
        create: {
          workspaceId: context.workspaceId,
          metric: "creative_fatigue",
          title,
          rationale,
          action:
            "Require a different hook, source shot, or template route before the next approval.",
          evidence: json(evidence),
          createdBy: context.userId,
        },
      });
      findings.push(evidence);
    }
  }
  return { findings, deterministicOnly: true };
}

export async function updatePerformanceRecommendation(
  context: RequestContext,
  recommendationId: string,
  input: { status?: "OPEN" | "APPLIED" | "DISMISSED"; optOut?: boolean },
) {
  requireRole(context, "EDITOR");
  const recommendation = await db.performanceRecommendation.findFirst({
    where: { id: recommendationId, workspaceId: context.workspaceId },
  });
  if (!recommendation)
    throw new ApiError(
      404,
      "RECOMMENDATION_NOT_FOUND",
      "The performance recommendation was not found.",
    );
  const status = input.status ?? recommendation.status;
  if (!["OPEN", "APPLIED", "DISMISSED"].includes(status))
    throw new ApiError(400, "INVALID_RECOMMENDATION_STATUS", "Unsupported recommendation status.");
  return db.performanceRecommendation.update({
    where: { id: recommendation.id },
    data: {
      status,
      optOut: input.optOut ?? recommendation.optOut,
      appliedAt: status === "APPLIED" ? new Date() : recommendation.appliedAt,
    },
  });
}
