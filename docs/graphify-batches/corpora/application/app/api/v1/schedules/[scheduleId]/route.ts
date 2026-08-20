import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { updateSchedule } from "../../../../../src/server/schedule";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { scheduleId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json({
      data: await updateSchedule(context, scheduleId, {
        status: typeof body.status === "string" ? body.status : undefined,
        costCeiling: typeof body.costCeiling === "number" ? body.costCeiling : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
