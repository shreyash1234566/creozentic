import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createBenchmarkSuite, listBenchmarkSuites } from "../../../../src/server/benchmarks";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listBenchmarkSuites(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const cases = Array.isArray(body.cases)
      ? body.cases
          .filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item)),
          )
          .map((item) => ({
            name: typeof item.name === "string" ? item.name : "case",
            input: item.input,
            expected: item.expected,
            weight: typeof item.weight === "number" ? item.weight : undefined,
          }))
      : [];
    if (typeof body.name !== "string" || typeof body.slug !== "string")
      throw new ApiError(400, "INVALID_BENCHMARK_SUITE", "name and slug are required.");
    return NextResponse.json(
      {
        data: await createBenchmarkSuite(context, {
          name: body.name,
          slug: body.slug,
          groundTruth:
            body.groundTruth && typeof body.groundTruth === "object"
              ? (body.groundTruth as Record<string, unknown>)
              : undefined,
          cases,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
