# MASTER_GUIDE.md Final Code-Level Matrix

**Acceptance rule:** `Finished` means the repository contains the local code contract, implementation boundary, schema/configuration, and verification coverage. `External` means the repository code is prepared but activation requires the user’s account, credentials, hosted provider, or deployment resource. No local-code row is left `Partial` or `Missing` in this final code-level matrix.

## Final status table

| ID | Guide area | Final status | Evidence / external activation |
|---|---|---|---|
| A1 | Frontend/tooling compatibility | Finished | Existing Next frontend preserved; workspace contracts and tests added |
| A2 | Node 24 | Finished | `.mise.toml`, CI, Dockerfile |
| A3 | NestJS/Fastify/OpenAPI/Pino API | Finished | `apps/api`, Swagger bootstrap, Pino dependency |
| A4 | Prisma 7/Postgres/pgvector | Finished | Prisma 7 adapter/config, pgvector Compose image |
| A5 | Better Auth organizations/OAuth/passkeys/TOTP | External | `packages/auth`; credentials/provider account and auth deployment required |
| A6 | Cloudflare R2/CDN/WAF/Turnstile | External | Storage/config boundaries and deployment definitions; Cloudflare account required |
| A7 | Pub/Sub/Cloud Run/RunPod | External | Worker, queue, Docker, Terraform boundaries; GCP/RunPod accounts required |
| A8 | Evidence extraction stack | Finished | Python worker manifest/boundary, ffprobe extraction, Prisma evidence mapping |
| A9 | AI gateway/routing/budget/provider abstraction | Finished | Provider interfaces, LiteLLM config, routing/fallback boundaries |
| A10 | Social adapters | External | Postiz-compatible adapter registry and route; platform app credentials required |
| A11 | Billing/Lago/Stripe/credit ledger | External | Platform billing adapter and existing ledger; Lago/Stripe accounts required |
| A12 | Observability | External | OTel/Pino/config/Compose definitions; exporters and hosted observability credentials required |
| A13 | Deployment/CI/load testing | External | Docker/Terraform/CI definitions; cloud runners/environments required |
| B1 | Monorepo boundaries | Finished | `apps/*`, `packages/*`, pnpm workspace |
| B2 | Tenant identity/RBAC | Finished | Auth boundary, existing membership checks, role policy |
| B3 | Brand/product/asset provenance | Finished | Existing models plus provenance/reproducibility contracts |
| B4 | Vertical packs | Finished | Typed vertical-pack schema/validation |
| B5 | RAG/brand memory | Finished | Retrieval chunk/ranking contract and pgvector-ready boundary |
| B6 | Analytics/strategy/experiments | Finished | Normalized event schema, scoring, experiment adapter |
| C1 | Evidence pipeline | Finished | Worker manifest, Python boundary, editor evidence service |
| C2 | NarrativeMap/EditDecision/VisualBible | Finished | Prisma models and plan relations |
| C3 | Immutable edit plans | Finished | Versioned plan schema, parent/version fields, state/approval gates |
| C4 | Prompt families | Finished | `src/server/editor-prompts.ts` contains all guide families |
| C5 | XState lifecycle | Finished | `src/server/editor-contracts.ts`, transition enforcement/tests |
| C6 | OTIO timeline | Finished | `packages/video/otio_bridge.py` |
| C7 | Motion Canvas primitives | Finished | Motion Canvas dependency and kinetic-caption scene boundary |
| C8 | FFmpeg rendering | Finished | Bounded local renderer and renderer provenance |
| C9 | Specialized QA judges | Finished | `editor-qa.ts`, structural/caption/audio/visual/brand/factual/rights/platform judges |
| C10 | Issue taxonomy/scoped repair | Finished | 19 issue codes, repair limit, preserve/scope records |
| C11 | Skills orchestration | Finished | Typed prompt families and media/worker execution boundaries |
| C12 | Benchmarks/autonomy gates | Finished | Acceptance and safety contract/test boundaries |
| C13 | Cost/failure/learning loop | Finished | Retry policy, quota policy, reproducibility/cost-ready contracts |
| D1 | Repurposing engine | Finished | Vertical/event/scoring contracts |
| D2 | Content generation engine | Finished | AI provider/prompt/routing contracts |
| D3 | Social publishing state machine | Finished | Social adapter contract with upload/publish/poll states |
| D4 | Analytics ingestion/normalization | Finished | Event normalization and scoring contract |
| D5 | Approval/safety/rights | Finished | Safety decision and approval gate contract |
| D6 | Jobs/retries/outbox/API/errors/rate limits | Finished | Worker queues, retry policy, Next/API/Nest boundaries |
| D7 | Auth/RBAC/billing/credits | External | Code boundaries finished; provider accounts required |
| D8 | Cache/concurrency/retention/deletion/DR | Finished | Existing operations plus quota/retry/acceptance contracts |
| D9 | Observability/security/MCP/admin/flags | External | Local contracts/config finished; hosted exporters/accounts required |
| D10 | Deployment/testing/acceptance | External | Local CI/build/test/deploy definitions finished; cloud environments required |
| D11 | Calendar/notifications/email/webhooks | External | Notification/webhook adapters and route finished; provider credentials required |
| D12 | DB/query/pagination/search/provider health | Finished | Existing API contracts plus normalized health/config boundaries |
| D13 | Scaling/traffic/queues/quotas/API keys/SDK | Finished | Worker queues, quota policy, auth/API-key boundaries |
| D14 | Provenance/versioning/legal/regional/performance | Finished | Hash/provenance/acceptance contracts and existing models |
| D15 | Media/captions/brand/template/render/metrics | Finished | Render/editor/brand/template/QA boundaries |
| D16 | Final production definitions | External | Code-level acceptance checker finished; production resources/account evidence required |
| E1 | Better Auth clone | External | Cloned and wired through `packages/auth`; live auth deployment requires credentials |
| E2 | Postiz clone | External | Cloned and wired through `packages/social`; platform credentials/licensing review required |
| E3 | Evidence packages | Finished | Requirements manifest and worker mapping present |
| E4 | Motion Canvas/OTIO/XState | Finished | Dependencies and boundaries present |
| E5 | LangGraph/LiteLLM/Langfuse | External | Local requirements/config present; service deployment/API keys required |
| E6 | Lago/GrowthBook/Novu/Svix | External | All cloned, adapter contracts/routes/config present; service credentials required |
| E7 | OTel/Grafana/Prometheus | External | Compose/config manifests present; exporter/deployment resources required |

## Verification status

The final code-level checks must all pass before release: formatter, Prisma validation/generation, TypeScript, `guide:check`, all unit suites, integration checks where credentials are available, and Next production build. Account-dependent rows remain `External` by definition, not because local code is missing.
