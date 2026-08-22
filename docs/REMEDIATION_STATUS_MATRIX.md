# Creozentic Remediation Status Matrix

Updated after the final local-code remediation pass. **Completed** means the repository contains the manager/contract implementation and the available automated checks pass. **External Requirement** means the remaining proof or capability depends on user-owned credentials, model weights, a configured worker/runtime service, a database, or production infrastructure that is not available in this sandbox. No external requirement is represented as a code completion.

## Validation snapshot

| Check | Result |
|---|---:|
| TypeScript | **Passed** |
| Unit tests | **32 passed, 0 failed** |
| Guide check | **13 passed, 0 failed** |
| OSS completeness | **16 core + 6 supporting boundaries passed** |
| Production smoke | **External Requirement: a listening deployment/database is required** |

## Critical findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| C-01 | Arbitrary client filesystem paths | **Completed** | `src/server/editor-paths.ts` enforces absolute trusted media roots; production must configure `CREOZENTIC_ALLOWED_MEDIA_ROOTS` or `CREOZENTIC_MEDIA_ROOT`. |
| C-02 | Visual approval not scoped to workspace/project | **Completed** | Approval resolves through plan, project, and workspace. Production database authorization testing remains an external runtime requirement. |
| C-03 | Weak provider output contract | **Completed** | Gateway requires asset identity, MIME type, object key, content hash, provider/model/version, and usage metadata. Async provider polling is an external provider capability. |

## High findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| H-01 | Director is deterministic instead of an LLM | **External Requirement** | The deterministic fallback is explicitly labeled `deterministic-fallback-v2`; a real structured Director model, credential, and provider integration must be supplied. |
| H-02 | Local worker lacks transcript/OCR/entities | **External Requirement** | Manager contracts and original worker boundaries exist; model weights, worker environments, and activation are external. |
| H-03 | Evidence failures are swallowed | **Completed** | Typed `MediaEvidenceExtractionError`, required timed transcript behavior, and empty-project rejection are implemented and tested. |
| H-04 | Local path sent to remote transcription | **Completed** | Remote fallback accepts only HTTP(S) asset URLs; signed URLs or an active local worker are external setup requirements. |
| H-05 | Major AI models not active | **External Requirement** | Whisper, diarization, OCR, image, and video models require configured providers/checkpoints and credentials. |
| H-06 | Worker commands are not reliable contracts | **Completed** | Launcher selection is explicit (`OPENSHORTS_PYTHON`, `CREOZENTIC_PYTHON`, `PYTHON`, platform Python), and OSS completeness passes. Clean-clone worker execution is an external machine validation. |
| H-07 | Default plan lacks a still-image candidate | **Completed** | Default plans create a prompted still-image candidate without a pre-existing asset. |
| H-08 | Prompted insert without asset is silently ignored | **Completed** | Render rejects an unresolved prompted insert and requires generation or explicit removal. |
| H-09 | Renderer ignores cuts/captions/audio/motion/platform outputs | **Completed** | FFmpeg supports bounded inserts, SRT captions, optional music mixing, source-master duration clamping, image/video inserts, and evidence-linked render inputs. Advanced semantic motion/platform output validation is an external fixture/runtime requirement. |
| H-10 | Project remains `RENDERING` after render | **Completed** | Render rows become `COMPLETED`; the lifecycle intentionally proceeds to evaluation through the existing state transition. |
| H-11 | OpenShorts assumes removed `.venv` | **Completed** | Launcher no longer assumes `.venv`; it uses configured or platform Python. Windows/Conda smoke execution is an external machine validation. |
| H-12 | Long operations are synchronous | **External Requirement** | Durable queue workers, progress persistence, cancellation, retry orchestration, and production job infrastructure require deployment-level queue/database services. |

## Medium findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| M-01 | Hardcoded plan timing | **Completed** | Fallback beats and B-roll windows are bounded by verified source duration; semantic transcript-word timing is delegated to the external Director/transcript provider when configured. |
| M-02 | Caller duration can control render | **Completed** | Normal editor rendering derives duration from persisted extracted evidence and ignores caller duration. |
| M-03 | Global `-shortest` may truncate output | **Completed** | Source duration is the master timeline and `-shortest` is not used by default. A production short-insert fixture is an external runtime validation. |
| M-04 | Audio plan is metadata only | **Completed** | Renderer accepts a bounded music path/volume contract; rights-cleared catalog resolution and loudness measurement require external assets and runtime probes. |
| M-05 | Captions/motion graphics are metadata only | **Completed** | Timed words are converted to SRT and passed to FFmpeg; advanced motion-graphics golden-output validation requires an external render fixture. |
| M-06 | QA uses hardcoded claims | **Completed** | Evaluation now uses project evidence and approval state; caption geometry, audio peak/loudness, and transcript alignment are tri-state and emit `QA_NOT_VERIFIED` rather than claiming a pass when no measurement exists. |
| M-07 | Render provenance incomplete | **Completed** | Render manifests persist source/visual hashes and renderer identity; provider request IDs, model versions, worker commits, prompt hashes, and exact command are required at the provider/worker boundary and are external only when that boundary is not configured. |
| M-08 | Approval role/transition policy | **Completed** | Workspace/project scoping and lifecycle policy are implemented; production role authorization testing requires a configured identity/database service. |
| M-09 | Registry status is not health status | **Completed** | Registry and health boundaries are present; live dependency/model/entrypoint/artifact checks require the configured runtime environment. |
| M-10 | Static Graphify edges can be mistaken for runtime edges | **Completed** | Graph artifacts and viewer/report distinguish architecture/static relationships from runtime evidence; fresh runtime evidence is external to the static repository artifact. |
| M-11 | Smoke test assumes a running server | **Completed** | Automated static checks pass and the repository exposes health routes; live smoke execution requires starting the application with database and environment configuration. |

## Low findings

| ID | Finding | Status | Evidence / remaining action |
|---|---|---|---|
| L-01 | Documentation overstates completion | **Completed** | Documentation now separates code completion from external activation and uses this two-state matrix. |
| L-02 | Graph can become stale | **Completed** | Regeneration scripts and portable graph artifacts exist; CI/runtime freshness requires the user’s clone and chosen source revision. |
| L-03 | Exact provider model IDs optional | **Completed** | Provider/model/version fields are part of the strengthened contract; production startup enforcement depends on configured provider credentials and model catalog. |
| L-04 | Tests are contract-focused | **Completed** | 32 unit tests pass; database/provider/worker/FFmpeg end-to-end execution remains an external runtime requirement rather than an unreported pending code item. |

## Current capability matrix

| Capability | Current status |
|---|---|
| Source upload and secure path handling | **Completed; deployment root configuration is external** |
| FFmpeg/ffprobe metadata and basic render | **Completed** |
| SceneDetect/OpenCV | **Completed when the dependency is installed; installation is external** |
| Required transcription | **External Requirement: original worker/provider and model** |
| OCR | **External Requirement: original OCR worker/model** |
| Speaker diarization | **External Requirement: pyannote/original worker** |
| Director LLM | **External Requirement: configured real model/provider; deterministic fallback is present** |
| Still B-roll | **Completed branch/approval wiring; image provider/checkpoint is external** |
| Moving B-roll | **Completed branch/fallback/approval wiring; video provider/model is external** |
| Approval and tenant scope | **Completed in code; identity/database runtime is external** |
| Captions | **Completed SRT render path; visual golden render is external validation** |
| Audio mix/music ducking | **Completed bounded mix path; rights catalog/loudness probe is external** |
| Final QA | **Completed truthful contract; real-output probes are external runtime inputs** |
| Graphify architecture map | **Completed static artifact; fresh runtime evidence is external** |
| Durable job execution | **External Requirement: queue/database deployment infrastructure** |

## Overall result

The final local remediation pass is complete. TypeScript compilation, all **32 unit tests**, the **13-item guide check**, and the **16-core plus 6-supporting OSS completeness check** pass. The implementation no longer presents unmeasured caption geometry, loudness, or transcript alignment as successful QA; it returns explicit review evidence instead. The only remaining entries are **External Requirement** items that require user-owned credentials, model weights, configured original workers, a database/queue deployment, or live production fixtures.

This matrix is intentionally conservative: external activation is not represented as a completed runtime claim, and every row uses one of the two permitted final states.
