import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { quoteBrief } from "../../../../src/server/workflow-service";

export async function POST(request: Request) {
  try {
    await getRequestContext(request);
    const result = quoteBrief(await request.json());
    return NextResponse.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
