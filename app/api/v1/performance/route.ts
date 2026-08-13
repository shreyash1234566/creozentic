import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";

function date(value: unknown, field: string) {
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_METRIC", `${field} must be an ISO date.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ApiError(400, "INVALID_METRIC", `${field} must be an ISO date.`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    if (new URL(request.url).searchParams.get("export") === "raw")
      return NextResponse.json({
        data: await db.performanceMetric.findMany({
          where: { workspaceId: context.workspaceId },
          orderBy: { periodStart: "desc" },
        }),
      });
    const metrics = await db.performanceMetric.groupBy({
      where: { workspaceId: context.workspaceId },
      by: ["metric"],
      _avg: { value: true },
      _count: { _all: true },
    });
    return NextResponse.json({ data: metrics });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    if (new URL(request.url).searchParams.get("confirm") !== "DELETE_PERFORMANCE")
      throw new ApiError(
        400,
        "PERFORMANCE_DELETE_CONFIRMATION_REQUIRED",
        "Use confirm=DELETE_PERFORMANCE to remove workspace performance data.",
      );
    const result = await db.$transaction(async (tx) => {
      const metrics = await tx.performanceMetric.deleteMany({
        where: { workspaceId: context.workspaceId },
      });
      const recommendations = await tx.performanceRecommendation.deleteMany({
        where: { workspaceId: context.workspaceId },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "performance.data.deleted",
          targetType: "performance_data",
          targetId: context.workspaceId,
          correlationId: context.correlationId,
          metadata: { metrics: metrics.count, recommendations: recommendations.count },
        },
      });
      return { metrics: metrics.count, recommendations: recommendations.count };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const metric = typeof body.metric === "string" ? body.metric.trim() : "";
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const value =
      typeof body.value === "number" && Number.isFinite(body.value) ? body.value : undefined;
    if (!metric || !source || value === undefined)
      throw new ApiError(400, "INVALID_METRIC", "metric, source, and numeric value are required.");
    const periodStart = date(body.periodStart, "periodStart");
    const periodEnd = date(body.periodEnd, "periodEnd");
    if (periodEnd < periodStart)
      throw new ApiError(400, "INVALID_METRIC", "periodEnd must be after periodStart.");
    const outputAssetId = typeof body.outputAssetId === "string" ? body.outputAssetId : undefined;
    const publishJobId = typeof body.publishJobId === "string" ? body.publishJobId : undefined;
    if (
      outputAssetId &&
      !(await db.outputAsset.findFirst({
        where: { id: outputAssetId, workspaceId: context.workspaceId },
        select: { id: true },
      }))
    )
      throw new ApiError(
        404,
        "OUTPUT_NOT_FOUND",
        "The output asset was not found in this workspace.",
      );
    if (
      publishJobId &&
      !(await db.publishJob.findFirst({
        where: { id: publishJobId, workspaceId: context.workspaceId },
        select: { id: true },
      }))
    )
      throw new ApiError(
        404,
        "PUBLISH_JOB_NOT_FOUND",
        "The publish job was not found in this workspace.",
      );
    const sourceEventId = typeof body.sourceEventId === "string" ? body.sourceEventId : undefined;
    const data = {
      workspaceId: context.workspaceId,
      outputAssetId,
      publishJobId,
      metric,
      value,
      periodStart,
      periodEnd,
      source,
      sourceEventId,
      attribution:
        body.attribution && typeof body.attribution === "object"
          ? (body.attribution as Prisma.InputJsonValue)
          : undefined,
      creativeAttributes:
        body.creativeAttributes && typeof body.creativeAttributes === "object"
          ? (body.creativeAttributes as Prisma.InputJsonValue)
          : undefined,
      consent:
        body.consent && typeof body.consent === "object"
          ? (body.consent as Prisma.InputJsonValue)
          : undefined,
      confidence:
        typeof body.confidence === "number" && body.confidence >= 0 && body.confidence <= 1
          ? body.confidence
          : undefined,
    };
    const saved = sourceEventId
      ? await db.performanceMetric.upsert({
          where: {
            workspaceId_source_sourceEventId: {
              workspaceId: context.workspaceId,
              source,
              sourceEventId,
            },
          },
          update: data,
          create: data,
        })
      : await db.performanceMetric.create({ data });
    return NextResponse.json({ data: saved }, { status: sourceEventId ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
