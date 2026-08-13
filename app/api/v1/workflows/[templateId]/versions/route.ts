import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError } from "../../../../../../src/server/api";
import { createWorkflowVersion } from "../../../../../../src/server/workflow-catalog";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { templateId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createWorkflowVersion(context, templateId, {
      version: typeof body.version === "string" ? body.version : "",
      graph: body.graph,
      inputSchema: body.inputSchema,
      permissions: body.permissions,
      costFormula: body.costFormula,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
