# Source-first Phase 1–4 final report

## Plain conclusion

The source-first correction is now implemented as far as the sandbox can verify. All sixteen selected core repositories are present in the retained source inventory. The original OpenShorts source has been installed, executed from its original folder, run on a controlled uploaded video, and invoked successfully through a thin Creozentic adapter. Creozentic’s render action can opt into that original worker with `SOURCE_FIRST_EDITOR_ENGINE=openshorts` before the final approval, B-roll compositing, and export boundary.

The other retained repositories are not falsely marked as production-active. They remain in their original folders with their original entrypoints, but their full runtimes need separate dependency/model/service setup. No repository was discarded during this source-first pass.

## Repository count and status

| # | Repository | Original folder | Original entrypoint | Retained? | Original source successfully executed in this pass? | Current role |
|---:|---|---|---|---:|---:|---|
| 1 | OpenShorts | `third_party/openshorts` | `main.py` | Yes | **Yes** | Source-first uploaded-video preprocessing, reframing, scene detection |
| 2 | CutScript | `third_party/cutscript` | `backend/main.py` | Yes | Import blocked by Torch/TorchAudio/WhisperX compatibility after dependency setup | Transcript-editing worker candidate |
| 3 | VideoClipper | `third_party/videoclipper` | Original package scripts | Yes | Not yet; Node dependencies not installed | Browser composition and timeline worker candidate |
| 4 | AI-Broll | `third_party/ai-broll` | Original notebook | Yes | Not yet; notebook/provider runtime not installed | B-roll generation reference/worker candidate |
| 5 | FunClip | `third_party/funclip` | `funclip/launch.py` | Yes | Not yet; installation stopped after sandbox storage pressure | ASR and clipping worker candidate |
| 6 | AVE | `third_party/ave` | `src/main.py` | Yes | Not yet; Python dependencies not installed | Director/reviewer worker candidate |
| 7 | Pixeltable | `third_party/pixeltable` | Package/server entrypoint | Yes | Not yet; Python package not installed | Evidence/media-index worker candidate |
| 8 | ViMax | `third_party/vimax` | `main_idea2video.py` / `main_script2video.py` | Yes | Not yet; model/runtime dependencies not installed | Video-generation worker candidate |
| 9 | VideoAgent | `third_party/videoagent` | `main.py` | Yes | Not yet; Python dependencies not installed | Video-understanding worker candidate |
| 10 | VideoDB Director | `third_party/videodb-director` | Docker/backend entrypoint | Yes | Not yet; service dependencies not started | Search/director worker candidate |
| 11 | ComfyUI | `third_party/comfyui` | `main.py` | Yes | **Help command succeeded** | Local image/video workflow runtime |
| 12 | Temporal | `third_party/temporal` | Temporal server | Yes | Not yet; service not started | Durable workflow runtime candidate |
| 13 | OpenChatCut | `third_party/openchatcut` | Original package scripts | Yes | Not yet; Node dependencies not installed | Conversational timeline worker candidate |
| 14 | OpenMontage | `third_party/openmontage` | `backlot/__main__.py` / Remotion composer | Yes | Not yet; Python/Node dependencies not installed | Montage/composition worker candidate |
| 15 | Twick | `third_party/twick` | Original pnpm workspace scripts | Yes | Not yet; Node dependencies not installed | Timeline/caption/rendering worker candidate |
| 16 | FFmpeg | System runtime | `ffmpeg` executable | Yes | **Yes** | Deterministic final renderer |

## What was changed

The source-first registry now records all retained projects and their original locations in `src/server/open-source-editing.ts` and `packages/video/src/adopted-engines.ts`.

A thin runner, `runOriginalEditingWorker`, launches retained projects from their original working folders. It does not reimplement their algorithms. The uploaded-video render path uses the original OpenShorts `main.py` when `SOURCE_FIRST_EDITOR_ENGINE=openshorts` is enabled.

The original OpenShorts test used:

```text
third_party/openshorts/main.py
```

with:

```text
.source-first-fixtures/input.mp4
```

It produced:

```text
.source-first-fixtures/adapter-output.mp4
```

with a six-second duration and a valid MP4 file. This proves one retained project is now genuinely executed through its original source and connected by a thin adapter.

The main Creozentic editing logic remains the system of record for EditPlans, evidence, approvals, generated assets, B-roll decisions, timeline contracts, and final export. The source-first worker is an explicit preprocessing boundary; it does not silently replace or duplicate the original project’s core logic.

## What is not claimed

The repository is not being falsely described as having sixteen fully active production runtimes. Cloning all repositories does not install their model weights, Python packages, Node workspaces, Docker services, GPU runtimes, or external credentials. Those are separate activation requirements.

The source-first policy is:

```text
Retain the original repository
  ↓
Install its original dependencies in isolation
  ↓
Run its original entrypoint
  ↓
Verify a real output
  ↓
Connect with a thin adapter
  ↓
Do not rewrite its core algorithm
```

## Verification

```text
TypeScript: passed
Full direct test suite: 34 passed, 0 failed
Guide check: 13 passed, 0 failed
OSS check: 16 core boundaries + 6 supporting boundaries passed
Original OpenShorts direct run: passed
Original OpenShorts through Creozentic adapter: passed
ComfyUI original help entrypoint: passed
```

## Remaining activation work

The remaining repositories are retained, not discarded. To activate each one, its original dependencies and runtime must be installed and then its original API/CLI contract must be connected through a thin adapter. The largest blockers are model weights, GPU requirements, service processes, dependency conflicts, and provider credentials. These are external runtime requirements, not reasons to replace the projects with newly written core implementations.
