# Open-Source Source-File Usage Audit

## Direct answer

**No. The open-source projects were not fully integrated by copying and executing all of their files in the uploaded-video editing runtime.**

The accurate implementation is a hybrid:

```text
Some repositories are cloned locally
Some older engine references are wrapped by an optional Python subprocess bridge
Some concepts/contracts are adapted into Creozentic code
The main uploaded-video editor still runs on custom TypeScript + FFmpeg code
```

The previous wording that Phases 1–4 were “finished” should be read as finished at the local contract/adapter level, **not** as “every open-source repository has been fully copied into and executed by the main editor.” That stronger claim would be false.

## Source-usage table

| Project | Cloned in current workspace | Original source files executed by main uploaded-video editor | Original source files executed through Python/Node bridge | Adapted into Creozentic code | Actual status |
|---|---:|---:|---:|---:|---|
| OpenShorts | Yes: `third_party/openshorts` | No | Not through the new `third_party` path. An older optional bridge references `/tmp/creozentic-core-refs/openshorts`, but it is disabled unless `OPENSHORTS_ENABLED=true`. | Role metadata and planning references only | **Cloned, inspected, not active in main editor** |
| CutScript | Yes: `third_party/cutscript` | No | No | `src/server/open-source-editing.ts` records transcript-editing role; no CutScript backend function is called | **Cloned, reference/adaptation only** |
| VideoClipper | Yes: `third_party/videoclipper` | No | No | Composition/timeline role metadata only | **Cloned, reference only** |
| AI-Broll | Yes: `third_party/ai-broll` | No | No | B-roll prompt/asset concept only | **Cloned, proof-of-concept reference only** |
| FunClip | Yes: `third_party/funclip` | No | No | ASR fallback role metadata only | **Cloned, reference only** |
| AVE / Agentic Video Editor | Not present at the checked `third_party` path | No | Optional bridge references `/tmp/creozentic-core-refs/agentic-video-editor`; disabled by default | EditPlan/reviewer concepts were implemented as custom TypeScript contracts | **Concepts adapted; source not active** |
| Pixeltable | Not present at the checked `third_party` path | No | Optional bridge reference; disabled by default | No live Pixeltable media-index service in the main editor | **Planned/reference only** |
| ViMax | Not present at the checked `third_party` path | No | Optional bridge reference; disabled by default | No live ViMax generated-video branch | **Planned/reference only** |
| VideoAgent | Not present at the checked `third_party` path | No | Optional bridge reference; disabled by default | Concepts only | **Planned/reference only** |
| VideoDB Director | Not present at the checked `third_party` path | No | Optional bridge reference; disabled by default | Concepts only | **Planned/reference only** |
| ComfyUI | Not present at the checked `third_party` path | No | Optional bridge reference; disabled by default | Provider boundary only | **Planned/reference only** |
| OpenChatCut | Present only under older `/tmp/creozentic-core-refs` reference path | No | Optional Python bridge; disabled by default | Timeline concepts only | **Optional isolated reference** |
| OpenMontage | Present only under older `/tmp/creozentic-core-refs` reference path | No | Optional Python bridge; disabled by default | Governance/fallback concepts only | **Optional isolated reference** |
| Twick | Present only under older `/tmp/creozentic-core-refs` reference path | No | Optional Python bridge; disabled by default | Motion-composition concepts only | **Optional isolated reference** |
| Remotion | Package-managed/runtime boundary | Not copied from a repository into the editor | Node renderer boundary may be used if configured | Existing composition boundary | **Technology boundary, license review required** |
| FFmpeg | System executable | Yes, as an executable, not copied source | Directly invoked by `src/server/editor-render.ts` and local renderer | Custom filter/timeline command construction | **Active in main editor** |

## What the main uploaded-video editor actually executes

The main editor path is primarily custom Creozentic code:

```text
src/server/editor.ts
src/server/editor-evidence.ts
src/server/editor-render.ts
src/server/part2-runtime.ts
src/server/media-jobs.ts
src/server/local-renderer.ts
src/server/broll-decision.ts
src/server/open-source-editing.ts
```

The actual moving-media rendering is performed by FFmpeg. The new open-source registry records roles and provenance, but it does not import or execute the cloned OpenShorts, CutScript, VideoClipper, AI-Broll, or FunClip source files during a normal editor render.

## What the Python bridge actually does

`apps/worker/adopted_core.py` is a subprocess bridge. It does not translate upstream Python into TypeScript and it does not import upstream application internals into the web process.

It uses this default root:

```text
/tmp/creozentic-core-refs
```

and only executes an engine if:

```text
ENGINE_ENABLED=true
```

Otherwise it returns `DISABLED`. If the repository is missing, it returns `UNAVAILABLE`.

Therefore, the Python bridge is an **optional integration boundary**, not proof that the cloned projects are active.

## What was written by Creozentic

These are custom Creozentic implementations, not copied source files:

| Custom file | Function |
|---|---|
| `src/server/broll-decision.ts` | Deterministic no/still/video B-roll decision policy |
| `src/server/open-source-editing.ts` | License-aware role registry and bounded integration plan |
| `src/server/editor.ts` | EditPlan persistence, asset generation, approval, and render orchestration |
| `src/server/editor-render.ts` | FFmpeg still/video overlay compositor |
| `src/server/part2-runtime.ts` | OTIO-style timeline and render manifest |
| `src/views/Editor.tsx` | Existing UI extension for visual generation/approval |
| `tests/broll-decision.test.ts` | Decision and role-mapping tests |
| `tests/part2-runtime.test.ts` | Timeline track tests |

## What was actually copied

The repositories themselves were cloned into:

```text
third_party/openshorts
third_party/cutscript
third_party/videoclipper
third_party/ai-broll
third_party/funclip
```

Their source files are available for inspection and future isolated adapters. They were **not fully merged into the application runtime**.

## Corrected conclusion

| Question | Truthful answer |
|---|---|
| Were the selected repositories cloned? | **Yes, five additional candidates were cloned under `third_party/`.** |
| Were all their files copied into the working editor? | **No.** |
| Were all their files translated into TypeScript? | **No.** |
| Is the main editor using their original source files now? | **No, not for the newly cloned five candidates.** |
| Does the Python bridge support optional original-source subprocess execution? | **Yes, for older engine references under `/tmp/creozentic-core-refs`, when enabled.** |
| Are those Python engines active by default? | **No.** |
| What does the main editor use today? | **Custom TypeScript contracts/services plus FFmpeg, with provider boundaries.** |
| Were open-source concepts adapted? | **Yes.** |
| Is “fully implemented using the original repositories” accurate? | **No.** |

The correct status is **“cloned and bounded/adapted,” not “fully integrated and actively executing every repository.”**
