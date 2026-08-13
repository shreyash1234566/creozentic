import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { getRun } from "../../../../../src/server/workflow-service";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    return NextResponse.json({ data: await getRun(context, runId) });
  } catch (error) {
    return jsonError(error);
  }
}
