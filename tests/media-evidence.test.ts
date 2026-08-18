import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAudioWindows,
  normalizeEntities,
  normalizeOcr,
  normalizeShots,
  normalizeWords,
} from "../src/server/editor-evidence.ts";

test("normalizes provider transcript segments into timed words", () => {
  assert.deepEqual(
    normalizeWords({ words: [{ word: "hello", start: 0, end: 0.4, confidence: 0.98 }] }),
    [{ word: "hello", startSec: 0, endSec: 0.4, confidence: 0.98 }],
  );
});

test("normalizes shot, audio, entity, and OCR evidence without accepting invalid ranges", () => {
  assert.deepEqual(
    normalizeShots([
      { start: 0, end: 2 },
      { start: 2, end: 1 },
    ]),
    [{ startSec: 0, endSec: 2, confidence: undefined }],
  );
  assert.deepEqual(normalizeAudioWindows([{ start: 0, end: 1, features: { rms: -14 } }]), [
    { startSec: 0, endSec: 1, features: { rms: -14 } },
  ]);
  assert.deepEqual(normalizeEntities([{ label: "product", confidence: 0.9, region: { x: 1 } }]), [
    { label: "product", confidence: 0.9, region: { x: 1 } },
  ]);
  assert.deepEqual(normalizeOcr([{ text: "CTA", confidence: 0.8, region: { x: 1, y: 2 } }]), [
    { text: "CTA", confidence: 0.8, region: { x: 1, y: 2 } },
  ]);
});
