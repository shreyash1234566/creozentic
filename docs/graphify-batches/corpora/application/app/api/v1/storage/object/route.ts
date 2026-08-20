import { NextResponse } from "next/server";
import { jsonError } from "../../../../../src/server/api";
import {
  readLocalObject,
  verifyLocalObjectSignature,
  writeLocalObject,
} from "../../../../../src/server/storage";

function input(request: Request) {
  const url = new URL(request.url);
  return {
    key: url.searchParams.get("key") ?? "",
    expires: url.searchParams.get("expires") ?? "",
    token: url.searchParams.get("token") ?? "",
  };
}

export async function PUT(request: Request) {
  try {
    const { key, expires, token } = input(request);
    if (!verifyLocalObjectSignature(key, expires, token))
      return NextResponse.json(
        { error: { code: "SIGNED_URL_INVALID", message: "The upload URL is invalid or expired." } },
        { status: 403 },
      );
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > 500 * 1024 * 1024)
      return NextResponse.json(
        { error: { code: "UPLOAD_TOO_LARGE", message: "Assets must be 500 MB or smaller." } },
        { status: 413 },
      );
    await writeLocalObject(key, body, request.headers.get("content-type") ?? undefined);
    return NextResponse.json({ data: { uploaded: true, byteSize: body.byteLength } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { key, expires, token } = input(request);
    if (!verifyLocalObjectSignature(key, expires, token))
      return NextResponse.json(
        {
          error: { code: "SIGNED_URL_INVALID", message: "The download URL is invalid or expired." },
        },
        { status: 403 },
      );
    const object = await readLocalObject(key);
    return new Response(object.body, {
      status: 200,
      headers: {
        "content-type": object.mimeType ?? "application/octet-stream",
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
