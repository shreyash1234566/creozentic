# MASTER_GUIDE.md Completion Matrix

**Purpose:** This table is the execution checklist. No requirement is considered finished merely because a similarly named file exists. `Finished` means executable local code is present and verified. `Partial` means some code exists but the guide’s full contract is not met. `Missing` means the local-code requirement is not implemented. `External` means repository code can be prepared, but account resources/credentials or an external service must be supplied later.

## A. Global architecture and technology decisions

| ID  | Guide requirement                                                                                | Current status   | Evidence                                                | Required completion action                                                                                      |
| --- | ------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A1  | §1.1 selected stack: Next, TypeScript, Tailwind/shadcn/forms/query/testing                       | Partial          | Existing Next app; incomplete prescribed dependency set | Add shared contracts, form/query/testing boundaries, and document intentional compatibility with existing shell |
| A2  | §1.1 Node 24                                                                                     | Finished         | `.mise.toml`, CI, Dockerfile use Node 24                | Verify all scripts under Node 24                                                                                |
| A3  | §1.1 NestJS/Fastify/OpenAPI/Pino API                                                             | Missing          | API currently Next route handlers                       | Add `apps/api` Nest/Fastify/OpenAPI boundary and shared route contracts                                         |
| A4  | §1.1 Prisma 7/Postgres/pgvector                                                                  | Finished/Partial | Prisma 7, adapter-pg, pgvector local image              | Add vector migration/query abstraction and verify database deployment                                           |
| A5  | §1.1 Better Auth organizations/OAuth/passkeys/TOTP                                               | Missing          | Custom auth only                                        | Add auth package/schema/routes and provider configuration boundary                                              |
| A6  | §1.1 Cloudflare R2/CDN/WAF/Turnstile/rate limiting                                               | Partial/External | S3-compatible storage and app rate limiting             | Add R2 lifecycle/bucket/Terraform/provider adapters; credentials remain external                                |
| A7  | §1.1 Pub/Sub/Cloud Run/RunPod                                                                    | Partial/External | Redis/BullMQ worker and Terraform skeleton              | Add queue adapter interfaces, Pub/Sub implementation boundary, Cloud Run jobs, RunPod client                    |
| A8  | §1.1 media stack: FFmpeg/ffprobe, Deepgram, WhisperX, PySceneDetect, RF-DETR, PaddleOCR, librosa | Partial          | FFmpeg/ffprobe and requirements/worker boundary         | Wire all extraction outputs into Prisma evidence records                                                        |
| A9  | §§12–21 AI gateway/routing/budget/provider abstraction                                           | Partial          | Generic provider adapter                                | Add provider registry, budget router, fallback policy, prompt telemetry, and provider-specific request mappers  |
| A10 | §§25–28 social adapters                                                                          | Partial          | Existing generic OAuth/publishing                       | Extract/wire Postiz adapter boundary for Meta/TikTok/YouTube/LinkedIn                                           |
| A11 | §§47–49 billing/Lago/Stripe/credit ledger                                                        | Partial          | Existing billing/ledger; Lago clone                     | Add Lago HTTP adapter, Stripe webhook adapter, usage reconciliation, and idempotency                            |
| A12 | §§55–56 OpenTelemetry/Sentry/Grafana/Prometheus/Pino                                             | Partial          | Pino/OTel helper                                        | Add exporters, metrics, dashboards, health signals, and alert definitions                                       |
| A13 | §§65–70 Terraform/Docker/GCP environments/CI/load testing                                        | Partial          | CI, Dockerfile, Terraform skeleton                      | Add environment modules, Docker worker image, E2E/load suites, deployment checks                                |

## B. Domain and product requirements §§2–8, 22–24, 30–36

| ID  | Guide requirement                                                 | Current status | Required completion action                                                                                    |
| --- | ----------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| B1  | Monorepo apps/packages/infrastructure/tests boundaries (§3)       | Missing        | Create executable workspace package boundaries without changing the existing frontend entrypoint              |
| B2  | Multi-tenant identity/workspace/RBAC (§4–5, §45–46)               | Partial        | Add Better Auth organization mapping and explicit role-policy matrix                                          |
| B3  | Brand/product/asset/source-of-truth model (§6–8, §23)             | Partial        | Add immutable provenance/versioning and retrieval contracts                                                   |
| B4  | Vertical-pack architecture (§22, §73)                             | Partial        | Add typed vertical-pack registry, validation, seed packs, and versioned policy                                |
| B5  | RAG/brand memory (§23–24)                                         | Partial        | Add pgvector embedding/ retrieval interface, chunk/version models, and provider boundary                      |
| B6  | Analytics normalization/performance/strategy/experiments (§29–36) | Partial        | Add normalized event taxonomy, score formulas, experiment/feature-flag adapter, and learning-loop persistence |

## C. AI Video Editor §§10.1–10.40

| ID  | Guide requirement                                            | Current status   | Required completion action                                                                                                                |
| --- | ------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Evidence tables and four-layer evidence pipeline             | Partial          | Wire Python worker extraction into `MediaEvidence`, `TranscriptWord`, `ShotBoundary`, `DetectedEntity`, `OCRRegion`, `AudioFeatureWindow` |
| C2  | `NarrativeMap`, `EditDecision`, `VisualBible`                | Finished         | Prisma models and plan relations added; verify migration                                                                                  |
| C3  | Typed immutable `EditPlanVersion`                            | Partial          | Add immutable update guards, parent/diff generation, and approval locking                                                                 |
| C4  | Full prompt-family registry §§10.31–10.33                    | Finished         | All named prompt families added and versioned                                                                                             |
| C5  | XState state machine §10.29                                  | Finished/Partial | XState machine and service checks added; persist every transition/event audit                                                             |
| C6  | OTIO timeline §10.17/§115                                    | Partial          | Add OTIO package bridge and plan-to-timeline validation in worker                                                                         |
| C7  | Motion Canvas primitives §§10.13–10.14/§112–114              | Partial          | Add all parameterized scene primitives and render orchestration                                                                           |
| C8  | FFmpeg final render §10.17/§79                               | Partial          | Local renderer added; wire OTIO/scenes/assets into final render job and output storage                                                    |
| C9  | Specialized quality judges §10.27/§19                        | Partial          | Judge aggregator added; connect real render/frame/audio/transcript signals                                                                |
| C10 | Complete issue taxonomy and scoped repair                    | Finished/Partial | Codes and two-attempt gate added; persist changed/preserved diff and execute beat-level patching                                          |
| C11 | Skills orchestration §10.25                                  | Missing          | Add typed skill registry/execution runner and LangGraph-compatible adapter                                                                |
| C12 | Benchmark/autonomy gates §10.35–10.36                        | Missing          | Add benchmark fixtures, score thresholds, autonomy policy evaluator, and approval metrics                                                 |
| C13 | Cost accounting/failure handling/learning loop §§10.37–10.39 | Partial          | Add editor-specific cost ledger, provider failure taxonomy, retries, and learning events                                                  |

## D. Repurposing/content/social/billing/operations §§10A–10B, 25–71, 80–110

| ID  | Guide requirement                                                          | Current status | Required completion action                                                                       |
| --- | -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| D1  | Repurposing engine §10A                                                    | Partial        | Add candidate generation/scoring contract and media-to-candidate persistence                     |
| D2  | Content generation engine §10B                                             | Partial        | Add script/creative contract, prompt versions, budget/routing, and QA links                      |
| D3  | Social OAuth/adapters/publishing state machine §§25–28                     | Partial        | Wire extracted Postiz adapters behind internal interfaces and provider state transitions         |
| D4  | Analytics ingestion/normalization/strategy §§29–34                         | Partial        | Add provider payload mappers, event contracts, scheduled ingestion, and score calculations       |
| D5  | Approval modes/safety/rights §§35–37                                       | Partial        | Add explicit policy engine, rights evidence, and mode gates                                      |
| D6  | Jobs/retries/outbox/API/error/rate limiting §§38–44                        | Partial        | Add Pub/Sub-compatible queue/outbox adapters, retry policy records, OpenAPI contracts            |
| D7  | Authentication/RBAC/billing/credits §§45–49                                | Partial        | Wire Better Auth/Lago/Stripe adapter boundaries and webhooks                                     |
| D8  | Caching/concurrency/retention/deletion/DR §§50–54                          | Partial        | Add cache keys, locks, retention jobs, deletion workflow, restore verification                   |
| D9  | Observability/security/MCP/admin/flags §§55–64                             | Partial        | Add metrics/exporters, prompt injection/tool policies, admin contracts, GrowthBook adapter       |
| D10 | Deployment/domains/CI/dependencies/testing/load/acceptance §§65–71         | Partial        | Add Terraform envs, deployment manifests, E2E/load tests, acceptance checklist automation        |
| D11 | Website/calendar/notifications/email/webhooks §§80–84                      | Partial        | Wire Novu/Svix interfaces, signed webhook delivery, email provider adapter                       |
| D12 | DB/query/pagination/search/events/provider health §§85–93                  | Partial        | Add query contracts, search adapter, health registry, degradation policy                         |
| D13 | Scaling/traffic/queues/quotas/abuse/API keys/public API/SDK §§94–102       | Partial        | Add typed quotas, priority queues, abuse policies, OpenAPI generation, SDK boundary              |
| D14 | Provenance/versioning/reproducibility/legal/regional/performance §§103–110 | Partial        | Add provenance manifest, reproducibility hash, legal/privacy policy records, performance budgets |
| D15 | Media/captions/brand/template/render/metrics/strategy §§111–123            | Partial        | Complete deterministic media contracts, template engine, metrics dashboards, strategy reports    |
| D16 | Final production definitions §§124–136                                     | Partial        | Add machine-checkable acceptance criteria and release gate report                                |

## E. Appendix C clone-and-wire matrix

| Step | Repository/package/service                               | Clone status                                                     | Wiring status    | Required completion                                                                                            |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Turborepo monorepo scaffold                              | Not cloned; project already exists                               | Missing          | Add workspace/app/package boundaries in current repository                                                     |
| 2    | `better-auth/better-auth`                                | Cloned at `/tmp/creozentic-oss-refs/better-auth`                 | Missing          | Copy relevant organization/Prisma example concepts into `packages/auth` without copying unrelated UI           |
| 3    | `gitroomhq/postiz-app`                                   | Cloned at `/tmp/creozentic-oss-refs/postiz-app`                  | Missing          | Extract social adapters into `packages/social/src/adapters`, preserve license notice and isolate AGPL boundary |
| 4    | ClipsAI/WhisperX/librosa/PySceneDetect/RF-DETR/PaddleOCR | Package manifest and worker boundary added                       | Partial          | Install/build worker image and map every output to Prisma evidence tables                                      |
| 5    | Motion Canvas/OpenTimelineIO/FFmpeg                      | Motion Canvas installed; OTIO bridge added; FFmpeg adapter added | Partial          | Add all scene primitives and complete render orchestration                                                     |
| 6    | XState                                                   | Installed and wired                                              | Finished/Partial | Persist transition audit and test all state/event edges                                                        |
| 7    | LangGraph                                                | Requirements entry added                                         | Missing          | Add skill runner and typed execution adapter                                                                   |
| 8    | LiteLLM/Langfuse                                         | Not cloned                                                       | Missing          | Add gateway proxy configuration, prompt/run telemetry adapters, and compose manifests                          |
| 9    | `getlago/lago`                                           | Cloned at `/tmp/creozentic-oss-refs/lago`                        | Missing          | Add billing client and webhook reconciliation boundary                                                         |
| 10   | `growthbook/growthbook`                                  | Cloned at `/tmp/creozentic-oss-refs/growthbook`                  | Missing          | Add feature evaluation client and flag audit records                                                           |
| 11   | `novuhq/novu` and `svix/svix-webhooks`                   | Both cloned under `/tmp/creozentic-oss-refs`                     | Missing          | Add notification and signed webhook provider interfaces, routes, retries, and event records                    |
| 12   | OTel/Grafana/Prometheus                                  | OTel helper added                                                | Partial          | Add collector/metrics/dashboard manifests and alert rules                                                      |

## F. Execution order

The implementation must proceed in this order: (1) create workspace/package boundaries and shared contracts; (2) wire auth, provider registries, and external-service adapters; (3) wire evidence extraction and editor render/QA; (4) wire social, billing, notifications, experiments, and webhooks; (5) add infrastructure, workers, migrations, E2E/load tests, CI completeness checks; (6) rerun this matrix and mark every local-code row `Finished`. Rows requiring accounts remain `External`, but their code, config, mocks, contracts, and deployment definitions must still be present.

## G. Execution evidence recorded

The following matrix items have now been implemented or wired at the local-code level: Node 24 toolchain; Prisma 7 adapter; NestJS/Fastify/OpenAPI boundary; workspace package structure; Better Auth-compatible organization/passkey/TOTP/OAuth contract; Postiz-compatible social adapter registry; Lago billing adapter; GrowthBook experiment adapter; Novu notification adapter; Svix-compatible signature adapter; platform integration registry and route; queue worker package; media-analysis worker manifest and Python boundary; Motion Canvas scene boundary; OpenTimelineIO bridge; FFmpeg renderer; editor state machine; editor prompt families; editor evidence models; specialized QA issue taxonomy; Docker/Compose; Terraform; LiteLLM/Langfuse/GrowthBook/Prometheus/Grafana/OTel service definitions; completion checker; CI invocation; and verification tests.

External activation remains represented by configuration contracts rather than fake credentials. The code-level requirement is considered complete only when the adapter, schema, route, retry/idempotency behavior, and verification test exist; account creation itself is outside the repository.
