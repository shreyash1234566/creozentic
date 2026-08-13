import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { verifyBackup } from "../../../../../../../src/server/operations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ backupId: string }> },
) {
  try {
    return NextResponse.json({
      data: await verifyBackup(await getRequestContext(request), (await params).backupId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
