# Creozentic Uploaded-Video Workflow Failure Audit

## Executive verdict

The project has a substantial **structural architecture map** and a tested manager-layer contract, but the complete uploaded-video editing workflow is **not production-ready and is not yet proven end to end**.

The strongest evidence is mixed. The TypeScript compiler passes, the unit suite passes **30/30**, the guide check passes **13/13**, and the OSS completeness check passes **16 core + 6 supporting boundaries**. However, those checks mostly validate contracts and deterministic helpers. The production smoke test fails immediately with `ECONNREFUSED 127.0.0.1:3000` when the application server is not running, and the real worker/model path is still incomplete.

The Graphify graph contains **139,909 nodes and 352,997 edges**, but a graph edge is not proof of runtime execution. Many edges are `references`, `contains`, or static `calls`; the graph does not prove that a dependency is installed, a model exists, a provider is configured, or a worker has produced a real output.

> **Conclusion:** the architecture is partially wired and testable at the contract level, but the real workflow currently fails open in several places, uses deterministic placeholder planning, lacks active transcription/OCR/diarization/generation models, and has security and render-contract defects that must be fixed before claiming full functionality.

## Evidence base

This audit used the following local evidence:

| Evidence | Result |
|---|---:|
| `docs/GRAPH_WORKFLOW_AUDIT.json` | 139,909 nodes; 352,997 edges; 30 source groups. |
| `docs/SOURCE_FIRST_STATUS_LEDGER.json` | Original-worker activation states and blockers. |
| `src/server/editor.ts` | Actual analyze, plan, generation, approval, and render call sites. |
| `src/server/editor-evidence.ts` | Evidence-worker invocation and transcription fallback. |
| `apps/worker/media_analysis.py` | Actual local media-analysis output contract. |
| `src/server/gateway.ts` | Provider capability and creative-result contract. |
| `src/server/open-source-editing.ts` | Original-worker registry and launcher. |
| `src/server/editor-render.ts` | Actual FFmpeg filter and output implementation. |
| `pnpm exec tsc --noEmit` | Passed. |
| `pnpm test:unit` | 30 passed, 0 failed. |
| `pnpm guide:check` | 13 passed, 0 failed. |
| `pnpm oss:check` | 16 core + 6 supporting boundaries passed. |
| `pnpm test:production-smoke` | Failed because no server was listening on `127.0.0.1:3000`. |

## Severity scale

| Severity | Meaning |
|---|---|
| **Critical** | Can cause security compromise, data loss, invalid output, or complete workflow failure. Fix before exposing the application. |
| **High** | A required workflow stage is absent, incorrectly connected, or likely to fail in normal use. Fix before claiming an end-to-end editing product. |
| **Medium** | Causes incorrect behavior, stale state, poor reliability, or incomplete quality. Fix before production. |
| **Low** | Documentation, observability, or maintainability issue that does not immediately stop the core path. |

## Critical findings

### C-01 — User-controlled filesystem paths are not restricted to workspace storage

**Evidence:** `src/server/editor.ts:468-470` passes `input.assetPath` directly to `extractMediaEvidence`; `src/server/editor.ts:832-855` accepts `input.sourcePath` and `input.outputPath` directly; `src/server/editor-evidence.ts:112-115` passes the path to a child process; `src/server/editor-render.ts:28-30` validates only that the output path does not contain `..`.

**Failure:** A caller can provide an absolute local path. The media worker can probe files outside the workspace, and FFmpeg can write to an arbitrary writable absolute path. On a server, this can expose local files or overwrite sensitive files. The `..` check is not sufficient because `/tmp/other-file` and `C:\...` do not contain `..`.

**Required fix:** Accept only verified workspace object IDs or server-issued temporary paths. Resolve and canonicalize paths, enforce an allowed root, reject symlinks escaping the root, and never accept arbitrary output paths from the client. Add tests for absolute paths, Windows drive paths, symlinks, and path traversal.

### C-02 — Visual-insert approval is not scoped to workspace and project

**Evidence:** `src/server/editor.ts:808-814` updates `db.visualInsert` by `id` only. The action requires the `EDITOR` role but does not verify that the insert belongs to `projectId` or `context.workspaceId`.

**Failure:** If a user can obtain another visual-insert ID, they may approve an asset belonging to another project or workspace. This breaks tenant isolation and approval provenance.

**Required fix:** Query through the project and workspace relationship, for example `where: { id, plan: { project: { id: projectId, workspaceId }}}`, and require the correct reviewer/editor role for the approval type. Add a cross-workspace negative test.

### C-03 — The provider result validator is weaker than the editor’s storage contract

**Evidence:** `src/server/gateway.ts:151-171` validates only `assetId` and `mimeType` for each output. `src/server/editor.ts:697-705` additionally requires `objectKey`, `contentHash`, workspace ownership, and a compatible MIME type.

**Failure:** A provider can pass gateway validation and then fail later inside the editor. This produces a confusing late failure and can leave provider work untracked. Job-based providers that return a task ID rather than a ready object also cannot satisfy the synchronous editor contract.

**Required fix:** Define one shared `CreativeOutput` schema requiring storage provenance, content hash, MIME type, and readiness state, or explicitly implement asynchronous job polling. Validate the complete contract at the gateway boundary and test image success, video success, malformed output, pending job, and timeout cases.

## High findings

### H-01 — The Director is not actually an LLM in the current editor path

**Evidence:** `src/server/editor.ts:563-633` calls `planInput`, and `planInput` at `src/server/editor.ts:42-299` creates fixed beats, hooks, captions, and visual inserts deterministically. It returns `modelVersions: { planner: "deterministic-v2" }`.

**Failure:** The documented “LLM Director creates EditPlan” stage is not active. Every project receives essentially the same five-beat structure with interpolated objective/audience text. It does not analyze transcript meaning, select real moments, or reason over B-roll gaps.

**Required fix:** Add a real Director adapter with a versioned structured-output schema, transcript/evidence input, timeout/retry handling, model/provider provenance, and a deterministic fallback explicitly labeled as fallback. Do not report `deterministic-v2` as an LLM result.

### H-02 — The local media-analysis worker does not provide the evidence claimed by the workflow

**Evidence:** `apps/worker/media_analysis.py` returns media metadata, audio windows, and optional scene boundaries. Its current output has empty transcript words, detected entities, and OCR regions. `src/server/editor-evidence.ts:145-149` reads those fields, but they are empty unless another provider fills them.

**Failure:** The workflow diagram implies transcription, OCR, entity/face analysis, and diarization. The local worker currently supplies none of those. The graph contains related source concepts, but the live evidence bundle does not.

**Required fix:** Delegate each capability to a verified original worker with a documented JSON contract, or mark it optional in the EditPlan. Do not mark evidence ready when required transcript evidence is absent.

### H-03 — Evidence extraction fails silently and can advance with empty evidence

**Evidence:** `src/server/editor-evidence.ts:110-120` catches every worker error and replaces the payload with `{}`. `src/server/editor.ts:476-480` returns an empty evidence array when neither asset IDs nor extracted evidence exist, then `src/server/editor.ts:559-560` advances to `EVIDENCE_READY`.

**Failure:** Missing Python, wrong worker path, timeout, malformed JSON, missing FFmpeg, and real processing errors all become indistinguishable from “no evidence.” The project can proceed to planning with no transcript and no valid source evidence.

**Required fix:** Return a typed failure with stage, command, exit code, stderr tail, and retryability. Require a verified source asset and minimum evidence contract before `EVIDENCE_READY`. Allow an explicit “metadata-only” mode only when the user selects it.

### H-04 — The transcription fallback sends a local filesystem path to a remote provider

**Evidence:** `src/server/editor-evidence.ts:125-128` calls `speech.transcribe({ assetUrl: input.assetPath, ... })` when local transcript words are absent.

**Failure:** A hosted provider normally cannot fetch a local server path such as `E:\...` or `/tmp/...`. The request may fail, or a provider may interpret the path incorrectly. It also does not prove that the original CutScript/FunClip/Faster-Whisper worker was used.

**Required fix:** Upload the source to authorized object storage and pass a signed URL, or run the original local speech worker. Record the provider and model only after successful timed-word output.

### H-05 — No real transcription, diarization, OCR, image, or video model is active by default

**Evidence:** The status ledger marks most original workers pending. `gateway.ts:244-251` local fallback supports only `image.generate` and `image.edit`; it creates SVG placeholders at `gateway.ts:254-309` and does not support `video.generate`. The planned model IDs are not fully configured in the runtime provider configuration.

**Failure:** The workflow can be structurally invoked but cannot produce the intended quality assets or transcript until external providers, credentials, model IDs, checkpoints, and worker environments are configured.

**Required fix:** Add a startup capability report that clearly lists provider, exact model, credential status, checkpoint status, and test status for every stage. Block production mode when a required capability is absent; permit development fallback only with visible labeling.

### H-06 — The original-worker launcher contains commands that are not reliable worker contracts

**Evidence:** `src/server/open-source-editing.ts:172-188` hardcodes entrypoints. OpenShorts uses `./.venv/bin/python`, but the vendored cleanup removed that `.venv`. AI-Broll invokes Jupyter `nbconvert` on a notebook rather than a production asset-generation CLI. VideoClipper, OpenChatCut, and Twick use long-running `pnpm dev` commands. VideoDB Director requires Docker. Temporal requires a `temporal` executable. Several commands are not known to emit the JSON/artifact contract the manager expects.

**Failure:** Registry presence is mistaken for executable integration. On Windows, the OpenShorts Unix path is invalid. On a clean clone, many commands fail immediately or never return a media result.

**Required fix:** Give each worker an explicit adapter contract: command, working directory, input schema, output schema, timeout, health check, and environment activation. Remove non-worker applications from the “callable worker” list or classify them as services. Use platform-specific launchers and isolated environments.

### H-07 — The default plan does not actually create a still-image candidate

**Evidence:** `src/server/editor.ts:128-149` creates the first still decision but sets `prompt: null`. `generateEditorVisualInserts` at lines 645-654 filters out inserts without a nonempty prompt. The second metaphor insert has a prompt and requires motion, so the default generated branch is moving video.

**Failure:** The intended still-image path is not exercised by the default plan. If moving-video generation is unavailable, fallback can produce a still image for the moving candidate, but that is not the same as the agent intentionally selecting still B-roll based on a real gap.

**Required fix:** Make the Director output explicit B-roll candidates with prompt, gap, media decision, and evidence IDs. Add a real default still candidate test and a real moving candidate test.

### H-08 — Render silently ignores prompted inserts that have no asset

**Evidence:** `src/server/editor.ts:874-887` defines `generatedInserts` as every prompted insert, but `pending` includes only inserts with `assetSource`. A prompted insert without an asset is not rejected. `assetIds` includes only approved inserts with assets.

**Failure:** The EditPlan can request B-roll, generation can be skipped or fail without being recorded, and rendering can proceed without the planned insert. This violates the intended “generate, approve, insert” contract.

**Required fix:** If an insert has a prompt and a selected generated media type, require either a ready approved asset or an explicit `NONE`/fallback decision. Add a state such as `GENERATION_FAILED` with reason and block rendering unless the fallback is approved.

### H-09 — Final FFmpeg rendering does not implement the features promised by the EditPlan

**Evidence:** `src/server/editor-render.ts:27-99` scales/pads the source, overlays images/videos, maps the first optional audio stream, and encodes MP4. It does not cut selected moments, burn captions, apply word-level timing, mix music, duck audio, render motion graphics, perform OCR overlays, or create multiple platform variants.

**Failure:** The plan contains EDL, OTIO, caption, audio, motion-graphics, and platform concepts, but the final renderer ignores most of them. A rendered file can be technically valid while missing the core editing features.

**Required fix:** Define the supported render contract explicitly. Either implement each planned operation through an original composition worker/FFmpeg filter graph or remove it from the claimed completion path. Add golden-file tests for captions, cuts, audio mix, image insert, video insert, and output variants.

### H-10 — The render state is left at `RENDERING` after successful synchronous completion

**Evidence:** `src/server/editor.ts:959-971` updates the render row to `COMPLETED`, but `src/server/editor.ts:978` updates the project state to `RENDERING` after the render finishes.

**Failure:** Project state and render state disagree. UI and downstream jobs may believe rendering is still running forever, and later transitions may be rejected.

**Required fix:** Transition to an explicit completed state such as `RENDERED` or `AWAITING_EVALUATION` after the render row is completed. Add a test asserting both states after success and `FAILED` after failure.

### H-11 — OpenShorts source-first execution is broken after cleanup

**Evidence:** `open-source-editing.ts:173` invokes `./.venv/bin/python`, but the clean vendored repository intentionally removed `third_party/openshorts/.venv` to reduce the repository from approximately 8.6 GB to approximately 848 MB.

**Failure:** Enabling `SOURCE_FIRST_EDITOR_ENGINE=openshorts` on a fresh clone fails before `main.py` runs.

**Required fix:** Use an explicit `OPENSHORTS_PYTHON` environment variable pointing to the activated Conda/venv interpreter, or invoke a platform-neutral worker launcher. Add a fresh-clone smoke test.

### H-12 — The workflow is synchronous where generation and editing should be job-based

**Evidence:** `generateEditorVisualInserts` awaits provider execution in a request loop at `editor.ts:657-696`; render awaits FFmpeg in the same mutation at `editor.ts:922-927`; the worker launcher waits in a child process at `open-source-editing.ts:218-234`.

**Failure:** Long transcription, generation, and rendering operations can exceed HTTP timeouts, duplicate on client retries, and hold server resources. The UI cannot reliably show progress or resume a partial stage.

**Required fix:** Use a durable job state machine/queue with idempotent stage keys, progress, retry policy, cancellation, and persisted artifacts. Keep the HTTP mutation responsible for enqueueing, not waiting for a 15-minute generation/render.

## Medium findings

### M-01 — Plan timing is hardcoded and can exceed source duration

**Evidence:** `planInput` always creates beats from 0 to 18 seconds, builds an OTIO timeline of 30 seconds at line 170, and uses fixed visual windows from 0–3 and 3–7 seconds.

**Failure:** A 4-second upload receives an 18/30-second plan. A long upload is not edited from actual selected moments. Timing can be out of bounds or semantically unrelated to speech.

**Fix:** Derive all ranges from validated media duration and transcript words. Clamp every clip to the source duration and test short, empty-audio, variable-frame-rate, and long inputs.

### M-02 — `durationSec` defaults to zero and may omit the intended output limit

**Evidence:** `editor.ts:924-926` passes `Number(input.durationSec ?? 0) || undefined`; the renderer only adds `-t` when `input.durationSec` is truthy.

**Failure:** The renderer may output the full source even when the EditPlan is bounded, or may use a duration supplied by the caller instead of verified media duration.

**Fix:** Use the verified evidence duration, not a caller-supplied duration, and make timeline duration a required render-manifest field.

### M-03 — `-shortest` can truncate the final output when a video B-roll input is shorter

**Evidence:** `editor-render.ts:75-87` applies `-shortest` globally while adding video insert inputs.

**Failure:** FFmpeg may stop when the shortest input ends, truncating the source video/audio rather than only ending the overlay. This is especially likely for short generated B-roll.

**Fix:** Use explicit input looping/trim behavior and map a source-duration master timeline. Add a fixture with a 2-second B-roll clip over a 30-second source.

### M-04 — Audio plan is metadata only

**Evidence:** `planInput` creates ducking, music, and voice settings at `editor.ts:240-244`, but `editor-render.ts` maps only the source audio and does not use those fields.

**Failure:** The final video does not implement the promised music ducking, rights-cleared music insertion, clipping target, or voice mix.

**Fix:** Pass an explicit audio render plan to FFmpeg or an original composition worker and test the resulting audio streams/levels.

### M-05 — Captions and motion graphics are metadata only

**Evidence:** `planInput` creates word-emphasis captions and motion-graphics objects at `editor.ts:220-238` and `245-253`; `renderEditorVideo` has no caption or motion-graphics inputs.

**Failure:** The rendered output does not contain the planned captions, safe zones, proof cards, or CTA cards.

**Fix:** Generate subtitle/ASS/HTML/Remotion assets through a real composition stage and include them in the render manifest.

### M-06 — QA reports deterministic claims instead of inspecting the rendered media

**Evidence:** `editor.ts:986-997` calls `runSpecializedJudges` with hardcoded values such as `captionsInsideSafeZone: true`, `audioClipping: false`, `transcriptMatches: true`, and `rightsApproved: true`.

**Failure:** QA can approve a render without opening the output, checking audio, comparing transcript timing, or validating rights evidence.

**Fix:** QA must consume real render probes, waveform/loudness data, caption geometry, transcript alignment, asset rights metadata, and optionally a vision review. Hardcoded booleans must be removed from production QA.

### M-07 — Render provenance is incomplete

**Evidence:** The render row is created with empty `sourceAssetChecksums`, `modelVersions`, and `providerIds` at `editor.ts:818-829`. The final update stores source and visual asset IDs but not all provider/model outputs.

**Failure:** Reproducibility and auditability are weakened. It may be impossible to determine exactly which model, prompt, provider, and source checksum produced an export.

**Fix:** Persist the complete render manifest, asset hashes, provider request IDs, model IDs/versions, prompt hashes, worker commit, and renderer command/version.

### M-08 — Approval role and transition rules are inconsistent

**Evidence:** `visual-inserts/approve` is handled under `requireRole(context, "EDITOR")` at `editor.ts:781-814`, while final approval requires `REVIEWER` at `editor.ts:1049-1064`.

**Failure:** The intended human-approval boundary may be bypassed by an editor role, depending on product policy. The state transition for visual approval is also not checked by `transitionOrThrow`.

**Fix:** Define approval roles and transitions explicitly, scope each approval to the current plan version, and add authorization tests.

### M-09 — Source-first registry status is not execution status

**Evidence:** `getOpenSourceEditingStatus` only checks whether a path exists and whether an activation environment variable equals `true` at `open-source-editing.ts:190-197`.

**Failure:** A present folder plus `*_REFERENCE_ENABLED=true` can look active even when dependencies, models, commands, or licenses are missing.

**Fix:** Separate `sourcePresent`, `enabled`, `dependencyHealthy`, `modelReady`, `entrypointHealthy`, and `producedArtifact` states. Never use `enabled` as proof of activation.

### M-10 — Graphify contains high-volume static/reference edges that can mislead implementation decisions

**Evidence:** `docs/GRAPH_WORKFLOW_AUDIT.json` has 72,291 `references`, 54,127 `contains`, and 52,558 `method` edges. The graph includes large Temporal internals and external worker source groups.

**Failure:** A user or Claude Code may interpret a `references` or `conceptually_related_to` edge as a runtime call. The graph is useful for navigation but not sufficient for execution proof.

**Fix:** Display edge type and confidence prominently, separate runtime-verified edges from static edges, and attach health evidence to worker nodes.

### M-11 — Production smoke testing requires a running server but the default command does not start one

**Evidence:** `pnpm test` runs `pnpm test:unit && pnpm test:production-smoke`; `production-smoke.ts` fetches `127.0.0.1:3000`. The audit run failed with `ECONNREFUSED` because no server was running.

**Failure:** A clean user can follow the documented test command and receive a failure unrelated to source correctness.

**Fix:** Make the smoke script start/stop a test server, or document a required second terminal and change the test command to verify readiness first.

## Low findings

### L-01 — Documentation overstates completion

The graph and completeness scripts report broad coverage while most original workers remain pending. The report must keep structural coverage and runtime activation in separate columns.

### L-02 — The Graphify raw graph is an artifact, not a source of truth

`graph.json.gz` must be regenerated after source changes. A stale graph can cause Claude Code to inspect old relationships. Add a source revision/checksum and graph-generation timestamp to the artifact manifest.

### L-03 — Provider model IDs remain optional at runtime

A generic `modelRef` boundary exists, but a provider can be configured without an exact model/version. Production should reject missing model identity for AI-generated assets.

### L-04 — The current tests are too contract-focused

The 30 passing unit tests cover normalization, policy, lifecycle, and deterministic functions. They do not exercise real provider responses, Python subprocess failure, asset storage, FFmpeg output, captions, audio, or cross-tenant approval.

## Workflow stage verdict

| Workflow stage | Structural status | Runtime status | Verdict |
|---|---|---|---|
| Upload/source verification | Present | Path-based and insufficiently restricted | **Unsafe until fixed** |
| FFmpeg/ffprobe | Present | Verified in fixture path | **Partially working** |
| Transcription | Boundary present | No local worker transcript; fallback path is not reliably reachable | **Not active** |
| SceneDetect/OpenCV | Delegated worker path | Fixture-tested | **Working when dependency is installed** |
| OCR | Schema/normalizer present | Worker returns empty OCR | **Not active** |
| Speaker diarization | Mentioned in provider/worker plan | No active model/runtime | **Not active** |
| LLM Director | Interface/documentation exists | Deterministic planner is used | **Not implemented as claimed** |
| B-roll decision | Policy and branch logic present | Unit-tested; default plan does not create a true still candidate | **Partially working** |
| Still-image generation | Provider boundary and local SVG fallback | No production image model/checkpoint | **Development fallback only** |
| Moving-video generation | Provider boundary and fallback | No active video model/worker | **Not active** |
| Approval | Database state exists | Workspace/project scoping defect | **Unsafe until fixed** |
| FFmpeg final render | Image/video overlay path exists | Does not render captions/cuts/audio plan/motion graphics | **Partial renderer only** |
| QA | Deterministic judge path exists | Uses hardcoded evidence booleans | **Not trustworthy for production** |
| Graphify | Complete static map | Not runtime proof | **Useful navigation/index only** |

## Mathematical consistency checks

The following invariants should hold for every successful job:

1. **Timeline bound:** for every clip, `0 <= startSec < endSec <= verifiedSourceDuration`.
2. **Approval invariant:** every generated asset included in a render has `approvalState = APPROVED`, belongs to the same workspace and plan version, and has verified storage provenance.
3. **Media-type invariant:** an image insert must use an image MIME type; a moving insert must use a video MIME type; fallback must update the recorded decision and provenance.
4. **Evidence invariant:** `EVIDENCE_READY` requires a verified source and a valid evidence bundle, not merely a caught exception.
5. **Render invariant:** a `COMPLETED` render must have a readable output, content hash, stored object, and project state consistent with completion.
6. **Tenant invariant:** every project, asset, visual insert, approval, evidence row, and output lookup must be scoped to the request workspace.
7. **Reproducibility invariant:** a render manifest must identify source hashes, plan version, prompts, provider/model versions, worker commits, and renderer version.
8. **Runtime invariant:** a worker is active only if its entrypoint exits successfully on a fixture and produces the declared artifact schema.

The current implementation violates or does not prove invariants 1, 2, 4, 5, 6, 7, and 8 in the production path. The unit tests prove only portions of the policy and normalization logic.

## Remediation order

### First: security and correctness blockers

1. Restrict all input/output paths to verified workspace storage.
2. Scope visual-insert approval by workspace, project, plan, and role.
3. Make the provider output contract complete and shared.
4. Stop evidence extraction from failing open; require a valid source/evidence contract.
5. Fix OpenShorts interpreter selection for a clean clone.
6. Make the render state transition consistent.

### Second: make the workflow real

7. Replace deterministic planning with the configured structured-output Director, while retaining an explicit deterministic fallback.
8. Activate hosted/local Whisper and return timed words.
9. Activate still-image generation and verify a real image asset.
10. Activate moving-video generation or record the branch as externally blocked with a tested fallback.
11. Add true caption, cut, audio, and motion-graphics render stages or narrow the product contract.
12. Replace hardcoded QA booleans with inspection of real output evidence.

### Third: reliability and operations

13. Convert long-running stages to durable jobs with retries and progress.
14. Add end-to-end fixtures for each B-roll branch and FFmpeg output inspection.
15. Add worker health reports and exact model/provider identity.
16. Make production smoke start a test server or document a reliable two-terminal command.
17. Regenerate Graphify after source changes and include source revision/checksums.

## Final plain-English answer

The project is not garbage and the architecture map is useful, but the graph currently shows **what files mention or connect to one another**, not proof that every worker is working. The manager layer and policy tests are real. The media pipeline is only partially real.

The most serious problems are the unrestricted filesystem paths, unscoped approval update, silent evidence failure, missing real Director/transcription/generation models, broken clean-clone OpenShorts interpreter path, incomplete provider contract, incomplete FFmpeg feature implementation, hardcoded QA claims, and stale/render state inconsistencies.

After the critical and high findings are fixed and the original workers produce real fixtures, the project can be re-audited. Until then, the correct status is **contract-tested prototype with partial runtime activation**, not a fully working production editor.

## References

[1]: ../src/server/editor.ts "Creozentic editor orchestration"
[2]: ../src/server/editor-evidence.ts "Creozentic evidence extraction"
[3]: ../apps/worker/media_analysis.py "Creozentic delegated media-analysis worker"
[4]: ../src/server/gateway.ts "Creozentic creative provider gateway"
[5]: ../src/server/open-source-editing.ts "Creozentic source-first worker launcher"
[6]: ../src/server/editor-render.ts "Creozentic FFmpeg renderer"
[7]: ../docs/GRAPH_WORKFLOW_AUDIT.json "Graphify workflow audit"
[8]: ../docs/SOURCE_FIRST_STATUS_LEDGER.json "Source-first activation ledger"
[9]: ../tests/media-evidence.test.ts "Media evidence normalization tests"
[10]: ../package.json "Creozentic package scripts"
