import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { verifyChannelIdentity } from "../../../../../src/server/connectors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ identityId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { identityId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const status =
      body.status === "VERIFIED" || body.status === "REVOKED" ? body.status : undefined;
    if (!status)
      throw new ApiError(400, "INVALID_CHANNEL_STATUS", "status must be VERIFIED or REVOKED.");
    return NextResponse.json({
      data: await verifyChannelIdentity(context, identityId, {
        status,
        userId: typeof body.userId === "string" ? body.userId : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
