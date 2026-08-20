import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../src/server/api";
import { getRequestContext } from "../../../../src/server/auth";
import {
  createTemplateDefinition,
  listTemplateDefinitions,
} from "../../../../src/server/campaigns";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listTemplateDefinitions(await getRequestContext(request)),
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
      typeof body.contentType !== "string" ||
      typeof body.version !== "string"
    )
      throw new ApiError(400, "INVALID_TEMPLATE", "name, contentType, and version are required.");
    return NextResponse.json(
      {
        data: await createTemplateDefinition(await getRequestContext(request), {
          name: body.name,
          contentType: body.contentType,
          version: body.version,
          brandId: typeof body.brandId === "string" ? body.brandId : undefined,
          schema:
            body.schema && typeof body.schema === "object" && !Array.isArray(body.schema)
              ? (body.schema as Record<string, unknown>)
              : {},
          lockedLayers: Array.isArray(body.lockedLayers)
            ? body.lockedLayers.filter((value): value is string => typeof value === "string")
            : [],
          supportedFormats: Array.isArray(body.supportedFormats)
            ? body.supportedFormats.filter((value): value is string => typeof value === "string")
            : [],
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
