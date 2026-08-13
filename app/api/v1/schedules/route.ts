import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { createSchedule, listSchedules } from "../../../../src/server/schedule";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listSchedules(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createSchedule(context, {
      name: typeof body.name === "string" ? body.name : "",
      cadence: typeof body.cadence === "string" ? body.cadence : "",
      nextRunAt: typeof body.nextRunAt === "string" ? body.nextRunAt : undefined,
      costCeiling: typeof body.costCeiling === "number" ? body.costCeiling : 0,
      payload:
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : {},
      approvalRequired: body.approvalRequired !== false,
      brandId: typeof body.brandId === "string" ? body.brandId : undefined,
      autonomyMode: typeof body.autonomyMode === "string" ? body.autonomyMode : undefined,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
