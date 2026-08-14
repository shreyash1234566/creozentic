import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { createRevisionRequest } from "../../../../../../src/server/campaign-reliability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.scope !== "string" ||
      typeof body.intent !== "string" ||
      typeof body.parentVersion !== "string"
    ) {
      throw new ApiError(
        400,
        "INVALID_REVISION_REQUEST",
        "scope, intent, and parentVersion are required.",
      );
    }
    const { campaignId } = await params;
    return NextResponse.json(
      {
        data: await createRevisionRequest(await getRequestContext(request), campaignId, {
          scope: body.scope,
          intent: body.intent,
          targetAssetId: typeof body.targetAssetId === "string" ? body.targetAssetId : undefined,
          targetFrame: typeof body.targetFrame === "string" ? body.targetFrame : undefined,
          affectedFields: Array.isArray(body.affectedFields)
            ? body.affectedFields.filter((value): value is string => typeof value === "string")
            : [],
          parentVersion: body.parentVersion,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
