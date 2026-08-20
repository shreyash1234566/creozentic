import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

export type OpenSourceEditingReference = {
  id:
    | "openshorts"
    | "cutscript"
    | "videoclipper"
    | "ai-broll"
    | "funclip"
    | "ave"
    | "pixeltable"
    | "vimax"
    | "videoagent"
    | "videodb-director"
    | "comfyui"
    | "temporal"
    | "openchatcut"
    | "openmontage"
    | "twick";
  name: string;
  repository: string;
  localPath: string;
  license: string;
  roles: string[];
  activation: string;
};

const root = process.env.CREOZENTIC_THIRD_PARTY_ROOT ?? join(process.cwd(), "third_party");

export const OPEN_SOURCE_EDITING_REFERENCES: readonly OpenSourceEditingReference[] = [
  {
    id: "openshorts",
    name: "OpenShorts",
    repository: "https://github.com/mutonby/openshorts",
    localPath: join(root, "openshorts"),
    license: "MIT core; cloud/managed components have separate terms",
    roles: ["moment-detection", "captions", "face-reframing", "ffmpeg", "still-broll"],
    activation: "OPENSHORTS_REFERENCE_ENABLED",
  },
  {
    id: "cutscript",
    name: "CutScript",
    repository: "https://github.com/DataAnts-AI/CutScript",
    localPath: join(root, "cutscript"),
    license: "MIT",
    roles: ["word-transcription", "transcript-editing", "filler-removal", "audio-cleanup"],
    activation: "CUTSCRIPT_REFERENCE_ENABLED",
  },
  {
    id: "videoclipper",
    name: "IMG.LY VideoClipper",
    repository: "https://github.com/imgly/videoclipper",
    localPath: join(root, "videoclipper"),
    license: "Repository and SDK dependency terms require review",
    roles: ["browser-composition", "captions", "speaker-layouts", "timeline-ux"],
    activation: "VIDEOCLIPPER_REFERENCE_ENABLED",
  },
  {
    id: "ai-broll",
    name: "AI-Broll",
    repository: "https://github.com/Anil-matcha/AI-Broll",
    localPath: join(root, "ai-broll"),
    license: "MIT; external MuAPI dependency",
    roles: ["broll-prompting", "image-or-video-asset-experiment"],
    activation: "AI_BROLL_REFERENCE_ENABLED",
  },
  {
    id: "funclip",
    name: "FunClip",
    repository: "https://github.com/modelscope/FunClip",
    localPath: join(root, "funclip"),
    license: "Open source; model-weight and provider terms require review",
    roles: ["asr", "timestamps", "speaker-clipping", "srt"],
    activation: "FUNCLIP_REFERENCE_ENABLED",
  },
  {
    id: "ave",
    name: "Agentic Video Editor",
    repository: "https://github.com/poseljacob/agentic-video-editor",
    localPath: join(root, "ave"),
    license: "MIT",
    roles: ["director", "reviewer", "edit-plan"],
    activation: "AVE_REFERENCE_ENABLED",
  },
  {
    id: "pixeltable",
    name: "Pixeltable",
    repository: "https://github.com/pixeltable/pixeltable",
    localPath: join(root, "pixeltable"),
    license: "Apache-2.0",
    roles: ["media-index", "evidence", "asset-search"],
    activation: "PIXELTABLE_REFERENCE_ENABLED",
  },
  {
    id: "vimax",
    name: "ViMax",
    repository: "https://github.com/HKUDS/ViMax",
    localPath: join(root, "vimax"),
    license: "Apache-2.0",
    roles: ["storyboard", "image-to-video", "video-generation"],
    activation: "VIMAX_REFERENCE_ENABLED",
  },
  {
    id: "videoagent",
    name: "VideoAgent",
    repository: "https://github.com/HKUDS/VideoAgent",
    localPath: join(root, "videoagent"),
    license: "Apache-2.0",
    roles: ["video-understanding", "agent-tools", "audio"],
    activation: "VIDEOAGENT_REFERENCE_ENABLED",
  },
  {
    id: "videodb-director",
    name: "VideoDB Director",
    repository: "https://github.com/video-db/Director",
    localPath: join(root, "videodb-director"),
    license: "Apache-2.0",
    roles: ["video-search", "director", "retrieval"],
    activation: "VIDEODB_DIRECTOR_REFERENCE_ENABLED",
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    repository: "https://github.com/Comfy-Org/ComfyUI",
    localPath: join(root, "comfyui"),
    license: "GPL-3.0",
    roles: ["image-generation", "video-generation", "workflow-runtime"],
    activation: "COMFYUI_REFERENCE_ENABLED",
  },
  {
    id: "temporal",
    name: "Temporal",
    repository: "https://github.com/temporalio/temporal",
    localPath: join(root, "temporal"),
    license: "MIT",
    roles: ["durable-workflows", "retries", "long-running-jobs"],
    activation: "TEMPORAL_REFERENCE_ENABLED",
  },
  {
    id: "openchatcut",
    name: "OpenChatCut",
    repository: "https://github.com/0xsline/OpenChatCut",
    localPath: join(root, "openchatcut"),
    license: "AGPL-3.0",
    roles: ["conversational-editing", "timeline", "remotion-rendering"],
    activation: "OPENCHATCUT_REFERENCE_ENABLED",
  },
  {
    id: "openmontage",
    name: "OpenMontage",
    repository: "https://github.com/calesthio/OpenMontage",
    localPath: join(root, "openmontage"),
    license: "AGPL-3.0",
    roles: ["montage", "asset-generation", "composition"],
    activation: "OPENMONTAGE_REFERENCE_ENABLED",
  },
  {
    id: "twick",
    name: "Twick",
    repository: "https://github.com/ncounterspecialist/twick",
    localPath: join(root, "twick"),
    license: "Sustainable Use License 1.0",
    roles: ["timeline", "captions", "browser-rendering", "ffmpeg-rendering"],
    activation: "TWICK_REFERENCE_ENABLED",
  },
];

export type OriginalWorkerId = OpenSourceEditingReference["id"];

const ORIGINAL_ENTRYPOINTS: Record<OriginalWorkerId, { command: string; args: string[] }> = {
  openshorts: { command: "./.venv/bin/python", args: ["main.py"] },
  cutscript: { command: "python3", args: ["backend/main.py"] },
  videoclipper: { command: "pnpm", args: ["dev"] },
  "ai-broll": { command: "python3", args: ["-m", "jupyter", "nbconvert", "--to", "notebook", "AI_Broll.ipynb"] },
  funclip: { command: "python3", args: ["funclip/launch.py"] },
  ave: { command: "python3", args: ["src/main.py"] },
  pixeltable: { command: "python3", args: ["-m", "pixeltable"] },
  vimax: { command: "python3", args: ["main_idea2video.py"] },
  videoagent: { command: "python3", args: ["main.py"] },
  "videodb-director": { command: "docker", args: ["compose", "up", "backend"] },
  comfyui: { command: "python3", args: ["main.py"] },
  temporal: { command: "temporal", args: ["server", "start-dev"] },
  openchatcut: { command: "pnpm", args: ["dev"] },
  openmontage: { command: "python3", args: ["-m", "backlot"] },
  twick: { command: "pnpm", args: ["dev"] },
};

export async function getOpenSourceEditingStatus() {
  return Promise.all(
    OPEN_SOURCE_EDITING_REFERENCES.map(async (reference) => ({
      ...reference,
      sourcePresent: await access(reference.localPath).then(() => true).catch(() => false),
      enabled: process.env[reference.activation] === "true",
    })),
  );
}

/**
 * Returns the bounded strategy used by the EditPlan. The source projects
 * contribute worker patterns; Creozentic remains the system of record for
 * evidence, approvals, assets, and rendering.
 */
export async function runOriginalEditingWorker(
  id: OriginalWorkerId,
  args: string[] = [],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
) {
  const reference = OPEN_SOURCE_EDITING_REFERENCES.find((candidate) => candidate.id === id);
  if (!reference) throw new Error(`Unknown source-first worker: ${id}`);
  if (process.env[reference.activation] !== "true") {
    return { id, status: "DISABLED" as const, reason: `Set ${reference.activation}=true after dependency and license approval` };
  }
  const present = await access(reference.localPath).then(() => true).catch(() => false);
  if (!present) return { id, status: "UNAVAILABLE" as const, reason: reference.localPath };
  const entrypoint = ORIGINAL_ENTRYPOINTS[id];
  return await new Promise<{ id: OriginalWorkerId; status: "SUCCEEDED" | "FAILED"; exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(entrypoint.command, [...entrypoint.args, ...args], {
      cwd: reference.localPath,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 10 * 60_000);
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ id, status: exitCode === 0 ? "SUCCEEDED" : "FAILED", exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export function getOpenSourceEditingPlan() {
  return {
    transcript: "cutscript",
    asrFallback: "funclip",
    momentDetection: "openshorts",
    reframing: "openshorts",
    stillBroll: "comfyui",
    movingBroll: "vimax",
    composition: "openmontage",
    approvalAndProvenance: "creozentic-manager",
    renderer: "ffmpeg-system-runtime",
  } as const;
}
