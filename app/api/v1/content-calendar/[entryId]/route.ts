import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { updateCalendarEntry } from "../../../../../src/server/content-calendar";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({
      data: await updateCalendarEntry(await getRequestContext(request), (await params).entryId, {
        contentType: typeof body.contentType === "string" ? body.contentType : undefined,
        pillar: typeof body.pillar === "string" ? body.pillar : undefined,
        objective: typeof body.objective === "string" ? body.objective : undefined,
        channel: typeof body.channel === "string" ? body.channel : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        locked: typeof body.locked === "boolean" ? body.locked : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
