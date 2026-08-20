import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { listDeadLetters } from "../../../../src/server/dead-letter";

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return NextResponse.json({
      data: await listDeadLetters(await getRequestContext(request), status),
    });
  } catch (error) {
    return jsonError(error);
  }
}
