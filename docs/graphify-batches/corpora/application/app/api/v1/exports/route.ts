import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../src/server/api";
import { createExportManifest } from "../../../../src/server/export-service";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as { runId?: string; idempotencyKey?: string };
    if (!body.runId)
      return NextResponse.json(
        { error: { code: "RUN_REQUIRED", message: "runId is required." } },
        { status: 400 },
      );
    return NextResponse.json(
      {
        data: await createExportManifest(
          context,
          body.runId,
          idempotencyKey(request, body.idempotencyKey),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
