import { NextResponse } from "next/server";
import { idempotencyKey, jsonError } from "../../../../../../../src/server/api";
import { runDeployedApp } from "../../../../../../../src/server/deployed-apps";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await runDeployedApp(request, slug, {
          brief: body.brief ?? body,
          title: typeof body.title === "string" ? body.title : undefined,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
