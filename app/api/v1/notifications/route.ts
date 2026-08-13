import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { listNotifications } from "../../../../src/server/notifications";

export async function GET(request: Request) {
  try {
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
    return NextResponse.json({
      data: await listNotifications(await getRequestContext(request), unreadOnly),
    });
  } catch (error) {
    return jsonError(error);
  }
}
