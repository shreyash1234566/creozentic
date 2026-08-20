import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { idempotencyKey, jsonError, ApiError } from "../../../../../src/server/api";
import { createDriveSync, listDriveSyncJobs } from "../../../../../src/server/drive";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listDriveSyncJobs(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const direction =
      body.direction === "PULL" || body.direction === "PUSH" ? body.direction : undefined;
    if (!direction)
      throw new ApiError(400, "INVALID_DRIVE_DIRECTION", "direction must be PULL or PUSH.");
    const outputAssetIds = Array.isArray(body.outputAssetIds)
      ? body.outputAssetIds.filter((id): id is string => typeof id === "string")
      : undefined;
    return NextResponse.json(
      {
        data: await createDriveSync(context, {
          provider: typeof body.provider === "string" ? body.provider : "google-drive",
          direction,
          inputFolderId: typeof body.inputFolderId === "string" ? body.inputFolderId : undefined,
          outputFolderId: typeof body.outputFolderId === "string" ? body.outputFolderId : undefined,
          outputAssetIds,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
