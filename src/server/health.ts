export async function checkQueueReadiness() {
  if (!process.env.REDIS_URL)
    return { configured: false, ready: false, reason: "REDIS_URL is not configured." };
  const RedisModule = await import("ioredis");
  const Redis = RedisModule.default;
  const client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
  });
  try {
    await client.connect();
    await client.ping();
    const info = await client.info("server");
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1] ?? "unknown";
    const major = Number.parseInt(version.split(".")[0], 10);
    const supported = Number.isFinite(major) && major >= 5;
    return {
      configured: true,
      ready: supported,
      version,
      reason: supported ? undefined : "BullMQ requires Redis 5 or newer.",
    };
  } catch (error) {
    return {
      configured: true,
      ready: false,
      reason: error instanceof Error ? error.message : "Redis is unavailable.",
    };
  } finally {
    await client.quit().catch(() => client.disconnect());
  }
}
