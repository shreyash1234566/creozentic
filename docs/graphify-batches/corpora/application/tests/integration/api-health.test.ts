import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.INTEGRATION_BASE_URL;

test("health readiness exposes a usable integration target", async (t) => {
  if (!baseUrl) return t.skip("set INTEGRATION_BASE_URL to run against the integration stack");
  const response = await fetch(new URL("/api/v1/health/ready", baseUrl));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status?: string };
  assert.equal(body.status, "ok");
});
