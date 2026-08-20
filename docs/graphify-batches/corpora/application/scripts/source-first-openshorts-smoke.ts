import { runOriginalEditingWorker } from "../src/server/open-source-editing";

process.env.OPENSHORTS_REFERENCE_ENABLED = "true";

const result = await runOriginalEditingWorker(
  "openshorts",
  [
    "-i",
    "../../.source-first-fixtures/input.mp4",
    "-o",
    "../../.source-first-fixtures/adapter-output.mp4",
    "--skip-analysis",
    "--format",
    "vertical",
  ],
  { timeoutMs: 120_000 },
);

console.log(JSON.stringify({ id: result.id, status: result.status, exitCode: "exitCode" in result ? result.exitCode : undefined, stderr: "stderr" in result ? result.stderr.slice(-3000) : undefined }));
if (result.status !== "SUCCEEDED") process.exitCode = 1;
