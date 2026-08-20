import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks: Array<{ id: string; required: string; ok: boolean; evidence: string }> = [];
const has = (path: string) => existsSync(join(root, path));
const text = (path: string) => readFileSync(join(root, path), "utf8");
function check(id: string, required: string, ok: boolean, evidence: string) {
  checks.push({ id, required, ok, evidence });
}

check("A2", "Node 24 toolchain", text(".mise.toml").includes('node = "24"'), ".mise.toml");
check("A3", "NestJS/Fastify API boundary", has("apps/api/src/main.ts"), "apps/api/src/main.ts");
check(
  "A4",
  "Prisma 7 adapter",
  text("package.json").includes('"@prisma/client": "^7'),
  "package.json/src/server/db.ts",
);
check(
  "C2",
  "Editor missing entities",
  ["NarrativeMap", "EditDecision", "VisualBible"].every((name) =>
    text("prisma/schema.prisma").includes(`model ${name}`),
  ),
  "prisma/schema.prisma",
);
check(
  "C4",
  "All editor prompt families",
  [
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
  ].every((name) => text("src/server/editor-prompts.ts").includes(name)),
  "src/server/editor-prompts.ts",
);
check(
  "C5",
  "XState lifecycle",
  has("src/server/editor-contracts.ts") && text("package.json").includes('"xstate"'),
  "src/server/editor-contracts.ts",
);
check(
  "C7",
  "Motion Canvas scene boundary",
  has("packages/video/scenes/kinetic-caption.tsx"),
  "packages/video/scenes/kinetic-caption.tsx",
);
check("C8", "FFmpeg renderer", has("src/server/editor-render.ts"), "src/server/editor-render.ts");
check(
  "C11",
  "Media-analysis worker manifest",
  has("apps/worker/requirements-media.txt") && has("apps/worker/media_analysis.py"),
  "apps/worker",
);
check(
  "D7",
  "Billing/experiment/notification/webhook boundaries",
  has("packages/platform/src/index.ts"),
  "packages/platform/src/index.ts",
);
check(
  "D10",
  "Container and Terraform definitions",
  has("Dockerfile") && has("infrastructure/terraform/main.tf"),
  "Dockerfile/infrastructure/terraform",
);
check(
  "E",
  "Completion matrix",
  has("MASTER_GUIDE_COMPLETION_MATRIX.md"),
  "MASTER_GUIDE_COMPLETION_MATRIX.md",
);
check("T", "Editor tests", has("tests/editor-contracts.test.ts"), "tests/editor-contracts.test.ts");

const failed = checks.filter((item) => !item.ok);
for (const item of checks)
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.id} ${item.required} [${item.evidence}]`);
console.log(
  `SUMMARY pass=${checks.length - failed.length} fail=${failed.length} total=${checks.length}`,
);
if (failed.length) process.exitCode = 1;
