# Creozentic Local Setup and Claude Code Guide

## Purpose

This guide explains how to clone Creozentic once, prepare the local environment, make the Graphify knowledge graph available first, and then use Claude Code with the graph so it understands the project with less unnecessary repository exploration.

The graph is an **index and map**, not a replacement for the source code. Claude Code must use the graph to locate relevant files and then read the actual source before editing anything.

> **Important:** the compressed `docs/graphify-final/graph.json.gz` contains the complete Graphify graph. The uncompressed `graph.json` is optional and is not required for the viewer.

## 1. Machine requirements

For the manager, tests, Graphify viewer, FFmpeg, and basic media-analysis testing, use at least:

| Resource | Minimum | Recommended |
|---|---:|---:|
| CPU | 4 cores / 8 threads | 6–8 modern cores |
| RAM | 8 GB | 16–32 GB |
| Free SSD space | 20 GB after clone | 50–100 GB if activating workers/models |
| GPU | Not required for API-based testing | NVIDIA GPU with 8–12 GB VRAM for local AI workers |
| Operating system | Linux, macOS, or WSL2 | Ubuntu 22.04/24.04 |
| Internet | Required for cloning, package installation, and hosted models | Stable broadband |

An RTX 2050 with 4 GB VRAM is sufficient for the application, FFmpeg, OpenCV/SceneDetect, and light tests. It is not sufficient for comfortably running Whisper, image generation, and moving-video generation locally at the same time. For the first test, use hosted APIs for the heavy models.

## 2. Install base software

Install these before cloning:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y git curl ffmpeg python3 python3-venv python3-pip build-essential
```

Install Node.js 22 and pnpm. If Node.js is already version 22 or newer, do not reinstall it.

```bash
node --version
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
python3 --version
ffmpeg -version
ffprobe -version
```

Install Claude Code according to the official Claude Code installation instructions for your operating system. Then verify:

```bash
claude --version
```

## 3. Clone the one-place repository

```bash
git clone https://github.com/shreyash1234566/creozentic.git
cd creozentic
```

The single repository contains the Creozentic application, the vendored original worker source under `third_party/`, Graphify reports and viewer files, and the pinned provenance manifest.

Verify the important directories:

```bash
find third_party -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
cat docs/VENDORED_REPOSITORY_PROVENANCE.json
```

There are 15 vendored repository directories. The project’s sixteenth capability is FFmpeg, which is a system dependency rather than a Git repository.

## 4. Install JavaScript dependencies

```bash
pnpm install
```

Do not install every Python worker environment at once. The original repositories have conflicting ML dependencies. Activate each worker in an isolated virtual environment only when that worker is needed.

## 5. Create the local environment file

Copy the example file if it exists:

```bash
if [ -f .env.example ]; then cp .env.example .env; fi
```

If there is no example file, create `.env` manually and add only the credentials you actually have. Never commit `.env`.

For the first API-based uploaded-video editing test, the important categories are:

```dotenv
# Application
NODE_ENV=development
PORT=3000

# Database: use the values required by the local Prisma setup
DATABASE_URL=...

# Director LLM: use the provider supported by the current adapter
GROQ_API_KEY=...

# Transcription: configure the provider selected by the current adapter
# DEEPGRAM_API_KEY=...
# GROQ_API_KEY=...

# Optional hosted image generation
# FAL_KEY=...
# IMAGE_GENERATION_MODEL=...

# Optional ComfyUI
# COMFYUI_ENABLED=false
# COMFYUI_BASE_URL=http://127.0.0.1:8188

# Optional source-first OpenShorts path
# SOURCE_FIRST_EDITOR_ENGINE=openshorts
# OPENSHORTS_ENABLED=false

# Worker paths
MEDIA_ANALYSIS_WORKER_PATH=apps/worker/media_analysis.py
MEDIA_ANALYSIS_PYTHON=python3
```

Use the repository’s validator before starting the application:

```bash
pnpm env:check
```

The exact variable names in the current source are authoritative. If the validator reports a missing value, add that value to your local `.env`; do not invent a different variable name.

## 6. Build the Graphify context first

The repository already contains the portable graph artifact:

```text
docs/graphify-final/graph.json.gz
```

Check it:

```bash
ls -lh docs/graphify-final/graph.json.gz
gzip -t docs/graphify-final/graph.json.gz
```

The compressed graph is complete. It contains the same nodes and edges as the approximately 190 MB uncompressed graph. The small overview is also available:

```text
docs/graphify-final/graph-overview.json
```

Start the visual Graphify viewer:

```bash
cd docs/graphify-final
python3 graph_viewer_server.py
```

Open `graph-visual.html` from the address printed by the server. The server loads `graph.json` if you later create it locally; otherwise it loads `graph.json.gz` automatically.

To create the optional uncompressed file:

```bash
cd docs/graphify-final
gzip -dk graph.json.gz
```

Do not edit `graph.json` or `graph.json.gz` manually. They are generated artifacts.

## 7. Start Claude Code with the graph-first instruction

From the repository root, start Claude Code:

```bash
cd /path/to/creozentic
claude
```

Paste this as the first prompt:

```text
You are working in the Creozentic repository. Before changing code, understand the project through the existing Graphify map and source-first documentation.

Read these files first:
1. docs/graphify-final/GRAPH_REPORT.md
2. docs/graphify-final/batch-manifest.json
3. docs/graphify-final/graph-overview.json
4. docs/SOURCE_FIRST_INTEGRATION_PLAN.md
5. docs/SOURCE_FIRST_STATUS_LEDGER.json
6. docs/STRICT_SOURCE_FIRST_CURRENT_AUDIT.md
7. docs/VENDORED_REPOSITORY_PROVENANCE.json
8. docs/LOCAL_SETUP_AND_GRAPHIFY_PLAN.md
9. MASTER_GUIDE.md, if present

Use Graphify as a search and relationship map. For every proposed change, use the graph to locate candidate files, then open and verify the actual source files. Do not treat an inferred graph edge as proof of runtime behavior.

Respect these non-negotiable rules:
- Creozentic TypeScript is the manager: UI, database, orchestration, approvals, provenance, routing, and job state.
- Original media algorithms remain owned by the original worker source under third_party/.
- Do not rewrite an original worker’s media algorithm in TypeScript.
- Keep uploaded-video editing separate from AI video generation.
- Do not change the existing UI/UX unless explicitly requested.
- Do not claim a worker is active unless its original entrypoint runs successfully with a real fixture.
- Before editing, show the relevant graph path, files, current runtime status, and a small plan.
- After editing, run focused tests, TypeScript validation, and the relevant worker smoke check.

First return a concise architecture summary and a table of verified active, structurally connected, pending, and external components. Do not modify files during this first pass.
```

## 8. Ask Claude Code to inspect a feature efficiently

Use this prompt when working on one feature:

```text
Use the Graphify map to trace the complete path for [FEATURE]. Start from the user entrypoint and follow calls, imports, worker boundaries, approval transitions, and rendering outputs.

Return:
- the exact graph path;
- the exact source files and functions;
- which edges are extracted versus inferred;
- the original worker that owns media processing;
- the current runtime evidence;
- missing dependencies, models, credentials, or services;
- the smallest safe implementation plan.

Do not edit anything until I approve the plan. Do not replace an original worker algorithm with a new TypeScript implementation.
```

## 9. First uploaded-video editing test

The intended workflow is:

```text
Upload video
    ↓
FFmpeg/ffprobe
    ↓
Python media-analysis worker
    ↓
Whisper transcription, if configured
    ↓
SceneDetect/OpenCV
    ↓
Optional OCR and speaker diarization
    ↓
LLM Director creates EditPlan
    ↓
B-roll decision agent
    ├── no insert
    ├── generated still image
    └── generated moving video
    ↓
User approval
    ↓
FFmpeg final rendering
```

For the first useful test, configure only:

| Capability | First-test choice |
|---|---|
| Director | Hosted LLM through the configured provider adapter |
| Transcription | Hosted Whisper provider, or local Faster-Whisper only if installed separately |
| Scene analysis | Local SceneDetect/OpenCV |
| B-roll still | Hosted image API or a ComfyUI instance with a checkpoint |
| Moving B-roll | Hosted video API or an activated ViMax/Wan worker; otherwise the still fallback is used |
| Final render | Local FFmpeg |

A video-generation model is required only when the B-roll decision chooses moving video. It is not required for every editing job.

Generate the deterministic media fixture for worker testing:

```bash
bash scripts/make-media-analysis-fixture.sh
```

Run the delegated analysis worker directly:

```bash
python3 apps/worker/media_analysis.py /tmp/creozentic-media-analysis-fixture.mp4
```

If the fixture path differs, use the path printed by the script.

## 10. Validate the local installation

Run checks in this order:

```bash
pnpm env:check
pnpm exec tsc --noEmit
pnpm test:unit
pnpm guide:check
pnpm oss:check
```

The full test command may include a production smoke test that expects the web server at `127.0.0.1:3000`. Start the application before running it:

```bash
pnpm dev
```

In a second terminal:

```bash
cd /path/to/creozentic
pnpm test
```

If the smoke test reports `ECONNREFUSED 127.0.0.1:3000`, the application server was not running or was listening on a different port. This is not the same as a TypeScript failure.

Use Claude Code with this verification prompt:

```text
Run the local validation in this order: pnpm env:check, pnpm exec tsc --noEmit, pnpm test:unit, pnpm guide:check, pnpm oss:check, and finally pnpm test with the development server running.

For each command, record the exact result. If a command fails, classify it as source-code failure, dependency failure, missing model, missing credential, missing service, or test-environment failure. Fix only source-code failures that are inside the repository. Do not hide external blockers or mark them as passed.
```

## 11. Activate original workers safely

Each worker must be isolated. Do not combine all requirements files into one global Python environment.

The safe pattern is:

```bash
python3 -m venv .venv-cutscript
source .venv-cutscript/bin/activate
python -m pip install --upgrade pip
python -m pip install -r third_party/cutscript/backend/requirements.txt
deactivate 2>/dev/null || true
```

The exact install command depends on the worker’s manifest. Claude Code should inspect the original README and requirements file before installing anything.

Use this prompt for each worker:

```text
Activate only the original worker [WORKER_NAME] from third_party/[DIRECTORY].

1. Read its README, dependency manifests, entrypoints, and model instructions.
2. Identify the smallest isolated environment needed for a non-destructive --help, --version, import, or fixture smoke test.
3. Do not modify the worker’s media algorithm.
4. Do not install its dependencies into the global Python environment.
5. Run the original entrypoint from its original working directory.
6. Save the exact command, exit code, stdout, stderr, dependency versions, model paths, and result in docs/worker-health/[WORKER_NAME].md.
7. Update SOURCE_FIRST_STATUS_LEDGER.json only with evidence-based status.

Stop before downloading large models or accepting external licenses. Report what user credentials, model files, or terms acceptance are required.
```

Recommended activation order:

| Order | Worker/capability | Reason |
|---:|---|---|
| 1 | Python media-analysis worker plus SceneDetect/OpenCV | Lowest-risk local evidence stage. |
| 2 | Transcription worker or hosted Whisper | Needed for timed words and captions. |
| 3 | Director LLM provider | Needed to create the EditPlan. |
| 4 | ComfyUI still-image worker | Needed for generated still B-roll. |
| 5 | Moving-video worker/ViMax or hosted provider | Needed only for moving B-roll decisions. |
| 6 | OCR | Optional evidence enrichment. |
| 7 | Speaker diarization | Optional and model/license dependent. |
| 8 | OpenShorts and composition workers | Activate only after their original contracts and dependencies are verified. |

## 12. Claude Code prompt for conditional B-roll

```text
Audit the uploaded-video B-roll path using Graphify and the actual source.

The required behavior is:
- If no B-roll is needed, create no asset and continue the original timeline.
- If still B-roll is selected, call the configured original image-generation worker/provider.
- If moving B-roll is selected, call the configured original video-generation worker/provider.
- If moving-video generation fails, record the failure and request a still-image fallback.
- Do not render an unapproved generated asset.
- Insert only the approved asset into the FFmpeg render plan.
- Preserve provenance, media type, timing, approval state, and fallback reason.

Verify that TypeScript only manages the decision, request, approval, provenance, and render-plan boundary. The original worker/provider must own media generation. Show the graph path and current tests before editing, then implement the smallest missing wiring and test all three branches: NONE, STILL_IMAGE, and GENERATED_VIDEO with failure fallback.
```

## 13. Updating the graph after code changes

The graph is not manually edited. After a meaningful source change, regenerate the affected Graphify batches.

For normal application and worker updates, use the repository scripts:

```bash
bash scripts/run-graphify-worker-batches.sh
bash scripts/run-graphify-temporal-batches.sh
```

If the scripts require additional batch commands, inspect their help and the local setup plan first. Do not run the original oversized all-in-one scan over every directory.

Then merge the resulting graphs with Graphify’s official commands:

```bash
graphify global add <batch-output>/graph.json --as <source-name>
graphify export callflow-html <output-location>
```

Regenerate the compact artifact:

```bash
python3 scripts/pack-graphify-artifacts.py
```

Run the workflow audit:

```bash
python3 scripts/audit-graphify-workflow.py
```

Ask Claude Code to update the graph with this prompt:

```text
The source has changed. Determine which Graphify batch is affected from the changed file paths. Regenerate only the affected batch first, then update the merged graph and compact graph.json.gz artifact.

Compare the new node and edge counts with the previous batch-manifest.json. Report added, removed, and changed source groups and workflow paths. Do not manually edit graph JSON. Do not claim the graph is current until the changed source file checksum and regenerated batch are recorded.
```

## 14. How Claude Code should use fewer tokens

Claude Code should not read the entire 190 MB graph as chat context. Use this order:

| Step | Action |
|---:|---|
| 1 | Read the small report, ledger, provenance, and graph overview. |
| 2 | Search the graph for the relevant term or source group. |
| 3 | Inspect only the selected node’s neighboring nodes and edges. |
| 4 | Open the actual source files named by those nodes. |
| 5 | Read tests and runtime manifests for those files. |
| 6 | Make the smallest change and run focused validation. |

Use this prompt:

```text
Use a graph-first, minimal-context workflow. Do not load graph.json or graph.json.gz into the conversation. Start with GRAPH_REPORT.md, batch-manifest.json, graph-overview.json, the source-first ledger, and provenance. Search only for nodes related to [TERM]. Inspect direct neighbors and then open only the actual source files needed for the requested change. Summarize evidence before editing.
```

## 15. Troubleshooting

| Problem | Meaning | Fix |
|---|---|---|
| `pnpm` not found | pnpm is not installed or Corepack is disabled | Run `corepack enable` and activate pnpm. |
| `ffmpeg` not found | FFmpeg is missing from the system | Install FFmpeg with the operating system package manager. |
| Graph viewer stays blank | The wrong page or server was opened | Start `python3 graph_viewer_server.py` from `docs/graphify-final` and open `graph-visual.html`. |
| `graph.json` missing | Normal after a fresh clone | The server should load `graph.json.gz`; decompress only if another tool requires raw JSON. |
| `ECONNREFUSED :3000` | The application server is not running | Run `pnpm dev` in another terminal. |
| Python import conflict | Worker dependencies conflict | Use a separate virtual environment for that worker. |
| ComfyUI starts but creates no image | A checkpoint/workflow is missing | Install/configure the intended checkpoint and workflow. |
| ViMax starts but creates no video | Model weights or GPU service are missing | Configure a remote GPU or hosted video provider. |
| Whisper returns no transcript | Provider/model is not configured | Configure hosted Whisper or install the chosen local model. |
| Graph edge is present but worker fails | Graph is structural, not runtime proof | Read the worker health record and run its original entrypoint. |

## 16. Final Claude Code operating prompt

Use this as the permanent project instruction:

```text
Project: Creozentic, a source-first AI video editing and generation SaaS.

The repository contains the manager application and vendored original worker source under third_party/. Use the Graphify artifacts in docs/graphify-final/ to navigate the project efficiently, but always verify graph findings against actual source and runtime evidence.

Architecture rules:
- Uploaded-video editing and AI video generation are separate workflows.
- The uploaded-video path is evidence-first: upload, FFmpeg/ffprobe, media-analysis worker, transcription, optional scene/OCR/diarization, Director EditPlan, B-roll decision, conditional still/video generation, user approval, and FFmpeg final render.
- No B-roll is created when the decision is NONE.
- Still B-roll uses an image-generation capability only when selected.
- Moving B-roll uses a video-generation capability only when selected, with a recorded still fallback if generation fails.
- TypeScript is manager-only: UI, database, orchestration, routing, approvals, provenance, and render-plan coordination.
- Original repositories own their media algorithms. Do not rewrite their algorithms in TypeScript.
- Never call a worker active without an original-entrypoint smoke test and recorded evidence.
- Do not silently replace a missing model, credential, or dependency with a fake implementation.
- Preserve the existing UI/UX unless the user explicitly requests a change.

Before every implementation:
1. Use the Graphify report and overview to locate the path.
2. Read the actual source files and tests.
3. State what is connected, what is pending, and what is externally blocked.
4. Make a minimal plan.
5. Edit only after the plan is clear.
6. Run focused tests, TypeScript validation, and relevant worker checks.
7. Report exact results and never overstate runtime readiness.
```

## 17. Definition of success

The local setup is complete when:

```text
One repository cloned
    ↓
Node/pnpm/Python/FFmpeg verified
    ↓
pnpm install completed
    ↓
Graphify compressed graph verified
    ↓
Graph viewer opened
    ↓
Claude Code read the graph-first project context
    ↓
TypeScript, unit, guide, and OSS checks pass
    ↓
Media-analysis fixture passes
    ↓
Configured transcription works
    ↓
Director creates an EditPlan
    ↓
B-roll NONE, STILL_IMAGE, and GENERATED_VIDEO fallback tests pass
    ↓
Approved asset reaches FFmpeg render
```

A worker that lacks a model, credential, service, or license acceptance is not a code failure. Record it as an external activation requirement and continue testing the reachable parts of the pipeline.

## References

[1]: https://github.com/shreyash1234566/creozentic "Creozentic GitHub repository"
[2]: https://github.com/Graphify-Labs/graphify "Graphify GitHub repository"
[3]: https://ffmpeg.org/documentation.html "FFmpeg documentation"
[4]: https://nodejs.org/en/download "Node.js downloads"
[5]: https://pnpm.io/installation "pnpm installation documentation"
[6]: https://docs.anthropic.com/en/docs/claude-code "Claude Code documentation"

## Repository-specific source documents

The most important local references are `docs/SOURCE_FIRST_INTEGRATION_PLAN.md`, `docs/SOURCE_FIRST_STATUS_LEDGER.json`, `docs/STRICT_SOURCE_FIRST_CURRENT_AUDIT.md`, `docs/VENDORED_REPOSITORY_PROVENANCE.json`, `docs/graphify-final/GRAPH_REPORT.md`, `docs/graphify-final/batch-manifest.json`, and `docs/LOCAL_SETUP_AND_GRAPHIFY_PLAN.md`.

These files should be read before making architectural changes. The graph helps Claude Code find the right place quickly; the source, tests, worker entrypoints, and runtime health evidence determine whether the behavior actually works.

— Manus AI
