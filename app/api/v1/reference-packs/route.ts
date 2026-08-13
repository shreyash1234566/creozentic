import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createReferencePack, listReferencePacks } from "../../../../src/server/consistency";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listReferencePacks(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const referenceAssetIds = Array.isArray(body.referenceAssetIds)
      ? body.referenceAssetIds.filter((id): id is string => typeof id === "string")
      : [];
    if (typeof body.name !== "string")
      throw new ApiError(400, "REFERENCE_PACK_NAME_REQUIRED", "name is required.");
    return NextResponse.json(
      {
        data: await createReferencePack(context, {
          name: body.name,
          productId: typeof body.productId === "string" ? body.productId : undefined,
          mode: body.mode === "CREATIVE" ? "CREATIVE" : "PRODUCT_LOCK",
          seed: typeof body.seed === "string" ? body.seed : undefined,
          referenceAssetIds,
          identityRules: body.identityRules,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
