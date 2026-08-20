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

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()))
    throw new ApiError(400, "INVALID_DATE", "A valid ISO date is required.");
  return date;
}

function weekDays(weekStart: Date) {
  return Array.from(
    { length: 7 },
    (_, index) => new Date(weekStart.getTime() + index * 86_400_000),
  );
}

function pillars(profile: unknown) {
  const values = object(profile).contentPillars;
  const list = Array.isArray(values)
    ? values.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  return list.length ? list : ["education", "proof", "community", "offer", "behind the scenes"];
}

export async function listCalendar(
  context: RequestContext,
  input: { weekStart?: string; brandId?: string },
) {
  requireRole(context, "VIEWER");
  const weekStart = startOfDay(input.weekStart ?? new Date().toISOString().slice(0, 10));
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  return db.contentCalendarEntry.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(input.brandId ? { brandId: input.brandId } : {}),
      entryDate: { gte: weekStart, lt: weekEnd },
    },
    include: {
      brand: { select: { id: true, name: true, version: true } },
      dailyPlan: { select: { id: true, status: true } },
    },
    orderBy: [{ entryDate: "asc" }, { contentType: "asc" }],
  });
}

export async function generateCalendar(
  context: RequestContext,
  input: { weekStart?: string; brandId?: string; contentTypes?: string[]; channel?: string },
) {
  requireRole(context, "EDITOR");
  const brand = input.brandId
    ? await db.brand.findFirst({ where: { id: input.brandId, workspaceId: context.workspaceId } })
    : await db.brand.findFirst({
        where: { workspaceId: context.workspaceId },
        orderBy: { updatedAt: "desc" },
      });
  if (input.brandId && !brand)
    throw new ApiError(404, "BRAND_NOT_FOUND", "The brand was not found in this workspace.");
  const weekStart = startOfDay(input.weekStart ?? new Date().toISOString().slice(0, 10));
  const selected = [
    ...new Set(
      (input.contentTypes ?? ["organic_poster", "promotional_ad"])
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const selectedPillars = pillars(brand?.profile);
  const channel = text(input.channel, "dashboard");
  const entries = [];
  for (const [dayIndex, date] of weekDays(weekStart).entries()) {
    for (const [typeIndex, contentType] of selected.entries()) {
      const pillar = selectedPillars[(dayIndex + typeIndex) % selectedPillars.length];
      const existing = await db.contentCalendarEntry.findUnique({
        where: {
          workspaceId_entryDate_contentType: {
            workspaceId: context.workspaceId,
            entryDate: date,
            contentType,
          },
        },
      });
      if (existing?.locked) {
        entries.push(existing);
        continue;
      }
      entries.push(
        await db.contentCalendarEntry.upsert({
          where: {
            workspaceId_entryDate_contentType: {
              workspaceId: context.workspaceId,
              entryDate: date,
              contentType,
            },
          },
          update: {
            brandId: brand?.id,
            pillar,
            channel,
            objective:
              contentType === "promotional_ad"
                ? "Convert qualified product interest"
                : "Build daily brand presence",
            status: "PLANNED",
            source: "AUTOPILOT",
          },
          create: {
            workspaceId: context.workspaceId,
            brandId: brand?.id,
            entryDate: date,
            contentType,
            pillar,
            channel,
            objective:
              contentType === "promotional_ad"
                ? "Convert qualified product interest"
                : "Build daily brand presence",
            status: "PLANNED",
            source: "AUTOPILOT",
            createdBy: context.userId,
            metadata: json({
              generated: true,
              pillarIndex: (dayIndex + typeIndex) % selectedPillars.length,
            }),
          },
        }),
      );
    }
  }
  return { weekStart: weekStart.toISOString(), entries };
}

export async function updateCalendarEntry(
  context: RequestContext,
  entryId: string,
  input: {
    contentType?: string;
    pillar?: string;
    objective?: string;
    channel?: string;
    status?: string;
    locked?: boolean;
  },
) {
  requireRole(context, "EDITOR");
  const existing = await db.contentCalendarEntry.findFirst({
    where: { id: entryId, workspaceId: context.workspaceId },
  });
  if (!existing)
    throw new ApiError(404, "CALENDAR_ENTRY_NOT_FOUND", "The calendar entry was not found.");
  if (existing.locked && context.role !== "ADMIN" && context.role !== "OWNER")
    throw new ApiError(
      409,
      "CALENDAR_ENTRY_LOCKED",
      "Unlock the calendar entry before editing it.",
    );
  return db.contentCalendarEntry.update({
    where: { id: existing.id },
    data: {
      contentType: input.contentType?.trim() || undefined,
      pillar: input.pillar?.trim() || undefined,
      objective: input.objective?.trim() || undefined,
      channel: input.channel?.trim() || undefined,
      status: input.status?.trim() || undefined,
      locked: typeof input.locked === "boolean" ? input.locked : undefined,
    },
  });
}

export async function linkCalendarEntryToPlan(
  context: RequestContext,
  input: { brandId?: string; planDate: Date; contentType?: string; dailyPlanId: string },
) {
  const contentType = input.contentType ?? "daily_plan";
  return db.contentCalendarEntry.upsert({
    where: {
      workspaceId_entryDate_contentType: {
        workspaceId: context.workspaceId,
        entryDate: input.planDate,
        contentType,
      },
    },
    update: { dailyPlanId: input.dailyPlanId, status: "IN_PRODUCTION" },
    create: {
      workspaceId: context.workspaceId,
      brandId: input.brandId,
      dailyPlanId: input.dailyPlanId,
      entryDate: input.planDate,
      contentType,
      pillar: "autopilot",
      objective: "Daily creative delivery",
      channel: "dashboard",
      status: "IN_PRODUCTION",
      source: "AUTOPILOT",
      createdBy: context.userId,
    },
  });
}
