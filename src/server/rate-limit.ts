import Redis from "ioredis";
import { ApiError } from "./api";

const memory = new Map<string, { count: number; resetAt: number }>();
let redis: Redis | null | undefined;

function client() {
  if (redis !== undefined) return redis;
  if (!process.env.REDIS_URL) {
    redis = null;
    return redis;
  }
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 750,
    retryStrategy: () => null,
  });
  // ioredis emits connection failures even when the promise is caught. Keep the
  // configured-but-unavailable path quiet and let the local limiter take over.
  redis.on("error", () => undefined);
  void redis.connect().catch(() => undefined);
  return redis;
}

export async function enforceRateLimit(key: string, limit = 120, windowSeconds = 60) {
  const now = Date.now();
  const r = client();
  let count = 0;
  let resetAt = now + windowSeconds * 1000;
  if (r) {
    try {
      const redisKey = `ratelimit:${key}`;
      const pipeline = r.multi().incr(redisKey).ttl(redisKey);
      const result = await pipeline.exec();
      count = Number(result?.[0]?.[1] ?? 0);
      const ttl = Number(result?.[1]?.[1] ?? -1);
      if (ttl < 0) await r.expire(redisKey, windowSeconds);
      else resetAt = now + ttl * 1000;
    } catch {
      // The local process limiter still protects the request if Redis is briefly unavailable.
    }
  }
  if (!count) {
    const current = memory.get(key);
    if (!current || current.resetAt <= now) {
      count = 1;
      resetAt = now + windowSeconds * 1000;
    } else {
      current.count += 1;
      count = current.count;
      resetAt = current.resetAt;
    }
    memory.set(key, { count, resetAt });
  }
  if (count > limit)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Retry after the rate-limit window.",
      { limit, resetAt: new Date(resetAt).toISOString() },
    );
  return { limit, remaining: Math.max(0, limit - count), resetAt };
}
