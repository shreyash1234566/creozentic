import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError } from "../../../../src/server/api";
import {
  createCreativeRequest,
  listCreativeRequests,
} from "../../../../src/server/daily-autopilot";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listCreativeRequests(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.rawMessage !== "string")
      throw new ApiError(400, "CREATIVE_REQUEST_REQUIRED", "rawMessage is required.");
    const result = await createCreativeRequest(context, {
      rawMessage: body.rawMessage,
      source: typeof body.source === "string" ? body.source : "DASHBOARD",
      brandId: typeof body.brandId === "string" ? body.brandId : undefined,
      channel: typeof body.channel === "string" ? body.channel : undefined,
      requestedDate: typeof body.requestedDate === "string" ? body.requestedDate : undefined,
      consent:
        body.consent && typeof body.consent === "object"
          ? (body.consent as Record<string, unknown>)
          : undefined,
      idempotencyKey: idempotencyKey(request, body.idempotencyKey),
    });
    return NextResponse.json({ data: result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
