import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export type CoreEngineId =
  | "openshorts"
  | "ave"
  | "pixeltable"
  | "vimax"
  | "videoagent"
  | "videodb-director"
  | "remotion"
  | "comfyui"
  | "temporal"
  | "openchatcut"
  | "openmontage"
  | "twick"
  | "cutscript"
  | "videoclipper"
  | "ai-broll"
  | "funclip";

export type CoreEngineRole =
  | "repurposing"
  | "director"
  | "evidence-index"
  | "generation"
  | "video-search"
  | "rendering"
  | "durable-workflow"
  | "editing"
  | "motion-composition";

export interface CoreEngineManifest {
  id: CoreEngineId;
  name: string;
  repository: string;
  revision: string;
  license: string;
  role: CoreEngineRole;
  sourceRoot: string;
  entrypoint: string;
  enabledBy: string;
  externalActivation: string;
}

const refRoot =
  process.env.CORE_ENGINE_REF_ROOT ??
  `${process.env.CREOZENTIC_ROOT ?? process.cwd()}/third_party`;

export const CORE_ENGINE_MANIFEST: readonly CoreEngineManifest[] = [
  {
    id: "openshorts",
    name: "OpenShorts",
    repository: "https://github.com/mutonby/openshorts",
    revision: "e4331467e5d2352fd8c75535584e6e1e09b482b3",
    license: "MIT core; cloud directory separately licensed",
    role: "repurposing",
    sourceRoot: `${refRoot}/openshorts`,
    entrypoint: "main.py / api / remotion / render-service",
    enabledBy: "OPENSHORTS_ENABLED",
    externalActivation: "Gemini, ElevenLabs, social, storage credentials",
  },
  {
    id: "ave",
    name: "Agentic Video Editor",
    repository: "https://github.com/poseljacob/agentic-video-editor",
    revision: "47248b577046b0563e57e78edad86a3106c6faab",
    license: "MIT",
    role: "director",
    sourceRoot: `${refRoot}/agentic-video-editor`,
    entrypoint: "ave CLI / pipelines/*.yaml",
    enabledBy: "AVE_ENABLED",
    externalActivation: "Gemini API key and media runtime",
  },
  {
    id: "pixeltable",
    name: "Pixeltable",
    repository: "https://github.com/pixeltable/pixeltable",
    revision: "9f8ab10723c4d98f3661554811f8cce3acecda3d",
    license: "Apache-2.0",
    role: "evidence-index",
    sourceRoot: `${refRoot}/pixeltable`,
    entrypoint: "pixeltable Python API / pxt serve",
    enabledBy: "PIXELTABLE_ENABLED",
    externalActivation: "Python runtime and optional object storage/model providers",
  },
  {
    id: "vimax",
    name: "ViMax",
    repository: "https://github.com/HKUDS/ViMax",
    revision: "05a48943878312d88fe5a016c12a9654940ecc43",
    license: "MIT",
    role: "generation",
    sourceRoot: `${refRoot}/vimax`,
    entrypoint: "main_idea2video.py / main_script2video.py / web",
    enabledBy: "VIMAX_ENABLED",
    externalActivation: "Gemini/media provider keys and GPU/model runtime",
  },
  {
    id: "videoagent",
    name: "VideoAgent",
    repository: "https://github.com/HKUDS/VideoAgent",
    revision: "f207987e3cffb554aaa6ffdbe733efb30f4b51ed",
    license: "MIT",
    role: "director",
    sourceRoot: `${refRoot}/videoagent`,
    entrypoint: "main.py / environment agents",
    enabledBy: "VIDEOAGENT_ENABLED",
    externalActivation: "Python runtime and model providers",
  },
  {
    id: "videodb-director",
    name: "VideoDB Director",
    repository: "https://github.com/video-db/Director",
    revision: "70e0b3dfdf59c679a25f4bea511e3cc4c5f2457f",
    license: "MIT",
    role: "video-search",
    sourceRoot: `${refRoot}/videodb-director`,
    entrypoint: "backend / frontend",
    enabledBy: "VIDEODB_DIRECTOR_ENABLED",
    externalActivation: "VideoDB or compatible media index credentials",
  },
  {
    id: "remotion",
    name: "Remotion",
    repository: "https://github.com/remotion-dev/remotion",
    revision: "package-managed",
    license: "Terms vary by organization and automated use",
    role: "rendering",
    sourceRoot: "node_modules/remotion",
    entrypoint: "@remotion/renderer",
    enabledBy: "REMOTION_ENABLED",
    externalActivation: "License approval for automated commercial rendering",
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    repository: "https://github.com/Comfy-Org/ComfyUI",
    revision: "cc0fc21fea7a6a82f568362b15b7fbd713b419c1",
    license: "GPL-3.0",
    role: "generation",
    sourceRoot: `${refRoot}/comfyui`,
    entrypoint: "main.py / HTTP API",
    enabledBy: "COMFYUI_ENABLED",
    externalActivation: "GPL review, GPU host, model weights, secured API",
  },
  {
    id: "temporal",
    name: "Temporal",
    repository: "https://github.com/temporalio/temporal",
    revision: "2940d01a2aecf81cb336f1b2f7b98976fcd30b9f",
    license: "Temporal open-source server license",
    role: "durable-workflow",
    sourceRoot: `${refRoot}/temporal`,
    entrypoint: "Temporal service / TypeScript SDK",
    enabledBy: "TEMPORAL_ENABLED",
    externalActivation: "Temporal service deployment and namespace",
  },
  {
    id: "openchatcut",
    name: "OpenChatCut",
    repository: "https://github.com/robertwyq/OpenChatCut",
    revision: "pinned-reference",
    license: "AGPL-3.0",
    role: "editing",
    sourceRoot: `${refRoot}/openchatcut`,
    entrypoint: "package.json scripts / CLI",
    enabledBy: "OPENCHATCUT_ENABLED",
    externalActivation: "AGPL review and isolated runtime",
  },
  {
    id: "openmontage",
    name: "OpenMontage",
    repository: "https://github.com/creozentic/openmontage",
    revision: "pinned-reference",
    license: "AGPL-3.0",
    role: "motion-composition",
    sourceRoot: `${refRoot}/openmontage`,
    entrypoint: "package.json scripts / renderer",
    enabledBy: "OPENMONTAGE_ENABLED",
    externalActivation: "AGPL review and renderer runtime",
  },
  {
    id: "cutscript",
    name: "CutScript",
    repository: "https://github.com/DataAnts-AI/CutScript",
    revision: "e5c47e3",
    license: "MIT",
    role: "editing",
    sourceRoot: `${refRoot}/cutscript`,
    entrypoint: "backend/main.py / frontend",
    enabledBy: "CUTSCRIPT_ENABLED",
    externalActivation: "Python dependencies and WhisperX/model runtime",
  },
  {
    id: "videoclipper",
    name: "IMG.LY VideoClipper",
    repository: "https://github.com/imgly/videoclipper",
    revision: "01e6e7a",
    license: "Repository/SDK terms require review",
    role: "editing",
    sourceRoot: `${refRoot}/videoclipper`,
    entrypoint: "package.json scripts / Next.js app",
    enabledBy: "VIDEOCLIPPER_ENABLED",
    externalActivation: "Node dependencies and license review",
  },
  {
    id: "ai-broll",
    name: "AI-Broll",
    repository: "https://github.com/Anil-matcha/AI-Broll",
    revision: "e7d1b44",
    license: "MIT",
    role: "generation",
    sourceRoot: `${refRoot}/ai-broll`,
    entrypoint: "AI_Broll.ipynb",
    enabledBy: "AI_BROLL_ENABLED",
    externalActivation: "Jupyter and external image/video provider",
  },
  {
    id: "funclip",
    name: "FunClip",
    repository: "https://github.com/modelscope/FunClip",
    revision: "51557f3",
    license: "Apache-2.0",
    role: "repurposing",
    sourceRoot: `${refRoot}/funclip`,
    entrypoint: "funclip/launch.py",
    enabledBy: "FUNCLIP_ENABLED",
    externalActivation: "Python dependencies and FunASR model weights",
  },
  {
    id: "twick",
    name: "Twick",
    repository: "https://github.com/twickjs/twick",
    revision: "pinned-reference",
    license: "Sustainable Use License 1.0",
    role: "motion-composition",
    sourceRoot: `${refRoot}/twick`,
    entrypoint: "package.json scripts / CLI",
    enabledBy: "TWICK_ENABLED",
    externalActivation: "License review and Node rendering runtime",
  },
];

export async function getCoreEngineStatus(): Promise<
  Array<CoreEngineManifest & { sourcePresent: boolean; enabled: boolean }>
> {
  return Promise.all(
    CORE_ENGINE_MANIFEST.map(async (engine) => ({
      ...engine,
      sourcePresent:
        engine.sourceRoot.startsWith("node_modules/") ||
        (await access(engine.sourceRoot)
          .then(() => true)
          .catch(() => false)),
      enabled: process.env[engine.enabledBy] === "true",
    })),
  );
}

export async function runCoreEngine(
  id: CoreEngineId,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ id: CoreEngineId; exitCode: number; stdout: string; stderr: string }> {
  const engine = CORE_ENGINE_MANIFEST.find((candidate) => candidate.id === id);
  if (!engine) throw new Error(`Unknown core engine: ${id}`);
  if (process.env[engine.enabledBy] !== "true") {
    throw new Error(
      `${id} is disabled; set ${engine.enabledBy}=true after runtime and license approval`,
    );
  }

  const command = id === "remotion" ? "pnpm" : id === "temporal" ? "temporal" : "python3";
  const commandArgs =
    id === "remotion"
      ? ["exec", "remotion", ...args]
      : id === "temporal"
        ? args
        : [engine.entrypoint.split(" ")[0], ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? engine.sourceRoot,
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
      resolve({ id, exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}
