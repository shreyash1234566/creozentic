# Source-First Repository Inventory

## Count

The current core-media plan contains **16 repositories/projects** plus **FFmpeg as a system runtime**.

The 16 are:

1. OpenShorts
2. CutScript
3. VideoClipper
4. AI-Broll
5. FunClip
6. Agentic Video Editor (AVE)
7. Pixeltable
8. ViMax
9. VideoAgent
10. VideoDB Director
11. ComfyUI
12. Remotion
13. Temporal
14. OpenChatCut
15. OpenMontage
16. Twick

The earlier platform-support repositories for authentication, social, billing, experiments, notifications, and webhooks are outside this core-media count.

## Inventory table

| # | Project | Repository | Intended job | Original entrypoint | Current local source state |
|---:|---|---|---|---|---|
| 1 | OpenShorts | `mutonby/openshorts` | Long-form-to-short-form repurposing, captions, reframing, still B-roll | `main.py`, API, Remotion, render service | Cloned at `third_party/openshorts`; older bridge path also exists |
| 2 | CutScript | `DataAnts-AI/CutScript` | Transcript-driven editing, word-level cuts, filler removal, audio cleanup | Electron + FastAPI; `backend/main.py` | Cloned at `third_party/cutscript` |
| 3 | VideoClipper | `imgly/videoclipper` | Browser composition, captions, speaker layouts, timeline UI | Next.js/TypeScript application | Cloned at `third_party/videoclipper` |
| 4 | AI-Broll | `Anil-matcha/AI-Broll` | Generated B-roll proof of concept | `AI_Broll.ipynb` | Cloned at `third_party/ai-broll` |
| 5 | FunClip | `modelscope/FunClip` | ASR, timestamps, speaker clipping, SRT | `funclip/launch.py` | Cloned at `third_party/funclip` |
| 6 | AVE | `poseljacob/agentic-video-editor` | Director → TrimRefiner → Editor → Reviewer | AVE CLI and YAML pipelines | Registry reference; must be cloned and smoke-tested from original source |
| 7 | Pixeltable | `pixeltable/pixeltable` | Multimodal media index, embeddings, computed analysis | Python API and `pxt serve` | Registry reference; must be cloned and smoke-tested from original source |
| 8 | ViMax | `HKUDS/ViMax` | Storyboard and generated-video branch | `main_idea2video.py`, `main_script2video.py`, web UI | Registry reference; must be cloned and smoke-tested from original source |
| 9 | VideoAgent | `HKUDS/VideoAgent` | Video understanding and agent tools | `main.py`, environment agents | Registry reference; must be cloned and smoke-tested from original source |
| 10 | VideoDB Director | `video-db/Director` | Video search, compilation, and generation agent | Backend/frontend | Registry reference; must be cloned and smoke-tested from original source |
| 11 | ComfyUI | `Comfy-Org/ComfyUI` | Image/video generation worker | `main.py`, HTTP API | Registry reference; must be cloned and license-reviewed before activation |
| 12 | Remotion | `remotion-dev/remotion` | React/TypeScript rendering and batch composition | `@remotion/renderer` | Package-managed boundary; license review required |
| 13 | Temporal | `temporalio/temporal` | Durable workflow execution | Temporal server and SDK | Registry reference; service deployment required |
| 14 | OpenChatCut | `robertwyq/OpenChatCut` | Conversational multitrack editing | package scripts/CLI | Optional old `/tmp/creozentic-core-refs` reference |
| 15 | OpenMontage | `creozentic/openmontage` | Agentic motion composition and governance | package scripts/renderer | Optional old `/tmp/creozentic-core-refs` reference |
| 16 | Twick | `twickjs/twick` | Timeline/canvas/caption composition | package scripts/CLI | Optional old `/tmp/creozentic-core-refs` reference |
| — | FFmpeg | System executable | Deterministic media inspection/compositing/rendering | `ffmpeg` executable | Active in current editor path |

## Source-first rule

No project will be marked **used** merely because it appears in a registry. It will be marked used only after its original entrypoint runs from its original folder, accepts a controlled input, produces an output, and that output is connected through a thin adapter to the next pipeline stage.

## Entry-point verification notes

The retained original folders were inspected in place. OpenShorts includes `main.py`, API, Remotion, and render-service components. AVE includes `src/main.py`, `pyproject.toml`, and YAML pipelines. Pixeltable includes a Python package and `pxt serve` path. ViMax includes `main_idea2video.py`/`main_script2video.py` references and web UI. VideoAgent includes `main.py` and environment agents. ComfyUI includes `main.py`, `pyproject.toml`, and `requirements.txt`. FunClip includes `funclip/launch.py`. CutScript includes the original FastAPI backend at `backend/main.py` and the original Electron/React frontend. OpenMontage includes Python requirements and a Remotion composer. Twick is a TypeScript monorepo with browser/server render packages. OpenChatCut is a TypeScript application with original package scripts. These original entrypoints will be used by thin adapters; they will not be replaced with new core implementations.

Canonical repositories discovered for previously unavailable entries: OpenChatCut = https://github.com/0xsline/OpenChatCut; OpenMontage = https://github.com/calesthio/OpenMontage; Twick = https://github.com/ncounterspecialist/twick.

## Source-first smoke-test evidence

OpenShorts was installed in its original folder at `third_party/openshorts/.venv` and its original `main.py` successfully processed `.source-first-fixtures/input.mp4` into a vertical MP4. The same original source also succeeded when invoked through Creozentic's thin `runOriginalEditingWorker` adapter. CutScript's original backend dependencies were installed in an isolated environment, but its original backend import surfaced a WhisperX/TorchAudio compatibility issue after dependency resolution; its source remains retained and was not rewritten. ComfyUI's original `main.py --help` executed successfully. FunClip dependency installation was stopped after the isolated environment exhausted sandbox storage and its incomplete environment was removed; the original source remains retained. Other heavyweight Python and Node projects were cloned and entrypoints inspected but not claimed as runtime-active without their full dependency/model/service setup.

The editor render path now supports `SOURCE_FIRST_EDITOR_ENGINE=openshorts`, which runs the original OpenShorts `main.py` in its original folder before Creozentic's final approval, generated-media compositing, and export boundary. This is an explicit opt-in source-first execution path, not a rewritten OpenShorts implementation.

## Deep-study baseline

All 16 retained repositories are present under `third_party/` with their original Git history, source folders, and entrypoint files. The current Creozentic runtime is TypeScript/Node plus FFmpeg, with optional Python and Node workers. The repository study found these source shapes: OpenShorts has a Python `main.py` plus dashboard/Remotion/render-service packages; CutScript has a Python FastAPI backend and React frontend; FunClip has `funclip/launch.py`; AVE has `src/main.py` and `pyproject.toml`; ComfyUI has `main.py` and `pyproject.toml`; ViMax and VideoAgent are Python model/agent projects; Pixeltable is a Python package/server; VideoDB Director is a backend/frontend Docker application; OpenMontage has Python `backlot/__main__.py` and a Remotion composer; OpenChatCut and Twick are TypeScript workspaces; VideoClipper is a TypeScript package/application; Temporal is a Go service rather than a media editor; AI-Broll is a notebook proof of concept.

The consequence for the source-first plan is that these projects are not interchangeable libraries. They include applications, services, workers, SDKs, notebooks, and infrastructure. The correct integration unit is therefore the original runnable component inside each repository, not an attempted line-by-line merge of unrelated applications into one TypeScript directory.

## Capability study result

The original projects divide into distinct categories rather than one universal editor. OpenShorts is a long-video-to-shorts application with upload, clip detection, captions, reframing, and FFmpeg rendering. CutScript is a transcript-based editing application with a FastAPI backend and React frontend. FunClip is an ASR/clipping application. OpenChatCut is a local-first conversational editor with editable projects. OpenMontage is an agentic production/montage system. Twick and VideoClipper are editor SDK/composition systems. ComfyUI is a workflow runtime for image/video generation, not an uploaded-video editor. ViMax is a story/video generation system. AVE, VideoAgent, and VideoDB Director are agent/director or media-understanding systems. Pixeltable is a media/data indexing system. Temporal is durable workflow infrastructure. AI-Broll is a proof-of-concept notebook.

No mathematical union of all projects should be treated as a single executable editor: the capabilities overlap and some projects are applications or infrastructure, not reusable workers. The plan must therefore select one original implementation per capability, retain additional projects as isolated alternatives or source references, and avoid running duplicate full applications in the same request.
