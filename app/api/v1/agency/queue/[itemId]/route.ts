import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { updateAgencyWorkItem } from "../../../../../../src/server/agency-operations";

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({
      data: await updateAgencyWorkItem(await getRequestContext(request), (await params).itemId, {
        status: typeof body.status === "string" ? body.status : undefined,
        deadline: typeof body.deadline === "string" ? body.deadline : undefined,
        revisionCount: typeof body.revisionCount === "number" ? body.revisionCount : undefined,
        revenueMinor: typeof body.revenueMinor === "number" ? body.revenueMinor : undefined,
        providerSpendMinor:
          typeof body.providerSpendMinor === "number" ? body.providerSpendMinor : undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
