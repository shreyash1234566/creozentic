# Windows + Conda Setup Guide for Creozentic

## Goal

Use this layout:

```text
C:\  = installed development software, Windows tools, and normal tool caches
E:\  = Creozentic source, vendored repositories, Conda environments, Graphify files, models, and project media
```

The project repository is:

```text
https://github.com/shreyash1234566/creozentic.git
```

The project folder will be:

```text
E:\Projects\creozentic
```

Do not run Ubuntu `sudo apt` commands in PowerShell. This guide is for native Windows PowerShell using your existing Windows installations and Conda.

## 1. Open the correct terminal

Open **Anaconda Prompt** or **PowerShell where `conda` is available**. Check first:

```powershell
conda --version
conda info --base
```

If `conda` is not recognized, open Anaconda Prompt from the Windows Start menu. If it still does not work, configure Conda for PowerShell:

```powershell
conda init powershell
```

Close PowerShell, open a new PowerShell window, and run:

```powershell
conda --version
```

## 2. Check existing tools before installing anything

Run this detection block. It does not install or change anything:

```powershell
$checks = @("git", "node", "npm", "python", "conda", "curl", "ffmpeg", "ffprobe", "make", "gcc", "g++", "clang", "cmake")
foreach ($name in $checks) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
        Write-Host "FOUND  $name  ->  $($command.Source)" -ForegroundColor Green
        try { & $name --version 2>&1 | Select-Object -First 1 } catch {}
    } else {
        Write-Host "MISSING $name" -ForegroundColor Yellow
    }
}
```

Your reported machine already has:

| Tool | Current result |
|---|---|
| Git | Installed on C: |
| Node.js | Installed on C:, version 22.15.0 |
| npm | Installed |
| Python | Installed, version 3.11.15 |
| Java | Installed |
| Conda | Use the check above to confirm the active terminal sees it |
| curl | Check with the detection block |
| FFmpeg/ffprobe | Check with the detection block |
| C/C++ build tools | Check with the detection block |
| Docker | Not required for the first local setup; install later only if a documented service needs it |

## 3. Install only missing tools

Do not reinstall tools that the detection block reports as available.

For missing Windows tools, use PowerShell with `winget` only for the missing item:

```powershell
winget install --id Git.Git
winget install --id OpenJS.NodeJS
winget install --id Gyan.FFmpeg
winget install --id Kitware.CMake
```

If `winget` cannot find a package, install it from the vendor’s official Windows installer. After installing, close and reopen PowerShell, then run the detection block again.

`build-essential` is an Ubuntu package and does not exist as a native PowerShell command. On Windows, use **Visual Studio Build Tools** or the required package’s Windows build tools. Do not install a random `make` or GCC package merely because the Linux guide mentions `build-essential`.

For most first tests, Git, Node.js, pnpm, Python/Conda, and FFmpeg are the important tools. Docker and a native C/C++ compiler are not required unless a particular worker’s original documentation requires them.

## 4. Configure pnpm without moving the project to C:

Check Node.js and pnpm:

```powershell
node --version
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

If Windows blocks Corepack, open Anaconda Prompt or PowerShell as a normal user first. Do not use administrator access unless Windows explicitly requires it.

The `pnpm` package store may remain on C:. The source code and `node_modules` will be under E:. If you want the pnpm store on E: as well, configure it before installing:

```powershell
pnpm config set store-dir E:\PackageStores\pnpm
```

## 5. Clone Creozentic to E:

Run:

```powershell
New-Item -ItemType Directory -Force E:\Projects | Out-Null
Set-Location E:\Projects
git clone https://github.com/shreyash1234566/creozentic.git
Set-Location E:\Projects\creozentic
```

Verify the clone:

```powershell
git status
git log -1 --oneline
Get-ChildItem third_party -Directory | Select-Object Name
Get-ChildItem docs\graphify-final
```

You should see the original worker source under `third_party`, the Graphify compressed graph at `docs\graphify-final\graph.json.gz`, and the setup documentation.

## 6. Create the main Conda environment on E:

Create a Conda environment with its files on E:. This prevents the project’s Python environment from consuming space on C:.

```powershell
conda create --prefix E:\CondaEnvs\creozentic python=3.11 -y
conda activate E:\CondaEnvs\creozentic
```

Verify:

```powershell
python --version
where.exe python
conda info --envs
```

The active Python path should point to `E:\CondaEnvs\creozentic`.

Install only the lightweight project-side Python packages first if the repository provides a requirements file. Do not install every third-party worker requirements file into this environment.

## 7. Install JavaScript project dependencies

From the project root:

```powershell
Set-Location E:\Projects\creozentic
pnpm install
```

Keep this installation in the project on E:. Do not copy `node_modules` into another repository or manually edit dependencies before the first validation.

## 8. Configure the environment file

If the repository includes an example environment file:

```powershell
if (Test-Path .env.example) { Copy-Item .env.example .env }
```

Open it:

```powershell
notepad .env
```

For the first API-based editing test, configure only the provider keys you actually have. The main categories are the Director LLM, transcription, optional image generation, optional video generation, database, and local worker paths.

Never commit `.env`:

```powershell
git status --short
```

Use the project validator:

```powershell
pnpm env:check
```

If it reports a missing secret, add the real value to `.env`. Do not paste secrets into Claude Code prompts or commit them to Git.

## 9. Create the Graphify knowledge graph before asking Claude Code to understand the code

The clone already contains the compact complete graph:

```text
docs\graphify-final\graph.json.gz
```

Verify it without uncompressing:

```powershell
Get-Item docs\graphify-final\graph.json.gz
python -c "import gzip,json; f=gzip.open('docs/graphify-final/graph.json.gz','rt',encoding='utf-8'); g=json.load(f); print('nodes=',len(g.get('nodes',[]))); print('edges=',len(g.get('links',g.get('edges',[]))))"
```

If you need Graphify itself for future regeneration, install it in a separate tool environment rather than the application Conda environment:

```powershell
uv tool install "graphifyy[openai,sql,terraform]"
graphify --help
```

If `uv` is not installed, use the official Graphify installation instructions or install the Windows `uv` tool first. Do not install Graphify into the main Python worker environment.

## 10. Open the visual graph

From PowerShell:

```powershell
Set-Location E:\Projects\creozentic\docs\graphify-final
python graph_viewer_server.py
```

Open the local address printed by the server and load:

```text
graph-visual.html
```

The server uses the raw `graph.json` if you create it locally. After a fresh clone, it automatically uses `graph.json.gz`. You do not need to create the 190 MB uncompressed file for the viewer.

To create it only when another program explicitly requires ordinary JSON:

```powershell
python -c "import gzip,shutil; shutil.copyfileobj(gzip.open('graph.json.gz','rb'),open('graph.json','wb'))"
```

The raw file is intentionally ignored by Git.

## 11. Give Claude Code the project context in the correct order

From the repository root:

```powershell
Set-Location E:\Projects\creozentic
claude
```

Paste this first prompt:

```text
You are working in E:\Projects\creozentic, the Creozentic source-first AI video application.

Before changing any code, understand the project through the compact Graphify knowledge graph and the source-first documentation. Read these files first:

1. docs/graphify-final/GRAPH_REPORT.md
2. docs/graphify-final/batch-manifest.json
3. docs/graphify-final/graph-overview.json
4. docs/SOURCE_FIRST_INTEGRATION_PLAN.md
5. docs/SOURCE_FIRST_STATUS_LEDGER.json
6. docs/STRICT_SOURCE_FIRST_CURRENT_AUDIT.md
7. docs/VENDORED_REPOSITORY_PROVENANCE.json
8. docs/LOCAL_SETUP_AND_GRAPHIFY_PLAN.md
9. docs/CLAUDE_CODE_LOCAL_SETUP_GUIDE.md
10. MASTER_GUIDE.md if present

Use Graphify as an architecture map. Do not load the entire graph.json into the chat context. Use the graph to locate relevant nodes and relationships, then open the actual source files named by those relationships.

Non-negotiable architecture rules:
- Uploaded-video editing and AI video generation are separate workflows.
- TypeScript is manager-only: UI, database, orchestration, routing, approvals, provenance, and job state.
- Original repositories under third_party own their media algorithms.
- Never rewrite an original media algorithm in TypeScript.
- Never call a worker active without running its original entrypoint successfully on a real fixture.
- Never hide a missing dependency, model, credential, license, or service.
- Preserve the existing UI/UX unless explicitly asked to change it.

First return a short architecture summary and a table containing verified active, structurally connected, pending, and external components. Do not modify files during this first pass.
```

## 12. Install heavy workers in separate Conda environments

Do not install CutScript, FunClip, ComfyUI, ViMax, and other ML requirements into the main environment together. Their Torch, CUDA, Gradio, PyYAML, and model requirements may conflict.

Create a worker environment on E: only when activating that worker. Example:

```powershell
conda create --prefix E:\CondaEnvs\creozentic-cutscript python=3.11 -y
conda activate E:\CondaEnvs\creozentic-cutscript
Set-Location E:\Projects\creozentic
python -m pip install --upgrade pip
python -m pip install -r third_party\cutscript\backend\requirements.txt
```

Before installing any worker, ask Claude Code:

```text
Activate only the original worker [WORKER_NAME] in third_party\[DIRECTORY].

Read its original README, requirements, entrypoints, model instructions, and license first. Decide the smallest Windows/Conda environment needed for a non-destructive help, version, import, or fixture smoke test. Do not install into the main E:\CondaEnvs\creozentic environment. Do not rewrite the original media algorithm. Do not download large model weights until I approve the exact model, size, license, and storage requirement. Run the original entrypoint from its original working directory and save exact evidence in docs/worker-health/[WORKER_NAME].md.
```

Recommended order:

| Order | Worker | Reason |
|---:|---|---|
| 1 | `apps/worker/media_analysis.py` | Lowest-risk local evidence worker. |
| 2 | SceneDetect/OpenCV | Useful local scene analysis without a large model. |
| 3 | Hosted Whisper or isolated CutScript/Faster-Whisper | Needed for timed transcript words. |
| 4 | Configured Director LLM | Needed for EditPlan creation. |
| 5 | ComfyUI with an approved checkpoint | Needed for still B-roll. |
| 6 | ViMax or hosted video provider | Needed only for moving B-roll. |
| 7 | OCR and diarization | Optional advanced evidence. |

## 13. Run the first tests

From the project root with the main Conda environment active:

```powershell
Set-Location E:\Projects\creozentic
conda activate E:\CondaEnvs\creozentic
pnpm env:check
pnpm exec tsc --noEmit
pnpm test:unit
pnpm guide:check
pnpm oss:check
```

Create and run the deterministic media-analysis fixture if the script is available on your Windows environment:

```powershell
bash scripts/make-media-analysis-fixture.sh
```

If Git Bash is not available, ask Claude Code to create an equivalent PowerShell fixture command using the existing FFmpeg arguments; do not invent a different media-analysis algorithm.

Run the full test only after starting the app server in another terminal:

```powershell
pnpm dev
```

Then in a second PowerShell window:

```powershell
Set-Location E:\Projects\creozentic
pnpm test
```

If the smoke test says `ECONNREFUSED 127.0.0.1:3000`, the app server was not running. This is a startup test issue, not automatically a code failure.

## 14. Use Claude Code with fewer tokens

Use this prompt for every feature:

```text
Use a Graphify-first, minimal-context workflow for [FEATURE].

1. Read the small report, batch manifest, graph overview, source-first ledger, and provenance.
2. Search the graph for [FEATURE] and identify the exact source group, files, functions, and direct neighbors.
3. Open only those actual source files and their focused tests.
4. Show extracted versus inferred graph edges.
5. Explain the current runtime evidence and external blockers.
6. Propose the smallest safe change.
7. Do not edit until the plan is shown.
8. After editing, run focused tests, TypeScript validation, and the relevant original-worker smoke check.
9. Report exact commands and exact results.

Do not load the entire 190 MB graph into the chat. Do not replace an original worker algorithm with TypeScript.
```

## 15. Update the graph after changes

Do not edit `graph.json` or `graph.json.gz` manually. After meaningful source changes:

```powershell
Set-Location E:\Projects\creozentic
python scripts\audit-graphify-workflow.py
python scripts\pack-graphify-artifacts.py
```

For a full Graphify regeneration, use the repository’s batch scripts from PowerShell or Git Bash. Do not run one giant scan over all folders if it causes the machine to stall:

```powershell
bash scripts/run-graphify-worker-batches.sh
bash scripts/run-graphify-temporal-batches.sh
```

Then merge and export using Graphify’s documented commands:

```powershell
graphify global add <batch-output>\graph.json --as <source-name>
graphify export callflow-html <output-location>
```

Claude Code update prompt:

```text
The source changed. Use Git status and the Graphify map to identify the affected application or worker batch. Regenerate only the affected batch first, then update the merged graph and run scripts\pack-graphify-artifacts.py.

Compare node and edge counts with the previous batch-manifest.json. Report added, removed, and changed source relationships. Never manually edit graph JSON and never claim the graph is current until the changed source and regenerated batch are recorded.
```

## 16. Simple troubleshooting

| Problem | Action |
|---|---|
| `conda` not recognized | Open Anaconda Prompt, or run `conda init powershell`, restart PowerShell, and try again. |
| `ffmpeg` not recognized | Check with `Get-Command ffmpeg`; install only if missing. |
| `curl` not recognized | Windows 11 normally provides it; check `Get-Command curl.exe`; install Git/curl only if missing. |
| `build-essential` not found | It is an Ubuntu package. On Windows, install Visual Studio Build Tools only if a worker requires a compiler. |
| `pnpm` not recognized | Run `corepack enable`, then prepare pnpm and reopen PowerShell. |
| `graph.json` not found | Normal after cloning; use `graph.json.gz`. The viewer loads it automatically. |
| Graph viewer blank | Run the server from `E:\Projects\creozentic\docs\graphify-final`; open `graph-visual.html` from that server. |
| Python packages conflict | Use a separate Conda environment for each original worker. |
| ComfyUI starts but does not generate | A checkpoint/workflow is missing. |
| Moving B-roll fails | A video provider/model is not configured; the editor should record the failure and use the still fallback. |
| `ECONNREFUSED :3000` | Start `pnpm dev` in another terminal before `pnpm test`. |

## 17. Permanent Claude Code project prompt

```text
Project root: E:\Projects\creozentic.

Use the Graphify artifacts in docs\graphify-final before exploring the repository broadly. The complete graph is graph.json.gz; do not load it into the chat context. Start with GRAPH_REPORT.md, batch-manifest.json, graph-overview.json, the source-first integration plan, status ledger, audit, and provenance manifest.

The architecture is source-first. The TypeScript application is a manager only. Original repositories under third_party own media processing. Uploaded-video editing is separate from AI video generation. B-roll is conditional: NONE creates no asset, STILL_IMAGE uses an image-generation capability, and GENERATED_VIDEO uses a video-generation capability with a recorded still fallback if the video branch fails. Approval is required before generated assets enter the FFmpeg render plan.

Before changing code, show the Graphify path, actual files, current runtime evidence, and external blockers. Never claim a worker is active without an original-entrypoint fixture check. Never replace a missing model or dependency with fake code. Preserve the UI/UX. Run focused tests, tsc, and the relevant worker check after every change.
```

## Final order to follow

```text
Open Anaconda Prompt/PowerShell
    ↓
Check Conda and existing tools
    ↓
Install only missing Windows tools on C:
    ↓
Clone Creozentic to E:\Projects\creozentic
    ↓
Create the main Conda environment on E:
    ↓
pnpm install
    ↓
Verify graph.json.gz
    ↓
Start the Graphify viewer
    ↓
Start Claude Code with the graph-first prompt
    ↓
Run TypeScript/unit/guide/OSS checks
    ↓
Activate heavy workers one at a time in separate E: Conda environments
    ↓
Configure models and providers only when needed
    ↓
Run the uploaded-video workflow
```

— Manus AI
