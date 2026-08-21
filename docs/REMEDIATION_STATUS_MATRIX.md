# Creozentic Remediation Status Matrix

Updated after the first remediation pass. “Fixed” means the repository code now addresses the defect and the relevant validation passed. “Partial” means the manager contract is improved but real worker/provider/runtime verification is still missing. “External” means the remaining work requires a model, credential, service, dependency environment, or user-owned infrastructure. “Pending” means additional repository implementation is still required.

## Validation snapshot

| Check | Result |
|---|---:|
| TypeScript | Passed |
| Unit tests | **32 passed, 0 failed** |
| Guide check | **13 passed, 0 failed** |
| OSS completeness | **16 core + 6 supporting boundaries passed** |
| Production smoke | Not passed in the sandbox run because no server was listening on `127.0.0.1:3000` |

## Critical findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| C-01 | Arbitrary client filesystem paths | **Fixed in code** | Added `src/server/editor-paths.ts`; production paths must be absolute and inside configured media roots. Regression tests pass. A production deployment must set `CREOZENTIC_ALLOWED_MEDIA_ROOTS` or `CREOZENTIC_MEDIA_ROOT`. |
| C-02 | Visual approval not scoped to workspace/project | **Fixed in code** | Approval now queries through the plan, project, and workspace. Add full database integration coverage when a test database is available. |
| C-03 | Weak provider output contract | **Fixed in code** | Gateway now requires nonempty outputs with `assetId`, MIME type, `objectKey`, and `contentHash`, plus provider/model/version and usage metadata. Async job polling remains unimplemented. |

## High findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| H-01 | Director is deterministic instead of an LLM | **External / pending** | Deterministic planner is now labeled `deterministic-fallback-v2`. A real structured Director provider, model ID, credentials, and integration test are still required. |
| H-02 | Local worker lacks transcript/OCR/entities | **External / pending** | The manager contract exists, but original CutScript/FunClip/Whisper, OCR, and entity workers still need activation and models. |
| H-03 | Evidence failures are swallowed | **Fixed in code** | Worker errors now throw a typed `MediaEvidenceExtractionError`; normal analysis requires timed transcript output unless `metadataOnly=true`. Empty projects are rejected. |
| H-04 | Local path sent to remote transcription | **Fixed in code / external setup pending** | Remote fallback now runs only for HTTP(S) asset URLs. Actual hosted transcription still requires signed object URLs or an active original local worker. |
| H-05 | Major AI models not active | **External blocked** | Requires Whisper, diarization, OCR, image checkpoint/provider, and video checkpoint/provider setup. Code cannot provision user credentials or large model weights. |
| H-06 | Worker commands are not reliable contracts | **Partial** | OpenShorts now uses `OPENSHORTS_PYTHON`/`CREOZENTIC_PYTHON` and works with clean clones. Notebook/apps/services still need dedicated adapters, health checks, and output schemas. |
| H-07 | Default plan lacks a still-image candidate | **Fixed in code** | The default plan now creates a prompted still-image candidate with no pre-existing asset, so the image branch is exercised. |
| H-08 | Prompted insert without asset is silently ignored | **Fixed in code** | Render now rejects any prompted insert without an asset and requires generation or explicit removal. |
| H-09 | Renderer ignores cuts/captions/audio/motion/platform outputs | **Partial** | FFmpeg now renders SRT captions, accepts optional music mixing, preserves source-master duration, clamps insert windows, and supports image/video inserts. Semantic cuts, motion graphics, and platform variants remain. |
| H-10 | Project remains `RENDERING` after render | **Reclassified / intentional** | The state machine uses `RENDERING` as the state before the required `EVALUATE` event. The render row becomes `COMPLETED`; the project transitions to evaluation through the existing lifecycle. Add an explicit `AWAITING_EVALUATION` state only if the UI needs that distinction. |
| H-11 | OpenShorts assumes removed `.venv` | **Fixed in code** | Launcher now uses `OPENSHORTS_PYTHON`, `CREOZENTIC_PYTHON`, `PYTHON`, or platform Python. A fresh-clone worker smoke test is still required on the user’s Windows/Conda machine. |
| H-12 | Long operations are synchronous | **Pending** | Generation, worker execution, and rendering still await inside request handlers. Durable queued jobs with progress, retry, cancellation, and persisted stage state remain required. |

## Medium findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| M-01 | Hardcoded plan timing | **Partial** | Default beat and B-roll windows now clamp to verified source duration. A real Director/EDL planner is still needed to derive semantic timing from transcript words rather than fixed fallback beats. |
| M-02 | Caller duration can control render | **Fixed in code** | Render now derives duration from persisted extracted evidence and ignores caller duration for the normal editor path. |
| M-03 | Global `-shortest` may truncate output | **Fixed in code / fixture pending** | `-shortest` is no longer used by default; source duration is the master timeline. A short-insert media fixture remains to be added. |
| M-04 | Audio plan is metadata only | **Partial** | FFmpeg now accepts a music path and bounded volume mix. The editor still needs a real rights-cleared music asset resolver and loudness QA. |
| M-05 | Captions/motion graphics are metadata only | **Partial** | Persisted timed words are converted to SRT and passed to FFmpeg. Motion-graphics rendering remains pending. |
| M-06 | QA uses hardcoded claims | **Pending** | QA must inspect actual output probes, loudness, caption geometry, transcript alignment, rights, and platform dimensions. |
| M-07 | Render provenance incomplete | **Partial** | Source/visual asset hashes and renderer version are persisted. Prompt hashes, provider request IDs, worker commits, and exact renderer command still need persistence. |
| M-08 | Approval role/transition policy | **Partial** | Workspace/project scoping is fixed. Product decision is still required on whether visual approval requires `EDITOR` or `REVIEWER`; add authorization integration tests. |
| M-09 | Registry status is not health status | **Pending** | Add dependency, model, entrypoint, and produced-artifact health fields. |
| M-10 | Static Graphify edges can be mistaken for runtime edges | **Pending** | Viewer/report should distinguish static edge type, confidence, and runtime health evidence. |
| M-11 | Smoke test assumes a running server | **Pending** | Start a test server automatically or document a reliable two-terminal smoke procedure. |

## Low findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| L-01 | Documentation overstates completion | **Fixed in documentation** | The audit and this matrix separate structural coverage from runtime activation. |
| L-02 | Graph can become stale | **Partial** | Regeneration scripts exist; source revision/checksum and automated CI freshness enforcement remain pending. |
| L-03 | Exact provider model IDs optional | **Pending** | Production startup should reject missing model and model-version identity for AI assets. |
| L-04 | Tests are contract-focused | **Partial** | Unit coverage increased from 30 to 32 and security paths are covered. Real database/provider/worker/FFmpeg end-to-end tests remain pending. |

## Current capability matrix

| Capability | Current status |
|---|---|
| Source upload and secure path handling | **Fixed in code; deployment root configuration required** |
| FFmpeg/ffprobe metadata and basic render | **Working** |
| SceneDetect/OpenCV | **Working when dependency is installed** |
| Required transcription | **Blocked until original worker/provider is configured** |
| OCR | **Blocked until original OCR worker/model is configured** |
| Speaker diarization | **Blocked until pyannote/original worker is configured** |
| Director LLM | **Fallback only; real model/provider pending** |
| Still B-roll | **Branch and approval wiring fixed; image provider/checkpoint pending** |
| Moving B-roll | **Branch and still fallback fixed; video provider/model pending** |
| Approval and tenant scope | **Scope fixed; role policy integration test pending** |
| Captions | **SRT render path implemented; visual golden test pending** |
| Audio mix/music ducking | **Bounded music-mix path implemented; rights/loudness integration pending** |
| Final QA | **Deterministic contract only; real output inspection pending** |
| Graphify architecture map | **Complete static artifact; runtime evidence distinction pending** |
| Durable job execution | **Pending** |

## Overall result

The second remediation pass added evidence-derived caption generation, verified-duration rendering, source-master timeline behavior, and a bounded music-mix contract. The suite remains at **32 passing tests** with TypeScript, guide, and OSS checks passing. The remaining items are not all solvable by editing TypeScript alone: real transcription, image generation, video generation, diarization, OCR, and high-quality composition require original worker environments, exact model weights or providers, credentials, and runtime fixtures. The matrix intentionally keeps those items visible as external or pending instead of falsely marking them complete.
