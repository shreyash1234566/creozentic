import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { createEditorProject } from "../../../../src/server/editor";
import { editorProjectInput } from "../../../../src/server/editor-contracts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = editorProjectInput.safeParse({
      ...body,
      idempotencyKey: request.headers.get("idempotency-key") ?? body.idempotencyKey,
    });
    if (!parsed.success)
      throw new ApiError(
        400,
        "INVALID_EDITOR_PROJECT",
        "The editor project brief is invalid.",
        parsed.error.flatten(),
      );
    return NextResponse.json(
      { data: await createEditorProject(await getRequestContext(request), parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
