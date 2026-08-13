import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { jsonError } from "../../../../../../src/server/api";
import { ingestConnectorWebhook } from "../../../../../../src/server/connectors";

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const query = new URL(request.url).searchParams;
  const mode = query.get("hub.mode");
  const token = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");
  const expected =
    process.env[`CONNECTOR_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_VERIFY_TOKEN`];
  if (mode === "subscribe" && token && challenge && expected && safeEqual(token, expected))
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  return new Response("Webhook verification failed.", { status: 403 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    const rawBody = await request.text();
    const result = await ingestConnectorWebhook(
      provider,
      rawBody,
      request.headers.get("x-connector-signature") ?? request.headers.get("x-hub-signature-256"),
      request.headers.get("x-connector-event-id"),
    );
    return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 202 });
  } catch (error) {
    return jsonError(error);
  }
}
