import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import { createLaunchEvidence, listLaunchEvidence } from "../../../../src/server/operations";
export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listLaunchEvidence(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.kind !== "string" ||
      typeof body.title !== "string" ||
      !body.payload ||
      typeof body.payload !== "object" ||
      Array.isArray(body.payload)
    )
      throw new ApiError(400, "INVALID_LAUNCH_EVIDENCE", "kind, title, and payload are required.");
    return NextResponse.json(
      {
        data: await createLaunchEvidence(context, {
          kind: body.kind,
          title: body.title,
          payload: body.payload as Record<string, unknown>,
          observedBy: typeof body.observedBy === "string" ? body.observedBy : undefined,
          status: typeof body.status === "string" ? body.status : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
