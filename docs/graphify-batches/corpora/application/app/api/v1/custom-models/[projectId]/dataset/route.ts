import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../../src/server/api";
import { createCustomModelDataset } from "../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const assetIds = Array.isArray(body.assetIds)
      ? body.assetIds.filter((value): value is string => typeof value === "string")
      : [];
    if (
      !assetIds.length ||
      !body.consent ||
      typeof body.consent !== "object" ||
      Array.isArray(body.consent)
    )
      throw new ApiError(400, "INVALID_MODEL_DATASET", "assetIds and consent are required.");
    return NextResponse.json(
      {
        data: await createCustomModelDataset(
          await getRequestContext(request),
          (await params).projectId,
          { assetIds, consent: body.consent as Record<string, unknown> },
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
