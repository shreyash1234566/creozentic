import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { installMarketplacePackage } from "../../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await installMarketplacePackage(
          await getRequestContext(request),
          (await params).packageId,
          typeof body.alias === "string" ? body.alias : undefined,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
