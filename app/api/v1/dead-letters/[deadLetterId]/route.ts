import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { getRequestContext } from "../../../../../src/server/auth";
import { resolveDeadLetter } from "../../../../../src/server/dead-letter";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deadLetterId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const status = body.status === "REPLAYED" || body.status === "DISMISSED" ? body.status : null;
    if (!status)
      throw new ApiError(
        400,
        "INVALID_DEAD_LETTER_STATUS",
        "status must be REPLAYED or DISMISSED.",
      );
    const { deadLetterId } = await params;
    return NextResponse.json({
      data: await resolveDeadLetter(await getRequestContext(request), deadLetterId, status),
    });
  } catch (error) {
    return jsonError(error);
  }
}
