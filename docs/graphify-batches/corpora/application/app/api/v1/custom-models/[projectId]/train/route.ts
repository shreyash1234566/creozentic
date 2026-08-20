import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../../../src/server/api";
import {
  getCustomModelTrainingJobs,
  trainCustomModel,
} from "../../../../../../src/server/production-services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    return NextResponse.json({
      data: await getCustomModelTrainingJobs(
        await getRequestContext(request),
        (await params).projectId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.datasetId !== "string")
      throw new ApiError(400, "DATASET_ID_REQUIRED", "datasetId is required.");
    return NextResponse.json(
      {
        data: await trainCustomModel(context, (await params).projectId, {
          datasetId: body.datasetId,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
