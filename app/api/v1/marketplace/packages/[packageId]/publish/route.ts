import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../src/server/auth";
import { jsonError } from "../../../../../../../src/server/api";
import { publishMarketplacePackage } from "../../../../../../../src/server/phase5";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  try {
    return NextResponse.json({
      data: await publishMarketplacePackage(
        await getRequestContext(request),
        (await params).packageId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
