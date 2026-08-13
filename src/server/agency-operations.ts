import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function statusForPlan(status: string) {
  if (["NEEDS_INPUT", "REPAIR_REQUIRED"].includes(status)) return "BLOCKED";
  if (["PENDING_APPROVAL", "PLANNED", "PRODUCING"].includes(status)) return "CLIENT_REVIEW";
  if (["APPROVED", "PUBLISH_PENDING"].includes(status)) return "APPROVED_PUBLISH";
  if (["DELIVERED", "PUBLISHED"].includes(status)) return "DELIVERED";
  return "INTERNAL_REVIEW";
}

export async function syncAgencyWorkItem(context: RequestContext, planId: string) {
  const plan = await db.dailyContentPlan.findFirst({
    where: { id: planId, workspaceId: context.workspaceId },
    include: {
      brand: { select: { name: true } },
      failures: { where: { status: "OPEN" }, select: { customerImpact: true } },
    },
  });
  if (!plan)
    throw new ApiError(404, "DAILY_PLAN_NOT_FOUND", "The daily content plan was not found.");
  const started = plan.startedAt?.getTime() ?? plan.createdAt.getTime();
  const turnaroundHours = plan.completedAt
    ? (plan.completedAt.getTime() - started) / 3_600_000
    : undefined;
  const cost =
    typeof plan.costEstimate === "object" && plan.costEstimate && !Array.isArray(plan.costEstimate)
      ? Number((plan.costEstimate as Record<string, unknown>).deterministicRenderStorage ?? 0)
      : 0;
  return db.agencyWorkItem.upsert({
    where: { workspaceId_dailyPlanId: { workspaceId: context.workspaceId, dailyPlanId: plan.id } },
    update: {
      brandId: plan.brandId,
      title: `${plan.brand?.name ?? "Brand"} daily creative`,
      status: statusForPlan(plan.status),
      turnaroundHours,
      costCredits: Number.isFinite(cost) ? cost : 0,
      blockedReason: plan.failures[0]?.customerImpact ?? null,
      metadata: json({ planStatus: plan.status, planDate: plan.planDate.toISOString() }),
    },
    create: {
      workspaceId: context.workspaceId,
      brandId: plan.brandId,
      dailyPlanId: plan.id,
      title: `${plan.brand?.name ?? "Brand"} daily creative`,
      status: statusForPlan(plan.status),
      turnaroundHours,
      costCredits: Number.isFinite(cost) ? cost : 0,
      blockedReason: plan.failures[0]?.customerImpact,
      metadata: json({ planStatus: plan.status, planDate: plan.planDate.toISOString() }),
    },
  });
}

export async function listAgencyQueue(
  context: RequestContext,
  input: { status?: string; brandId?: string },
) {
  requireRole(context, "VIEWER");
  const plans = await db.dailyContentPlan.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(input.brandId ? { brandId: input.brandId } : {}),
    },
    select: { id: true },
  });
  await Promise.all(plans.map((plan) => syncAgencyWorkItem(context, plan.id)));
  return db.agencyWorkItem.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.brandId ? { brandId: input.brandId } : {}),
    },
    orderBy: [{ deadline: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

export async function agencyMetrics(context: RequestContext) {
  requireRole(context, "VIEWER");
  const dailyPlans = await db.dailyContentPlan.findMany({
    where: { workspaceId: context.workspaceId },
    select: { id: true },
  });
  await Promise.all(dailyPlans.map((plan) => syncAgencyWorkItem(context, plan.id)));
  const [items, plans] = await Promise.all([
    db.agencyWorkItem.findMany({
      where: { workspaceId: context.workspaceId },
      select: {
        status: true,
        revisionCount: true,
        turnaroundHours: true,
        costCredits: true,
        providerSpendMinor: true,
        revenueMinor: true,
        marginMinor: true,
        deadline: true,
      },
    }),
    db.dailyContentPlan.count({
      where: { workspaceId: context.workspaceId, status: { in: ["DELIVERED", "PUBLISHED"] } },
    }),
  ]);
  const now = Date.now();
  const overdue = items.filter(
    (item) =>
      item.deadline &&
      item.deadline.getTime() < now &&
      !["DELIVERED", "PUBLISHED"].includes(item.status),
  ).length;
  const average =
    items
      .filter((item) => item.turnaroundHours !== null)
      .reduce((sum, item) => sum + (item.turnaroundHours ?? 0), 0) /
    Math.max(items.filter((item) => item.turnaroundHours !== null).length, 1);
  const margins = items
    .filter((item) => item.marginMinor !== null)
    .map((item) => item.marginMinor ?? 0);
  return {
    pendingApprovals: items.filter((item) => item.status === "CLIENT_REVIEW").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
    overdue,
    deliveredPlans: plans,
    averageTurnaroundHours: Number(average.toFixed(2)),
    averageRevisionCount: Number(
      (
        items.reduce((sum, item) => sum + item.revisionCount, 0) / Math.max(items.length, 1)
      ).toFixed(2),
    ),
    marginMinor: margins.reduce((sum, value) => sum + value, 0),
    trackedItems: items.length,
  };
}

export async function updateAgencyWorkItem(
  context: RequestContext,
  itemId: string,
  input: {
    status?: string;
    deadline?: string;
    revisionCount?: number;
    revenueMinor?: number;
    providerSpendMinor?: number;
  },
) {
  requireRole(context, "EDITOR");
  const item = await db.agencyWorkItem.findFirst({
    where: { id: itemId, workspaceId: context.workspaceId },
  });
  if (!item)
    throw new ApiError(404, "AGENCY_ITEM_NOT_FOUND", "The agency queue item was not found.");
  const revenue =
    typeof input.revenueMinor === "number"
      ? Math.max(0, Math.floor(input.revenueMinor))
      : item.revenueMinor;
  const spend =
    typeof input.providerSpendMinor === "number"
      ? Math.max(0, Math.floor(input.providerSpendMinor))
      : item.providerSpendMinor;
  return db.agencyWorkItem.update({
    where: { id: item.id },
    data: {
      status: input.status?.trim() || undefined,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      revisionCount:
        typeof input.revisionCount === "number"
          ? Math.max(0, Math.floor(input.revisionCount))
          : undefined,
      revenueMinor: input.revenueMinor === undefined ? undefined : revenue,
      providerSpendMinor: input.providerSpendMinor === undefined ? undefined : spend,
      marginMinor:
        input.revenueMinor === undefined && input.providerSpendMinor === undefined
          ? undefined
          : revenue === null
            ? null
            : revenue - spend,
    },
  });
}
