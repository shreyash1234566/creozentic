import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";

function date(value: unknown, field: string) {
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_OBSERVATION", `${field} must be an ISO date.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ApiError(400, "INVALID_OBSERVATION", `${field} must be an ISO date.`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    return NextResponse.json({
      data: await db.performanceObservation.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.metric !== "string" ||
      typeof body.value !== "number" ||
      typeof body.source !== "string"
    )
      throw new ApiError(
        400,
        "INVALID_OBSERVATION",
        "metric, numeric value, and source are required.",
      );
    const start = date(body.windowStart, "windowStart");
    const end = date(body.windowEnd, "windowEnd");
    if (end < start)
      throw new ApiError(400, "INVALID_OBSERVATION", "windowEnd must be after windowStart.");
    const observation = await db.performanceObservation.create({
      data: {
        workspaceId: context.workspaceId,
        postId: typeof body.postId === "string" ? body.postId : undefined,
        publishJobId: typeof body.publishJobId === "string" ? body.publishJobId : undefined,
        outputAssetId: typeof body.outputAssetId === "string" ? body.outputAssetId : undefined,
        metric: body.metric,
        value: body.value,
        windowStart: start,
        windowEnd: end,
        creativeAttributes:
          body.creativeAttributes && typeof body.creativeAttributes === "object"
            ? (body.creativeAttributes as Prisma.InputJsonValue)
            : {},
        consent:
          body.consent && typeof body.consent === "object"
            ? (body.consent as Prisma.InputJsonValue)
            : { recorded: false },
        source: body.source,
        confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      },
    });
    return NextResponse.json({ data: observation }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
