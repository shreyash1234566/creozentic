import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../../src/server/api";
import {
  analyzeEditorProject,
  getEditorProject,
  mutateEditorProject,
  generateEditorVisualInserts,
  planEditorProject,
} from "../../../../../../src/server/editor";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; segments?: string[] }> },
) {
  try {
    const { projectId, segments = [] } = await params;
    const context = await getRequestContext(request);
    const project = await getEditorProject(context, projectId);
    if (segments[0] === "evidence") return NextResponse.json({ data: project.evidence });
    if (segments[0] === "iterations") return NextResponse.json({ data: project.iterations });
    if (segments[0] === "plan") {
      const version = Number(segments[1] ?? project.activePlanVersion);
      const plan = project.plans.find((item) => item.version === version);
      if (!plan) throw new ApiError(404, "EDITOR_PLAN_NOT_FOUND", "Edit plan version not found.");
      return NextResponse.json({ data: plan });
    }
    if (segments[0] === "render") {
      const renderId = segments[1];
      const render = renderId
        ? project.renders.find((item) => item.id === renderId)
        : project.renders[0];
      if (!render) throw new ApiError(404, "EDITOR_RENDER_NOT_FOUND", "Render not found.");
      return NextResponse.json({ data: render });
    }
    return NextResponse.json({ data: project });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; segments?: string[] }> },
) {
  try {
    const { projectId, segments = [] } = await params;
    const context = await getRequestContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = segments.join("/");
    if (action === "analyze")
      return NextResponse.json({ data: await analyzeEditorProject(context, projectId, body) });
    if (action === "plan")
      return NextResponse.json({ data: await planEditorProject(context, projectId) });
    if (action === "visuals/generate")
      return NextResponse.json({ data: await generateEditorVisualInserts(context, projectId, body) });
    return NextResponse.json({ data: await mutateEditorProject(context, projectId, action, body) });
  } catch (error) {
    return jsonError(error);
  }
}
