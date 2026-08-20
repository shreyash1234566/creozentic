import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { cancelCustomModelTraining } from "../../../../../../../src/server/production-services";
import { getCustomModelTrainingJob } from "../../../../../../../src/server/production-services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  try {
    const values = await params;
    return NextResponse.json({
      data: await getCustomModelTrainingJob(
        await getRequestContext(request),
        values.projectId,
        values.jobId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    return NextResponse.json({
      data: await cancelCustomModelTraining(await getRequestContext(request), (await params).jobId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
