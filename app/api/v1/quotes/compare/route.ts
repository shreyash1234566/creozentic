import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { quoteBrief } from "../../../../../src/server/workflow-service";

export async function POST(request: Request) {
  try {
    await getRequestContext(request);
    const body = await request.json();
    const comparisons = ["fast", "balanced", "quality"].map((qualityMode) => {
      try {
        return {
          qualityMode,
          ...quoteBrief({ ...(body as Record<string, unknown>), qualityMode }),
        };
      } catch (error) {
        return {
          qualityMode,
          error:
            error instanceof Error ? error.message : "This quality mode cannot quote the brief.",
        };
      }
    });
    return NextResponse.json({ data: comparisons });
  } catch (error) {
    return jsonError(error);
  }
}
