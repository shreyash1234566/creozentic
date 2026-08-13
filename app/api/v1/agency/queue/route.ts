import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { listAgencyQueue } from "../../../../../src/server/agency-operations";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json({
      data: await listAgencyQueue(await getRequestContext(request), {
        status: url.searchParams.get("status") ?? undefined,
        brandId: url.searchParams.get("brandId") ?? undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
