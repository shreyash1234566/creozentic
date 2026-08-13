import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { analyzeUGCProject } from "../../../../../../../src/server/production-services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({
      data: await analyzeUGCProject(await getRequestContext(request), (await params).projectId, {
        sourceAssetIds: Array.isArray(body.sourceAssetIds)
          ? body.sourceAssetIds.filter((item): item is string => typeof item === "string")
          : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
