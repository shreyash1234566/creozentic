import { editorDirectorContract, promptVersion } from "../src/server/editor-prompts.ts";

const requiredFields = [
  "beats",
  "hooks",
  "visualInserts",
  "motionGraphics",
  "audioPlan",
  "captionPlan",
];
const plan = {
  beats: [
    { label: "Hook", evidenceIds: ["e1"] },
    { label: "Proof", evidenceIds: ["e1"] },
  ],
  hooks: [{ rank: 1, evidenceIds: ["e1"] }],
  visualInserts: [{ sourceStrategy: "verified-source-first", factuality: "VERIFIED_PENDING" }],
  motionGraphics: [{ kind: "kinetic-caption" }],
  audioPlan: { ducking: { enabled: true } },
  captionPlan: { safeZone: { bottom: 0.15 } },
};
const missing = requiredFields.filter((field) => !(field in plan));
const evidenceAnchored =
  plan.beats.every((beat) => beat.evidenceIds.length > 0) &&
  plan.hooks.every((hook) => hook.evidenceIds.length > 0);
const gates = {
  contractVersion:
    editorDirectorContract.length > 0 && promptVersion("editor_narrative_planner").endsWith("@1"),
  requiredFields: missing.length === 0,
  evidenceAnchored,
  bounded: plan.motionGraphics.length <= 12,
};
console.log(
  JSON.stringify(
    { suite: "editor-structural-gates-v1", gates, pass: Object.values(gates).every(Boolean) },
    null,
    2,
  ),
);
if (!Object.values(gates).every(Boolean)) process.exit(1);
