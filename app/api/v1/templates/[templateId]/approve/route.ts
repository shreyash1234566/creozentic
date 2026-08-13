import { NextResponse } from "next/server";
import { jsonError } from "../../../../../../src/server/api";
import { getRequestContext } from "../../../../../../src/server/auth";
import { approveTemplateDefinition } from "../../../../../../src/server/campaigns";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await params;
    return NextResponse.json({
      data: await approveTemplateDefinition(await getRequestContext(request), templateId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
