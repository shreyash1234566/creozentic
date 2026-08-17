import { trace, type Span } from "@opentelemetry/api";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  redact: ["req.headers.authorization", "apiKey", "accessToken", "secret"],
});

const tracer = trace.getTracer("creozentic");

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: (span: Span) => Promise<T>,
) {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) span.setAttribute(key, value);
    try {
      return await operation(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2 });
      throw error;
    } finally {
      span.end();
    }
  });
}
