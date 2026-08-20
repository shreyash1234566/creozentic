import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../../../src/server/api";
import { renderUGCProject } from "../../../../../../../src/server/production-services";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const sourceAssetIds = Array.isArray(body.sourceAssetIds)
      ? body.sourceAssetIds.filter((value): value is string => typeof value === "string")
      : [];
    if (!sourceAssetIds.length)
      throw new ApiError(400, "UGC_SOURCE_REQUIRED", "sourceAssetIds are required.");
    const captions = Array.isArray(body.captions)
      ? body.captions.filter((value): value is string => typeof value === "string")
      : undefined;
    const bRollAssetIds = Array.isArray(body.bRollAssetIds)
      ? body.bRollAssetIds.filter((value): value is string => typeof value === "string")
      : undefined;
    const outputDurationsSec = Array.isArray(body.outputDurationsSec)
      ? body.outputDurationsSec.filter((value): value is number => typeof value === "number")
      : undefined;
    return NextResponse.json(
      {
        data: await renderUGCProject(context, (await params).projectId, {
          sourceAssetIds,
          captions,
          bRollAssetIds,
          musicAssetId: typeof body.musicAssetId === "string" ? body.musicAssetId : undefined,
          voiceAssetId: typeof body.voiceAssetId === "string" ? body.voiceAssetId : undefined,
          coverShotId: typeof body.coverShotId === "string" ? body.coverShotId : undefined,
          outputDurationsSec,
          consentSubject: typeof body.consentSubject === "string" ? body.consentSubject : undefined,
          syntheticAvatar: body.syntheticAvatar === true,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
