import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError } from "../../../../../src/server/api";
import { agencyMetrics } from "../../../../../src/server/agency-operations";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await agencyMetrics(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
