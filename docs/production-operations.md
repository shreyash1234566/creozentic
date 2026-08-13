# Production operations and provider contracts

The application now persists the remaining production workflows instead of returning UI-only demo results.

## Provider contracts

The following adapters are intentionally credential-independent. Each endpoint receives workspace-scoped asset IDs/object keys, a stable idempotency key where applicable, and must return the documented result shape already enforced by the server:

- `CREATIVE_PROVIDER_URL` or `CREATIVE_PROVIDER_ENDPOINTS`: image/video/voice model gateway.
- `MEDIA_ANALYSIS_PROVIDER_URL`: transcription, timestamps, speakers, faces, scenes, loudness, and semantic labels.
- `OCR_PROVIDER_URL`, `MASKING_PROVIDER_URL`, `INTEGRITY_PROVIDER_URL`, `MALWARE_SCAN_PROVIDER_URL`: safety/intelligence gates.
- `BILLING_STRIPE_CHECKOUT_URL`, `BILLING_RAZORPAY_CHECKOUT_URL`, and corresponding `*_REFUND_URL` adapters.
- `CUSTOM_MODEL_TRAIN_URL`: rights-checked training job submission and status lifecycle.
- `CUSTOM_MODEL_TRAIN_STATUS_URL`: polling for external training progress, metrics, model version, and terminal status.
- `ENTERPRISE_SSO_VALIDATE_URL`: assertion validation for enforced enterprise SSO.
- `MEDIA_RENDERER_URL`: production video, captions, b-roll, audio, lip-sync, and deterministic media-job execution. Local FFmpeg is development-only.
- `PUBLISH_<PLATFORM>_URL`: approval-gated publication adapters. Daily Autopilot publishes through durable per-entry jobs with provider receipts and idempotency keys.

Without these credentials the app does not claim to have generated production-quality imagery, performed semantic masking/OCR, charged a card, trained a model, or validated SSO. Local mode performs only verifiable storage, checksum/signature, FFprobe, FFmpeg, deterministic layout, rights, consent, idempotency, and lifecycle operations.

## Operations endpoints

- `POST /api/v1/ops/backups` with `{ "kind": "METADATA" | "DATABASE" }` creates a durable backup record and local/object-storage artifact. Set `PG_DUMP_PATH` for database dumps.
- `POST /api/v1/ops/backups/:backupId/verify` reads the artifact and verifies its checksum; remote S3-compatible storage is supported.
- `GET/POST /api/v1/launch-evidence` stores customer interviews, paid-beta observations, human ratings, benchmark evidence, and launch-gate results. These are intentionally marked `PENDING` until a human records the evidence.
- `POST /api/v1/media-analysis` with an asset ID stores FFprobe analysis locally and upgrades to transcription/face/speaker/scene analysis when `MEDIA_ANALYSIS_PROVIDER_URL` is configured.
- `POST /api/v1/ugc/projects` creates a consent-aware brief/three-hook shot plan; `/analyze` records transcript/scene/speaker/face capability results; `/render` refuses production rendering until the required analysis is available.
- `POST /api/v1/custom-models/:projectId/train` submits an approved dataset to the configured training provider. Local mode is explicitly `PREPARATION_ONLY`, never an invented trained model.

Before enabling enterprise SSO, configure and test the validator, otherwise administrators can lock themselves out. Before enabling live billing or publishing, configure webhook signature secrets and provider adapters, then run replay/idempotency tests.

## Daily Creative Autopilot

The daily wedge is persisted in the following sequence:

`REQUESTED → NEEDS_INPUT / PLANNED → PRODUCING → QA / REPAIR_REQUIRED → PENDING_APPROVAL → APPROVED → PUBLISH_PENDING → DELIVERED`.

- `POST /api/v1/daily-plans` creates one tenant-scoped plan per brand/date; the default is `APPROVAL`.
- `POST /api/v1/daily-plans/:planId/run` executes the verified deterministic composition path and records agent runs, budgets, QA failures, and events.
- `POST /api/v1/daily-plans/:planId/approve` records reviewer approval; `POST .../revise` preserves source/product nodes for targeted revisions.
- `POST /api/v1/daily-plans/:planId/export` creates a checksummed delivery manifest containing evidence IDs, copy, alt text, disclosure, asset checksums, and publication metadata.
- `POST /api/v1/creative-requests` is the canonical request surface for dashboard/chat/WhatsApp intake. Connector messages are stored as requests; they do not bypass approval.
- `POST /api/v1/autonomy-policies` stores versioned per-brand/content/channel permissions. Guarded autopublish requires an administrator-approved policy and never applies to synthetic testimonials, new offers, or regulated claims.
- `GET /api/v1/agent-runs?planId=...` exposes the durable trace for debugging, “why” explanations, and customer support.
- `POST /api/v1/schedules/tick` is the protected deployment-cron entry point. Set `SCHEDULE_CRON_SECRET` and send it as `x-cron-secret` or a bearer token.
- `GET/POST /api/v1/content-calendar` creates and lists a durable weekly calendar; `PATCH /api/v1/content-calendar/:entryId` edits or locks an entry.
- `GET /api/v1/agency/queue` and `GET /api/v1/agency/metrics` expose pending approvals, blocked work, turnaround, revisions, delivery, and margin inputs.
- `POST /api/v1/daily-plans/:planId/publish` creates one receipt-backed publication job per approved manifest entry. TikTok requires creator information, consent, and an explicit metadata audit; WhatsApp sends require an open service window or approved template.

Credential-independent local mode verifies tenant isolation, product evidence, deterministic layout, checksums, approval state, and idempotency. Production model quality, OCR/masking, live connectors, and publishing still require the adapters listed above.
