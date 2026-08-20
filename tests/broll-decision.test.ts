import test from "node:test";
import assert from "node:assert/strict";
import { decideBrollMedia } from "../src/server/broll-decision";
import { getOpenSourceEditingPlan } from "../src/server/open-source-editing";

test("B-roll policy prefers no insert for a gap that is too short", () => {
  assert.equal(
    decideBrollMedia({ gapSec: 0.8, factuality: "NON_FACTUAL_METAPHOR", requiresMotion: true }).mediaType,
    "NONE",
  );
});

test("B-roll policy prefers a still for factual or text-heavy content", () => {
  assert.equal(
    decideBrollMedia({
      gapSec: 4,
      factuality: "VERIFIED",
      requiresMotion: true,
      containsPreciseTextOrData: true,
      budgetMode: "PREMIUM",
    }).mediaType,
    "STILL_IMAGE",
  );
});

test("B-roll policy chooses moving video only when motion and duration justify it", () => {
  const result = decideBrollMedia({
    gapSec: 4,
    factuality: "NON_FACTUAL_METAPHOR",
    requiresMotion: true,
    budgetMode: "BALANCED",
  });
  assert.equal(result.mediaType, "GENERATED_VIDEO");
  assert.equal(result.fallback, "STILL_IMAGE");
});

test("open-source references map to bounded Creozentic responsibilities", () => {
  const plan = getOpenSourceEditingPlan();
  assert.equal(plan.transcript, "cutscript");
  assert.equal(plan.momentDetection, "openshorts");
  assert.equal(plan.asrFallback, "funclip");
  assert.equal(plan.movingBroll, "vimax");
  assert.equal(plan.approvalAndProvenance, "creozentic-manager");
});
