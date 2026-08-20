import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createCompetitorSource, listCompetitorSources } from "../../../../src/server/phase5";
export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listCompetitorSources(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.url !== "string")
      throw new ApiError(400, "INVALID_SOURCE_URL", "url is required.");
    return NextResponse.json(
      {
        data: await createCompetitorSource(context, {
          url: body.url,
          sourceType: typeof body.sourceType === "string" ? body.sourceType : undefined,
          terms: typeof body.terms === "string" ? body.terms : undefined,
          consent:
            body.consent && typeof body.consent === "object" && !Array.isArray(body.consent)
              ? (body.consent as Record<string, unknown>)
              : {},
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
