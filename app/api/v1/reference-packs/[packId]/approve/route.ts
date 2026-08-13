import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { approveReferencePack } from "../../../../../../src/server/consistency";

export async function POST(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { packId } = await params;
    return NextResponse.json({ data: await approveReferencePack(context, packId) });
  } catch (error) {
    return jsonError(error);
  }
}
