import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { runRestoreDrill } from "../../../../../../../src/server/operations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ backupId: string }> },
) {
  try {
    const { backupId } = await params;
    return NextResponse.json({
      data: await runRestoreDrill(await getRequestContext(request), backupId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
