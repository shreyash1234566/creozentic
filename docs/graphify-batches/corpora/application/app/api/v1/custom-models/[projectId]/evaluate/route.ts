import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../../src/server/api";
import { evaluateCustomModel } from "../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.modelVersion !== "string" ||
      typeof body.baselineScore !== "number" ||
      typeof body.modelScore !== "number" ||
      typeof body.unitCostMinor !== "number"
    )
      throw new ApiError(
        400,
        "INVALID_MODEL_EVALUATION",
        "modelVersion, scores, and unitCostMinor are required.",
      );
    return NextResponse.json(
      {
        data: await evaluateCustomModel(
          await getRequestContext(request),
          (await params).projectId,
          {
            modelVersion: body.modelVersion,
            baselineScore: body.baselineScore,
            modelScore: body.modelScore,
            unitCostMinor: body.unitCostMinor,
            datasetId: typeof body.datasetId === "string" ? body.datasetId : undefined,
            maxCostMinor: typeof body.maxCostMinor === "number" ? body.maxCostMinor : undefined,
            metrics:
              body.metrics && typeof body.metrics === "object" && !Array.isArray(body.metrics)
                ? (body.metrics as Record<string, unknown>)
                : {},
          },
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
