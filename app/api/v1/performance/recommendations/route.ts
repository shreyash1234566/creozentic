import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import {
  assessCreativeFatigue,
  listPerformanceRecommendations,
  refreshPerformanceRecommendations,
} from "../../../../../src/server/performance-recommendations";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listPerformanceRecommendations(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.operation === "fatigue")
      return NextResponse.json({ data: await assessCreativeFatigue(context) });
    return NextResponse.json({
      data: await refreshPerformanceRecommendations(context),
    });
  } catch (error) {
    return jsonError(error);
  }
}
