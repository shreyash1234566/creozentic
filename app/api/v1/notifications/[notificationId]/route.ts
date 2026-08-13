import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { markNotificationRead } from "../../../../../src/server/notifications";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  try {
    const { notificationId } = await params;
    return NextResponse.json({
      data: await markNotificationRead(await getRequestContext(request), notificationId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
