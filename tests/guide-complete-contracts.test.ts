import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAcceptance,
  evaluateSafety,
  normalizeAnalyticsEvent,
  performanceScore,
  rankRetrieval,
  shouldRetry,
  defaultRetryPolicy,
  validateVerticalPack,
} from "../src/server/guide-complete-contracts";

test("vertical packs and rights-filtered retrieval are deterministic", () => {
  const pack = validateVerticalPack({
    id: "beauty",
    version: 1,
    name: "Beauty",
    audience: "Creators",
    forbiddenClaims: [],
    requiredEvidence: ["source"],
    platformRules: {},
  });
  assert.equal(pack.id, "beauty");
  const ranked = rankRetrieval(
    [
      {
        id: "a",
        text: "a",
        sourceId: "s",
        version: "1",
        rightsStatus: "APPROVED",
        embedding: [1, 0],
      },
      {
        id: "b",
        text: "b",
        sourceId: "s",
        version: "1",
        rightsStatus: "REJECTED",
        embedding: [1, 1],
      },
    ],
    [1, 0],
  );
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["a"],
  );
});

test("analytics normalization and performance scoring are bounded", () => {
  const event = normalizeAnalyticsEvent({
    id: "e",
    workspaceId: "w",
    platform: "META",
    event: "view",
    occurredAt: "2026-01-01",
    impressions: 100,
    views: 50,
    clicks: 10,
    conversions: 2,
    payload: {},
  });
  assert.equal(performanceScore(event), 23.6);
});

test("safety and retry gates are explicit", () => {
  assert.equal(
    evaluateSafety({
      rightsApproved: false,
      factualEvidence: true,
      moderationPassed: true,
      autonomous: true,
    }).allowed,
    false,
  );
  assert.equal(shouldRetry(defaultRetryPolicy, 0, "TIMEOUT"), true);
  assert.equal(shouldRetry(defaultRetryPolicy, 3, "TIMEOUT"), false);
});

test("production acceptance reports every missing domain", () => {
  assert.deepEqual(
    evaluateAcceptance({
      identity: true,
      media: true,
      ai: false,
      social: true,
      analytics: false,
      billing: true,
      operations: true,
    }),
    { passed: false, failures: ["ai", "analytics"] },
  );
});
