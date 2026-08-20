import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}

export function requestId(request: Request) {
  return request.headers.get("x-correlation-id") ?? crypto.randomUUID();
}

export function idempotencyKey(request: Request, bodyKey?: unknown) {
  const headerKey = request.headers.get("idempotency-key");
  if (headerKey) return headerKey;
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim();
  return crypto.randomUUID();
}
