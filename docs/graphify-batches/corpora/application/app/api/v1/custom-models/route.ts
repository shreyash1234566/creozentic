import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createCustomModelProject, listCustomModelProjects } from "../../../../src/server/phase5";
export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listCustomModelProjects(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.name !== "string" ||
      typeof body.purpose !== "string" ||
      typeof body.provider !== "string" ||
      !body.rightsEvidence ||
      typeof body.rightsEvidence !== "object" ||
      Array.isArray(body.rightsEvidence)
    )
      throw new ApiError(
        400,
        "INVALID_MODEL_PROJECT",
        "name, purpose, provider, and rightsEvidence are required.",
      );
    return NextResponse.json(
      {
        data: await createCustomModelProject(await getRequestContext(request), {
          name: body.name,
          purpose: body.purpose,
          provider: body.provider,
          rightsEvidence: body.rightsEvidence as Record<string, unknown>,
          baselineSuiteId:
            typeof body.baselineSuiteId === "string" ? body.baselineSuiteId : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
