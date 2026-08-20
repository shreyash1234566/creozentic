import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { listChannelIdentities } from "../../../../src/server/connectors";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listChannelIdentities(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
