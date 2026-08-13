import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { runBenchmarkSuite } from "../../../../../../src/server/benchmarks";

export async function POST(request: Request, { params }: { params: Promise<{ suiteId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await runBenchmarkSuite(
          context,
          (await params).suiteId,
          typeof body.modelRef === "string" ? body.modelRef : undefined,
          body.outputs && typeof body.outputs === "object" && !Array.isArray(body.outputs)
            ? (body.outputs as Record<string, unknown>)
            : undefined,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
