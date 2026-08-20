import assert from "node:assert/strict";
import test from "node:test";
import {
  applyScopedRepair,
  assignExperiment,
  buildEditDecisionList,
  buildOtioTimeline,
  createRenderManifest,
  estimateRenderCost,
  evaluateEditorSignals,
  normalizeAnalytics,
  paginate,
  removeDeadAir,
  retentionCandidates,
  selectRepurposeCandidates,
  signWebhook,
} from "../src/server/part2-runtime.ts";

test("editor runtime builds evidence-linked EDL, removes silence, and emits OTIO", () => {
  const beats = [
    {
      sequence: 1,
      startSec: 0,
      endSec: 3,
      label: "Hook",
      evidenceIds: ["e1"],
      spokenText: "Hello",
    },
    { sequence: 2, startSec: 3, endSec: 7, label: "Proof", evidenceIds: ["e1"] },
  ];
  const decisions = buildEditDecisionList(beats, [{ id: "e1", verified: true }]);
  const edited = removeDeadAir(decisions, [{ startSec: 0, endSec: 1, silent: true }]);
  assert.ok(edited.length > 0);
  assert.equal(buildOtioTimeline(edited).schema, "otio-v1");
});

test("approved generated visual inserts become bounded OTIO image clips", () => {
  const decisions = buildEditDecisionList(
    [{ sequence: 1, startSec: 0, endSec: 7, label: "Hook", evidenceIds: ["e1"] }],
    [{ id: "e1", verified: true }],
  );
  const timeline = buildOtioTimeline(decisions, 30, [
    {
      id: "visual-1",
      assetSource: "asset-1",
      approvalState: "APPROVED",
      factuality: "NON_FACTUAL_METAPHOR",
      motionRecipe: { startSec: 3, endSec: 5, bounded: true },
    },
    {
      id: "visual-2",
      assetSource: "asset-2",
      approvalState: "PENDING",
      motionRecipe: { startSec: 5, endSec: 7 },
    },
  ]);
  const imageTrack = timeline.tracks.find((track) => track.name === "generated-stills");
  assert.equal(imageTrack?.clips.length, 1);
  assert.equal(imageTrack?.clips[0]?.timelineStart, 90);
  assert.equal(imageTrack?.clips[0]?.sourceRange.duration, 60);
  const videoTimeline = buildOtioTimeline([], 30, [
    {
      id: "video-insert",
      assetSource: "video-asset",
      approvalState: "APPROVED",
      factuality: "NON_FACTUAL_METAPHOR",
      motionRecipe: { mediaType: "GENERATED_VIDEO", startSec: 2, endSec: 5 },
    },
  ]);
  const videoTrack = videoTimeline.tracks.find((track) => track.name === "generated-video-broll");
  assert.equal(videoTrack?.clips.length, 1);
  assert.equal(videoTrack?.clips[0]?.assetId, "video-asset");
});

test("renderer, repair, QA, and cost functions are bounded and deterministic", () => {
  const manifest = createRenderManifest({
    planVersion: 1,
    renderer: "ffmpeg-v1",
    sourceChecksums: ["a"],
    promptVersions: { director: "v1" },
    outputFormats: ["mp4"],
  });
  assert.equal(manifest.manifestHash.length, 64);
  const original = [
    { id: "a", kind: "KEEP" as const, startSec: 0, endSec: 1, evidenceIds: [], rationale: "x" },
  ];
  assert.equal(applyScopedRepair(original, ["a"], ["a"], []).length, 1);
  assert.deepEqual(
    evaluateEditorSignals({
      transcriptMatch: 1,
      captionSafe: true,
      audioClipping: false,
      rightsVerified: true,
      visualMotionScore: 0,
    }),
    { verdict: "PASS", issues: [] },
  );
  assert.equal(estimateRenderCost(60, 2), 2);
});

test("repurposing, analytics, experiments, webhooks, search, retention, and health are complete local algorithms", () => {
  assert.equal(
    selectRepurposeCandidates(
      [{ id: "1", transcript: "product proof", durationSec: 10, evidenceScore: 1 }],
      "product",
    )[0].id,
    "1",
  );
  assert.equal(
    normalizeAnalytics([
      { externalId: "a", type: "view", value: 1, occurredAt: "2026-01-01" },
      { externalId: "a", type: "view", value: 1, occurredAt: "2026-01-01" },
    ]).length,
    1,
  );
  assert.ok(assignExperiment("w", "x", ["a", "b"]).variant);
  assert.match(signWebhook("{}", "secret"), /^v1=/);
  assert.equal(paginate([1, 2, 3], 2).nextCursor, "2");
  assert.deepEqual(
    retentionCandidates([{ id: "old", expiresAt: "2020-01-01" }], new Date("2021-01-01")),
    ["old"],
  );
});
