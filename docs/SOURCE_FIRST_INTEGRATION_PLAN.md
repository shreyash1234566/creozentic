# Source-first integration plan

## Goal

Make retained open-source projects genuinely usable in Creozentic by running their original source files from their original folders, removing only irrelevant parts, adding thin adapters for input/output conversion, and verifying real outputs before marking a project active.

The rule is:

> **Original project code performs the capability. Creozentic coordinates it. Creozentic does not replace the project’s core algorithm with a newly written imitation.**

## 1. What “active” means

A repository is marked **ACTIVE** only after all five conditions are true:

| Condition | Proof required |
|---|---|
| Original source is present | Original Git checkout and license file exist under `third_party/<name>` |
| Original dependencies are installed | Isolated environment or service manifest succeeds |
| Original entrypoint runs | The documented CLI, server, package, or service starts |
| Real input is accepted | A controlled or user-provided media fixture reaches the original code |
| Real output is returned | A valid media, JSON, timeline, transcript, or service response passes validation |

A repository with only a clone, registry entry, or adapter is **RETAINED/NOT ACTIVE**, not active.

## 2. Mathematical integration rule

Let the required capabilities be:

```text
C = {upload, inspect, transcribe, select, plan, still_broll,
     video_broll, captions, timeline, render, qa, approval, workflow}
```

For each retained project `Rᵢ`, let `F(Rᵢ)` be the capabilities its original source actually provides. We choose a primary implementation `P(c)` for each capability `c` and keep any other project as an alternative only when:

```text
F(Rᵢ) ∩ C ≠ ∅
```

and its measured output is better, cheaper, or operationally necessary.

The final system is correct when:

```text
∀ c ∈ C, ∃ P(c) such that c ∈ F(P(c))
```

and no two primary workers are forced to own the same state transition. This prevents duplicate editors from fighting over the same timeline.

## 3. Keep/remove/isolate matrix

No repository is discarded at the planning stage. Parts that do not belong in Creozentic’s product are isolated or omitted from the runtime while their original source remains preserved.

| Project | Original source role | Keep in active pipeline | Isolate/remove from product runtime | Original entrypoint to run |
|---|---|---|---|---|
| OpenShorts | Uploaded-video clipping, scene analysis, reframing, captions, FFmpeg | Primary source-first preprocessing candidate | Social publishing, hosted cloud, gallery, billing | `main.py` |
| CutScript | Transcript editing, WhisperX, filler removal, audio cleanup | Primary transcript-editing candidate if dependency smoke test passes | Its separate frontend, account system, unrelated API providers | `backend/main.py` |
| VideoClipper | Timeline/composition SDK and editor UI patterns | Evaluate original packages for composition only | Separate app shell and provider marketplace until license is clear | Original package scripts |
| AI-Broll | B-roll prompt/output experiment | Isolate notebook components only after reproducible run | Notebook UI, external MuAPI assumptions, non-production cells | Original notebook |
| FunClip | ASR, timestamps, speaker clipping, SRT | Optional ASR fallback after dependency/model test | Gradio UI and unrelated demo controls | `funclip/launch.py` |
| AVE | Director/reviewer/edit-plan concepts and pipelines | Use original pipeline if its CLI produces a compatible plan | Its own application state and UI | `src/main.py` / package CLI |
| Pixeltable | Media indexing and evidence search | Optional evidence-index worker if service overhead is justified | Dashboard and unrelated database UI | `pxt serve` / Python API |
| ViMax | Script/storyboard/image-to-video generation | Separate AI-generation pipeline candidate | Do not place in normal uploaded-video editing unless selected B-roll needs generation | `main_idea2video.py`, `main_script2video.py` |
| VideoAgent | Video understanding and specialist agents | Optional analysis worker if it returns useful evidence | Its heavy auxiliary tools unless specifically selected | `main.py` |
| VideoDB Director | Retrieval/search/director service | Optional search worker if self-hosted service is validated | Separate frontend and hosted-service assumptions | Original backend/Docker entrypoint |
| ComfyUI | Image/video workflow runtime | Primary local generation backend when models are available | Unneeded UI nodes/workflows and unused model families | `main.py`, HTTP API |
| Temporal | Durable workflow infrastructure | Keep only if long-running generation/retry reliability requires it | Do not use it as an editor or media processor | Temporal server |
| OpenChatCut | Conversational editor and editable timeline | Isolate selected original timeline/agent components after license review | AGPL application shell if SaaS distribution obligations are unacceptable | Original package scripts |
| OpenMontage | Agentic montage and composition | Isolate original montage/render worker for experiments | AGPL components and unrelated agent/UI surfaces unless legally approved | `backlot/__main__.py`, Remotion composer |
| Twick | TypeScript timeline/canvas/render SDK | Evaluate original timeline/render packages for UI/runtime reuse | SUL restrictions and public-asset provider code unless approved | Original pnpm workspace scripts |
| FFmpeg | Deterministic media processing | Primary final renderer | None for core editing | `ffmpeg` executable |

## 4. Primary capability ownership

| Capability | Primary original source | Reason |
|---|---|---|
| Source upload/validation | Creozentic + FFmpeg | Product boundary and deterministic validation already exist |
| Scene/moment extraction | OpenShorts original source | It already operates on uploaded long-form video |
| Transcript-driven editing | CutScript original source | Its original backend is specifically built around transcript editing |
| ASR fallback | FunClip original source | It provides a separate ASR/clipping path |
| Evidence index | Pixeltable original source, optional | Use only if the extra service materially improves search |
| Still-image B-roll | ComfyUI original source or verified external image model | It is a generation runtime, not a custom replacement |
| Moving-video B-roll | ViMax or ComfyUI original source, selected by real quality test | Keep separate from normal editing |
| B-roll medium decision | Creozentic orchestration contract | This is policy, not a media-generation algorithm |
| Timeline composition | Twick/VideoClipper/OpenMontage originals, select one after smoke tests | Avoid running multiple competing timeline engines |
| Final export | FFmpeg original system runtime | Deterministic and already verified |
| Durable retries | Temporal original service, optional | Only needed for asynchronous production jobs |
| Approval/provenance | Creozentic product boundary | No candidate provides the required tenant-scoped lifecycle |

## 5. Integration architecture

```text
Creozentic API and UI
  ↓
Creozentic job contract
  ↓
Original worker adapter
  ↓
Original repository folder and entrypoint
  ↓
Original output
  ↓
Thin output normalizer
  ↓
Creozentic evidence/asset/timeline contract
```

The adapter may do only these things:

```text
create a temporary workspace
copy or mount the input file
set environment variables
start the original entrypoint
wait for completion or poll the original API
read the original output
validate the output
map it into Creozentic’s contract
```

The adapter must not reproduce the upstream algorithm in TypeScript.

## 6. Resource strategy

The sandbox cannot keep every GPU-heavy environment installed simultaneously. That does not mean deleting source code. Use isolated environments and activate one worker group at a time:

| Worker group | Isolation |
|---|---|
| OpenShorts | `third_party/openshorts/.venv` |
| CutScript/FunClip/AVE/ViMax/VideoAgent | Separate Python environments, installed only for the current smoke-test group |
| ComfyUI | Separate Python environment and model directory |
| OpenChatCut/OpenMontage/Twick/VideoClipper | Separate pnpm workspaces and package stores |
| Pixeltable/VideoDB Director | Separate service containers or venvs |
| Temporal | Separate service process/container |

The original source remains in `third_party/` even when an environment is removed. Environment files, lockfiles, and activation notes must be retained so the setup is reproducible.

## 7. Phase execution order

### Phase A — Inventory and legal boundary

Record the repository URL, commit, license, original entrypoint, dependency files, required models, and intended capability. Do not copy code into `src/`.

### Phase B — One-project smoke tests

For every retained project, run the original entrypoint against a controlled fixture or documented health command. Store stdout, stderr, exit code, and output validation in a machine-readable report.

### Phase C — Select primary workers

For overlapping capabilities, compare output quality, dependency burden, runtime, and license. Keep one primary worker and mark the others as isolated alternatives. This is not discarding the repository; it prevents duplicate state owners.

### Phase D — Thin adapters

Connect each selected original worker to Creozentic with a stable job envelope:

```json
{
  "jobId": "...",
  "workspaceId": "...",
  "inputAssetIds": ["..."],
  "operation": "...",
  "outputContract": "...",
  "timeoutSec": 1800
}
```

### Phase E — End-to-end proof

Run the same uploaded video through:

```text
OpenShorts source preprocessing
  ↓
CutScript transcript-editing worker
  ↓
Creozentic B-roll decision
  ↓
ComfyUI/selected generation worker
  ↓
Selected original timeline/composition worker
  ↓
FFmpeg export
```

Where a worker is unavailable, the pipeline must fail with a precise activation status, not silently substitute custom code.

## 8. Acceptance proof

A project may be marked `ACTIVE` only if:

```text
original_entrypoint_exit_code = 0
AND output_exists = true
AND output_contract_valid = true
AND output_is_workspace_scoped = true
AND provenance_contains_repository_and_revision = true
```

For a media output, additionally require:

```text
ffprobe_valid = true
AND duration > 0
AND expected_media_type = true
```

For a transcript, additionally require:

```text
segments.length > 0
AND every segment has valid start/end timestamps
```

This is the proof-based boundary between “cloned,” “wired,” and “working.”

## Final decision

The plan does not delete the retained repositories. It uses their original files where they fit, isolates their irrelevant UI/cloud/demo components, chooses one primary owner per capability, and connects outputs through thin adapters. Creozentic remains the coordinator for workspace scope, approvals, provenance, and final export because those are product boundaries rather than upstream media algorithms.
