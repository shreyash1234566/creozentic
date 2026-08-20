import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { approvePolicy } from "../../../../../../src/server/benchmarks";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ policyId: string }> },
) {
  try {
    return NextResponse.json({
      data: await approvePolicy(await getRequestContext(request), (await params).policyId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
