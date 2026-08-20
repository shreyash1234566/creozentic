import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createPolicy, listPolicies } from "../../../../src/server/benchmarks";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listPolicies(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.kind !== "string" ||
      !body.content ||
      typeof body.content !== "object" ||
      Array.isArray(body.content)
    )
      throw new ApiError(400, "INVALID_POLICY", "kind and content are required.");
    return NextResponse.json(
      {
        data: await createPolicy(context, {
          kind: body.kind,
          content: body.content as Record<string, unknown>,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
