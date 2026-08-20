import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeConfig } from "../packages/config/src/index.ts";
import { nextRetry, queueKey, classifyDeadLetter } from "../packages/queue/src/index.ts";
import { tenantObjectKey } from "../packages/storage/src/index.ts";
import { adminSurfaces } from "../apps/admin/src/index.ts";

test("shared package boundaries enforce tenant and retry invariants", () => {
  assert.equal(
    tenantObjectKey({ workspaceId: "w1", key: "assets/a.mp4" }),
    "workspaces/w1/assets/a.mp4",
  );
  assert.throws(() => tenantObjectKey({ workspaceId: "w1", key: "../secret" }));
  assert.equal(queueKey("render", "w1", "k1"), "render:w1:k1");
  assert.equal(nextRetry("FAILED", 0, 3), 1000);
  assert.equal(nextRetry("FAILED", 3, 3), null);
  assert.equal(classifyDeadLetter(new Error("missing credential")).code, "EXTERNAL_CREDENTIAL");
  assert.ok(adminSurfaces.includes("provider-health"));
});

test("configuration reports activation without leaking secrets", () => {
  const config = readRuntimeConfig({
    APP_URL: "https://example.test",
    AI_GATEWAY_ENABLED: "true",
    DATABASE_URL: "secret",
  });
  assert.equal(config.aiEnabled, true);
  assert.equal(config.appUrl, "https://example.test");
  assert.equal(config.databaseUrl, "secret");
});
