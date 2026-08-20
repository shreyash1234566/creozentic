import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { createBackup, listBackups } from "../../../../../src/server/operations";
export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listBackups(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind =
      body.kind === "DATABASE"
        ? "DATABASE"
        : body.kind === "METADATA"
          ? "METADATA"
          : (() => {
              throw new ApiError(400, "INVALID_BACKUP_KIND", "kind must be DATABASE or METADATA.");
            })();
    return NextResponse.json({ data: await createBackup(context, kind) }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
