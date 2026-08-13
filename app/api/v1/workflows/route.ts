import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";
import { createWorkflowTemplate } from "../../../../src/server/workflow-catalog";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const templates = await db.workflowTemplate.findMany({
      where: {
        OR: [{ workspaceId: context.workspaceId }, { workspaceId: null, visibility: "PUBLIC" }],
      },
      orderBy: { updatedAt: "desc" },
      include: { versions: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({ data: templates });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createWorkflowTemplate(context, {
      name: typeof body.name === "string" ? body.name : "",
      category: typeof body.category === "string" ? body.category : "",
      graph: body.graph,
      inputSchema: body.inputSchema,
      permissions: body.permissions,
      costFormula: body.costFormula,
      visibility: typeof body.visibility === "string" ? body.visibility : undefined,
      autopilotMetadata:
        body.autopilotMetadata && typeof body.autopilotMetadata === "object"
          ? body.autopilotMetadata
          : undefined,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
