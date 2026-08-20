import { NextResponse } from "next/server";
import { jsonError } from "@/server/api";
import { getRequestContext } from "@/server/auth";
import { updateUGCShot } from "@/server/production-services";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; shotId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { projectId, shotId } = await params;
    return NextResponse.json({
      data: await updateUGCShot(await getRequestContext(request), projectId, shotId, {
        script: typeof body.script === "string" ? body.script : undefined,
        startMs: typeof body.startMs === "number" ? body.startMs : undefined,
        endMs: typeof body.endMs === "number" ? body.endMs : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
