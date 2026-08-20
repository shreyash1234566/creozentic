# Strict source-first current audit

## Ownership rule

Original repositories own media processing. Creozentic TypeScript owns orchestration, UI, persistence, approvals, provenance, routing, and deterministic coordination. The project must not claim full activation merely because a repository is cloned or registered.

## 16-repository status

| Repository | Original entrypoint | Status | Evidence / blocker |
|---|---|---|---|
| OpenShorts | `third_party/openshorts/main.py` | Verified active | Earlier direct source run produced output; current isolated Python path needs re-established if the local path changed. |
| CutScript | `backend/main.py` | Pending runtime | Import blocked by missing Python dependencies. |
| VideoClipper | package scripts | Pending runtime | Original package needs a runtime smoke test. |
| AI-Broll | `AI_Broll.ipynb` | Pending runtime | Notebook workflow needs a reproducible original execution path and model dependencies. |
| FunClip | `funclip/launch.py` | Pending runtime | Gradio/dependencies missing. |
| AVE | `src/main.py` | Pending runtime | PyYAML/dependencies missing. |
| PixelTable | `pxt serve` / Python API | Pending runtime | Service and original API environment need activation. |
| ViMax | `main_idea2video.py`, `main_script2video.py` | Pending runtime | Original pipeline dependencies and model weights missing. |
| VideoAgent | `main.py` | Pending runtime | Original environment dependencies missing. |
| VideoDB Director | backend / Docker | Pending runtime | Service/API environment needs activation and credentials where required. |
| ComfyUI | `main.py` / HTTP API | Health verified; models pending | Original `main.py --help` passes; generation checkpoints are not provisioned. |
| Temporal | Temporal server | Pending runtime | Server process and worker wiring need activation. |
| OpenChatCut | package scripts | Pending runtime | Original package scripts need a runtime smoke test. |
| OpenMontage | `backlot/__main__.py` / Remotion | Pending runtime | `backlot` is not installed in the active Python environment. |
| Twick | pnpm workspace scripts | Pending runtime | Original workspace build/render smoke test remains. |
| FFmpeg | system binary | Verified active | `ffmpeg -version` passes and final render path uses it. |

## Verification

The repository currently passes TypeScript validation, 34/34 project tests, the 13-point guide check, the OSS completeness check, and the four B-roll/source-ownership regression tests. The JSON status ledger also validates with `python3 -m json.tool`.

## What is not yet proven

The remaining workers are not marked finished because their original runtime environments, dependencies, model weights, services, or reproducible input/output contracts are not active in this sandbox. This is an execution limitation, not permission to replace their media logic with new TypeScript algorithms.
