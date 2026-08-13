import { ApiError } from "./api";

export type ProviderResponse<T> = {
  status: number;
  body: T;
  requestId?: string;
};

export class ProviderRequestError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly provider: string;
  readonly responseBody?: unknown;

  constructor(input: {
    provider: string;
    message: string;
    status?: number;
    retryable?: boolean;
    responseBody?: unknown;
  }) {
    super(input.message);
    this.name = "ProviderRequestError";
    this.provider = input.provider;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.responseBody = input.responseBody;
  }
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), min), max) : fallback;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(Math.max(Math.round(seconds * 1000), 0), 30_000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), 30_000) : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestProvider<T = Record<string, unknown>>(input: {
  provider: string;
  endpoint: string;
  method?: "GET" | "POST" | "PATCH" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  timeoutMs?: number;
  retries?: number;
  allowStatuses?: number[];
}): Promise<ProviderResponse<T>> {
  const retries = integerEnv("PROVIDER_HTTP_RETRIES", input.retries ?? 2, 0, 5);
  const timeoutMs = integerEnv(
    "PROVIDER_HTTP_TIMEOUT_MS",
    input.timeoutMs ?? 60_000,
    1_000,
    300_000,
  );
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input.endpoint, {
        method: input.method ?? "POST",
        headers: {
          "content-type": "application/json",
          ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
          ...(input.headers ?? {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let body: T;
      try {
        body = (raw ? JSON.parse(raw) : {}) as T;
      } catch {
        body = { raw } as T;
      }
      if (response.ok || input.allowStatuses?.includes(response.status)) {
        return {
          status: response.status,
          body,
          requestId: response.headers.get("x-request-id") ?? undefined,
        };
      }
      const error = new ProviderRequestError({
        provider: input.provider,
        message: `${input.provider} provider returned HTTP ${response.status}.`,
        status: response.status,
        retryable: isRetryableStatus(response.status),
        responseBody: body,
      });
      if (!error.retryable || attempt >= retries) throw error;
      lastError = error;
      await sleep(Math.max(retryAfterMs(response), Math.min(10_000, 250 * 2 ** attempt)));
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ProviderRequestError ? error.retryable : error instanceof Error;
      if (!retryable || attempt >= retries) {
        if (error instanceof ProviderRequestError) throw error;
        throw new ProviderRequestError({
          provider: input.provider,
          message: error instanceof Error ? error.message : `${input.provider} request failed.`,
          retryable: true,
        });
      }
      await sleep(Math.min(10_000, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ProviderRequestError({ provider: input.provider, message: "Provider request failed." });
}

export function providerApiError(error: unknown, code: string, fallback: string) {
  if (error instanceof ProviderRequestError) {
    return new ApiError(502, code, error.message, {
      provider: error.provider,
      status: error.status ?? null,
      retryable: error.retryable,
      responseBody: error.responseBody ?? null,
    });
  }
  return new ApiError(502, code, error instanceof Error ? error.message : fallback);
}
