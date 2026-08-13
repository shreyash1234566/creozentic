import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../src/server/api";
import { publishApprovedOutput } from "../../../../src/server/publish-service";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "PUBLISHER");
    const body = (await request.json()) as Record<string, unknown>;
    const confirmation =
      body.confirmation && typeof body.confirmation === "object"
        ? (body.confirmation as Record<string, unknown>)
        : {};
    return NextResponse.json(
      {
        data: await publishApprovedOutput(context, {
          outputAssetId: String(body.outputAssetId ?? ""),
          connectionId: String(body.connectionId ?? ""),
          platform: String(body.platform ?? ""),
          confirmation,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
