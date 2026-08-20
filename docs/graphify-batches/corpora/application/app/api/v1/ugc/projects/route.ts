import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { createUGCProject } from "../../../../../src/server/production-services";
import { db } from "../../../../../src/server/db";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    return NextResponse.json({
      data: await db.uGCProject.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { updatedAt: "desc" },
        include: { shots: { orderBy: { sequence: "asc" } } },
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.name !== "string" ||
      typeof body.audience !== "string" ||
      typeof body.problem !== "string" ||
      typeof body.proof !== "string" ||
      typeof body.offer !== "string"
    )
      throw new ApiError(
        400,
        "INVALID_UGC_BRIEF",
        "name, audience, problem, proof, and offer are required.",
      );
    const sourceAssetIds = Array.isArray(body.sourceAssetIds)
      ? body.sourceAssetIds.filter((value): value is string => typeof value === "string")
      : [];
    return NextResponse.json(
      {
        data: await createUGCProject(context, {
          name: body.name,
          campaignId: typeof body.campaignId === "string" ? body.campaignId : undefined,
          productId: typeof body.productId === "string" ? body.productId : undefined,
          sourceAssetIds,
          audience: body.audience,
          problem: body.problem,
          proof: body.proof,
          offer: body.offer,
          forbiddenClaims: Array.isArray(body.forbiddenClaims)
            ? body.forbiddenClaims.filter((value): value is string => typeof value === "string")
            : undefined,
          language: typeof body.language === "string" ? body.language : undefined,
          channel: typeof body.channel === "string" ? body.channel : undefined,
          durationSec: typeof body.durationSec === "number" ? body.durationSec : undefined,
          persona: typeof body.persona === "string" ? body.persona : undefined,
          consentSubject: typeof body.consentSubject === "string" ? body.consentSubject : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
