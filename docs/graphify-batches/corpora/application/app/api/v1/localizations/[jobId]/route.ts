import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { getLocalizationJob } from "../../../../../src/server/localization";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { jobId } = await params;
    return NextResponse.json({ data: await getLocalizationJob(context, jobId) });
  } catch (error) {
    return jsonError(error);
  }
}
