import assert from "node:assert/strict";
import test from "node:test";
import { canEditorTransition, editorIssueCodes } from "../src/server/editor-contracts";
import { editorPromptFamilies } from "../src/server/editor-prompts";
import { runSpecializedJudges } from "../src/server/editor-qa";

test("editor lifecycle only allows evidence-first progression", () => {
  assert.deepEqual(canEditorTransition("DRAFT", "ANALYZE"), { allowed: true, state: "ANALYZING" });
  assert.equal(canEditorTransition("DRAFT", "RENDER").allowed, false);
  assert.equal(canEditorTransition("APPROVED", "PUBLISH").state, "APPROVED");
});

test("all guide editor prompt families are versioned", () => {
  const required = [
    "editor_evidence_interpreter",
    "editor_hook_selector",
    "editor_narrative_planner",
    "editor_edit_decision_planner",
    "editor_visual_insert_planner",
    "editor_visual_bible_builder",
    "editor_motion_graphics_planner",
    "editor_audio_planner",
    "editor_quality_judge",
    "editor_repair_planner",
    "editor_change_summary",
  ] as const;
  for (const family of required) assert.equal(editorPromptFamilies[family].version, 1);
});

test("quality judges expose the complete issue taxonomy and reject unsafe evidence", () => {
  assert.equal(editorIssueCodes.length, 19);
  const result = runSpecializedJudges({
    hasHook: false,
    hasVerifiedEvidence: false,
    hasCaptionPlan: false,
    captionsInsideSafeZone: false,
    audioClipping: true,
    transcriptMatches: false,
    rightsApproved: false,
    platformValid: false,
    brandAligned: false,
    motionIntensity: "AGGRESSIVE",
    repeatedVisualCount: 2,
  });
  assert.equal(result.verdict, "REJECT");
  assert.ok(result.issues.some((item) => item.issueCode === "PRODUCT_FACT_RISK"));
  assert.ok(result.issues.some((item) => item.issueCode === "CAPTION_OUT_OF_SAFE_ZONE"));
});
