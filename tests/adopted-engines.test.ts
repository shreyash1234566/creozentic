import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_ENGINE_MANIFEST,
  getCoreEngineStatus,
} from "../packages/video/src/adopted-engines.ts";

test("selected core projects have traceable roles and provenance", () => {
  const ids = CORE_ENGINE_MANIFEST.map((engine) => engine.id);
  for (const id of [
    "openshorts",
    "ave",
    "pixeltable",
    "vimax",
    "videoagent",
    "videodb-director",
    "remotion",
    "comfyui",
    "temporal",
    "openchatcut",
    "openmontage",
    "twick",
  ]) {
    assert.ok(ids.includes(id as (typeof ids)[number]), `${id} missing from core manifest`);
  }
  for (const engine of CORE_ENGINE_MANIFEST) {
    assert.ok(engine.repository.startsWith("https://github.com/"));
    assert.ok(engine.license.length > 0);
    assert.ok(engine.role.length > 0);
    assert.ok(engine.entrypoint.length > 0);
    assert.ok(engine.enabledBy.endsWith("_ENABLED"));
  }
});

test("core engines are disabled by default without runtime activation", async () => {
  const statuses = await getCoreEngineStatus();
  assert.equal(statuses.length, CORE_ENGINE_MANIFEST.length);
  for (const engine of statuses) assert.equal(engine.enabled, false);
});
