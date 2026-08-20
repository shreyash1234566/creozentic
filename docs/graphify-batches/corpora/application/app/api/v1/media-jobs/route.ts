import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError, ApiError } from "../../../../src/server/api";
import { createMediaJob, listMediaJobs } from "../../../../src/server/media-jobs";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listMediaJobs(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.kind !== "string")
      throw new ApiError(400, "MEDIA_KIND_REQUIRED", "kind is required.");
    const sourceAssetIds = Array.isArray(body.sourceAssetIds)
      ? body.sourceAssetIds.filter((id): id is string => typeof id === "string")
      : [];
    const config =
      body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {};
    return NextResponse.json(
      {
        data: await createMediaJob(context, {
          kind: body.kind,
          sourceAssetIds,
          runId: typeof body.runId === "string" ? body.runId : undefined,
          config,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
