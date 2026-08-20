for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // CI and deployed environments supply secrets directly.
  }
}

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const workspaceId =
  process.env.SMOKE_WORKSPACE_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_ID ??
  "workspace-autozentic-demo";
const userId =
  process.env.SMOKE_USER_ID ?? process.env.NEXT_PUBLIC_USER_ID ?? "user-autozentic-owner";
const generatedToken = process.env.SMOKE_AUTH_TOKEN
  ? undefined
  : (await import("../src/server/auth")).createSessionToken({ userId, workspaceId });

async function check(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-workspace-id": workspaceId,
      "x-user-id": userId,
      ...(process.env.SMOKE_AUTH_TOKEN || generatedToken
        ? { authorization: `Bearer ${process.env.SMOKE_AUTH_TOKEN ?? generatedToken}` }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  return body;
}

await check("/api/v1/health/ready");
await check("/api/v1/usage");
await check("/api/v1/capabilities");
await check("/api/v1/workflows");
await check("/api/v1/consistency-checks");
await check("/api/v1/daily-plans");
await check("/api/v1/content-calendar");
await check("/api/v1/agency/queue");
await check("/api/v1/agency/metrics");
await check("/api/v1/ops/backups");
await check("/api/v1/notifications");
await check("/api/v1/dead-letters");
await check("/api/v1/campaigns");
await check("/api/v1/templates");
await check("/api/v1/ugc/projects");
const unauthenticated = await fetch(`${baseUrl}/api/v1/usage`);
if (unauthenticated.status !== 401)
  throw new Error(
    `Unauthenticated production usage request returned ${unauthenticated.status}, expected 401.`,
  );
console.log(`Production smoke passed against ${baseUrl}`);
