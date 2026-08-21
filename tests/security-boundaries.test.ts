import assert from "node:assert/strict";
import test from "node:test";
import { assertTrustedMediaPath, assertTrustedOutputPath } from "../src/server/editor-paths.ts";

test("production media paths stay inside the configured root", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRoots = process.env.CREOZENTIC_ALLOWED_MEDIA_ROOTS;
  process.env.NODE_ENV = "production";
  process.env.CREOZENTIC_ALLOWED_MEDIA_ROOTS = "/tmp/creozentic-media";
  try {
    assert.equal(
      await assertTrustedMediaPath("/tmp/creozentic-media/source.mp4", "sourcePath"),
      "/tmp/creozentic-media/source.mp4",
    );
    assert.equal(
      assertTrustedOutputPath("/tmp/creozentic-media/rendered.mp4"),
      "/tmp/creozentic-media/rendered.mp4",
    );
    await assert.rejects(
      () => assertTrustedMediaPath("/etc/passwd", "sourcePath"),
      /outside the configured media storage roots/,
    );
    assert.throws(
      () => assertTrustedOutputPath("/etc/rendered.mp4"),
      /outside the configured media storage roots/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRoots === undefined) delete process.env.CREOZENTIC_ALLOWED_MEDIA_ROOTS;
    else process.env.CREOZENTIC_ALLOWED_MEDIA_ROOTS = previousRoots;
  }
});

test("development fixture paths remain usable outside production roots", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    assert.equal(await assertTrustedMediaPath("/tmp/test-fixture.mp4", "assetPath"), "/tmp/test-fixture.mp4");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
