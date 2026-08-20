import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../src/server/api";
import {
  createMarketplacePackage,
  listMarketplacePackages,
} from "../../../../../src/server/phase5";
function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listMarketplacePackages(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.workflowVersionId !== "string" ||
      typeof body.name !== "string" ||
      typeof body.description !== "string" ||
      typeof body.visibility !== "string"
    )
      throw new ApiError(
        400,
        "INVALID_PACKAGE",
        "workflowVersionId, name, description, and visibility are required.",
      );
    return NextResponse.json(
      {
        data: await createMarketplacePackage(context, {
          workflowVersionId: body.workflowVersionId,
          name: body.name,
          description: body.description,
          visibility: body.visibility,
          manifest: asObject(body.manifest),
          documentation: asObject(body.documentation),
          costEstimate: asObject(body.costEstimate),
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
