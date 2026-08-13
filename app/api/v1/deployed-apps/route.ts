import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { createDeployedApp, listDeployedApps } from "../../../../src/server/deployed-apps";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await listDeployedApps(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createDeployedApp(context, {
      templateId: typeof body.templateId === "string" ? body.templateId : "",
      versionId: typeof body.versionId === "string" ? body.versionId : "",
      name: typeof body.name === "string" ? body.name : "",
      slug: typeof body.slug === "string" ? body.slug : undefined,
      inputSchema: body.inputSchema,
      approvalPolicy: body.approvalPolicy,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
