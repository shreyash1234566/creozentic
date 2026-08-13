import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../../../src/server/api";
import { reviewMarketplacePackage } from "../../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.rating !== "number")
      throw new ApiError(400, "INVALID_RATING", "rating is required.");
    return NextResponse.json(
      {
        data: await reviewMarketplacePackage(
          await getRequestContext(request),
          (await params).packageId,
          body.rating,
          typeof body.comment === "string" ? body.comment : undefined,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
