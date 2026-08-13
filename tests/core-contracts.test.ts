import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ApiError } from "../src/server/api";
import { verifyRazorpaySignature, verifyStripeSignature } from "../src/server/billing";
import { evaluateCreativeOutputs } from "../src/server/qa";
import { validatePlatformOutput } from "../src/server/platform-specs";
import {
  topologicalWorkflowNodePlan,
  validateWorkflowGraph,
  workflowNodePlan,
} from "../src/server/workflow-catalog";
import { parseCsvRows } from "../src/server/tabular-import";
import { parseXlsxRows } from "../src/server/tabular-import";
import { consumedCreditsFromLedgerAmount } from "../src/server/spending";
import * as XLSX from "xlsx";
import { normalizeReviewAnchor } from "../src/server/review-comments";
import { renderWorkflowTemplate, workflowPromptForNode } from "../src/server/workflow-runtime";

test("workflow graphs reject cycles and accept a typed DAG", () => {
  assert.deepEqual(
    validateWorkflowGraph({
      nodes: [
        { id: "input", type: "input" },
        { id: "generate", type: "image_generation" },
        { id: "review", type: "human_review" },
      ],
      edges: [
        { from: "input", to: "generate" },
        { from: "generate", to: "review" },
      ],
    }),
    {
      nodes: [
        { id: "input", type: "input" },
        { id: "generate", type: "image_generation" },
        { id: "review", type: "human_review" },
      ],
      edges: [
        { from: "input", to: "generate" },
        { from: "generate", to: "review" },
      ],
    },
  );
  assert.throws(
    () =>
      validateWorkflowGraph({
        nodes: [
          { id: "a", type: "input" },
          { id: "b", type: "image_generation" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    (error) => error instanceof ApiError && error.code === "WORKFLOW_CYCLE",
  );
});

test("workflow node plans preserve typed runtime configuration and legacy versions", () => {
  assert.deepEqual(
    workflowNodePlan({
      nodes: [
        { id: "brief", type: "input" },
        { id: "generate", type: "image_generation", config: { aspectRatio: "4:5" } },
      ],
    }),
    [
      { id: "brief", type: "input", config: {} },
      { id: "generate", type: "image_generation", config: { aspectRatio: "4:5" } },
    ],
  );
  assert.deepEqual(workflowNodePlan({ nodes: ["validate", "environment", "review"] }), [
    { id: "validate", type: "input", config: {} },
    { id: "environment", type: "image_generation", config: {} },
    { id: "review", type: "human_review", config: {} },
  ]);
});

test("workflow runtime orders graph nodes and substitutes only approved state paths", () => {
  const graph = {
    nodes: [
      { id: "generate", type: "image_generation" },
      { id: "input", type: "input" },
      { id: "prompt", type: "prompt_template", config: { template: "{{brief.product}}" } },
    ],
    edges: [
      { from: "input", to: "prompt" },
      { from: "prompt", to: "generate" },
    ],
  };
  assert.deepEqual(
    topologicalWorkflowNodePlan(graph).map((node) => node.id),
    ["input", "prompt", "generate"],
  );
  const state = { brief: { product: "Sofa" }, nodes: { prompt: { prompt: "Warm home" } } };
  assert.equal(
    renderWorkflowTemplate("Make {{brief.product}} {{process.env.SECRET}}", state),
    "Make Sofa ",
  );
  assert.equal(
    workflowPromptForNode({ id: "generate", type: "image_generation", config: {} }, state, [
      "sale",
    ]),
    "Warm home. sale",
  );
});

test("platform specifications block invalid published media", () => {
  const invalid = validatePlatformOutput({
    platform: "tiktok",
    width: 1080,
    height: 1080,
    durationMs: 300_000,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);
  const valid = validatePlatformOutput({
    platform: "instagram_story",
    width: 1080,
    height: 1920,
    durationMs: 15_000,
  });
  assert.equal(valid.valid, true);
});

test("quality gate blocks an unverified locked product output", () => {
  const scores = evaluateCreativeOutputs(
    { product: "Chair", sku: "CHAIR-1", mode: "lock" } as never,
    [
      {
        width: 1080,
        height: 1080,
        objectKey: "workspaces/demo/output.png",
        contentHash: "sha256:test",
        metadata: { productTruth: false, brandChecked: true, claimsChecked: true },
      },
    ],
  );
  assert.equal(scores["Product / identity truth"].verdict, "critical");
});

test("billing webhook signatures reject tampering", () => {
  const body = '{"id":"evt_1"}';
  const secret = "test-secret";
  const now = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${now}.${body}`).digest("hex");
  assert.doesNotThrow(() => verifyStripeSignature(body, `t=${now},v1=${signature}`, secret));
  assert.throws(() => verifyStripeSignature(`${body}x`, `t=${now},v1=${signature}`, secret));
  const razorpay = createHmac("sha256", secret).update(body).digest("hex");
  assert.doesNotThrow(() => verifyRazorpaySignature(body, razorpay, secret));
  assert.throws(() => verifyRazorpaySignature(body, "tampered", secret));
});

test("CSV catalogue imports preserve quoted values and reject malformed rows", () => {
  assert.deepEqual(parseCsvRows('sku,title,priceMinor\nS-1,"Chair, walnut",19900'), [
    { sku: "S-1", title: "Chair, walnut", priceMinor: "19900" },
  ]);
  assert.throws(() => parseCsvRows("sku,title\nS-1"));
});

test("XLSX catalogue imports preserve the first worksheet rows", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ sku: "S-2", title: "Lamp", priceMinor: 12900 }]),
    "Catalogue",
  );
  const payload = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  assert.deepEqual(parseXlsxRows(payload), [{ sku: "S-2", title: "Lamp", priceMinor: "12900" }]);
});

test("monthly spend usage counts settled consumption instead of netting reservations", () => {
  assert.equal(consumedCreditsFromLedgerAmount(-24), 24);
  assert.equal(consumedCreditsFromLedgerAmount(0), 0);
  assert.equal(consumedCreditsFromLedgerAmount(24), 0);
});

test("review anchors validate image regions and video timestamps", () => {
  assert.deepEqual(normalizeReviewAnchor({ kind: "video_timestamp", timestampMs: 4200 }), {
    kind: "video_timestamp",
    timestampMs: 4200,
  });
  assert.throws(() => normalizeReviewAnchor({ kind: "image_region", x: -1, y: 0 }));
});
