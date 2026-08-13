import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { idempotencyKey, jsonError, ApiError } from "../../../../../src/server/api";
import { sendConnectorMessage } from "../../../../../src/server/connectors";

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.provider !== "string" ||
      typeof body.externalSubject !== "string" ||
      typeof body.text !== "string"
    )
      throw new ApiError(
        400,
        "INVALID_CONNECTOR_MESSAGE",
        "provider, externalSubject, and text are required.",
      );
    return NextResponse.json(
      {
        data: await sendConnectorMessage(context, {
          provider: body.provider.toLowerCase(),
          externalSubject: body.externalSubject,
          text: body.text,
          templateName: typeof body.templateName === "string" ? body.templateName : undefined,
          templateApproved: body.templateApproved === true,
          customerServiceWindowOpen:
            typeof body.customerServiceWindowOpen === "boolean"
              ? body.customerServiceWindowOpen
              : undefined,
          idempotencyKey: idempotencyKey(request, body.idempotencyKey),
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
