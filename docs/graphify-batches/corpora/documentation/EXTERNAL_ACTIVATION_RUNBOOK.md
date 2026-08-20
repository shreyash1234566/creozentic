# Creozentic External Activation Runbook

This document explains exactly what can be prepared locally and what must be supplied from account-owned services. Real secrets must never be committed to GitHub. Put them in `.env.local`, a deployment secret manager, or the hosting platform’s encrypted variables.

## Local files and commands

```bash
cp .env.example .env.local
pnpm install
pnpm exec prisma generate
pnpm env:check
pnpm dev
pnpm test:unit
pnpm test:e2e
pnpm benchmark:editor
pnpm build
```

For local development, `.env.local` is already provided with safe demo defaults. It intentionally keeps cloud, AI, GPU, social, billing, email, and observability credentials empty.

## External activation table

| ID | Service | Local preparation | User-owned action | Required variables or artifacts | Safe verification |
|---|---|---|---|---|---|
| E1 | Google Cloud/Pub/Sub | Queue contracts, Terraform, worker boundaries, and event routes exist | Create project/topics/subscriptions, service accounts, IAM, quotas, and deploy workers | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, Pub/Sub topic/subscription IDs | Publish a test message and verify one idempotent worker completion |
| E2 | Secret Manager/KMS | Secret interfaces and redaction policy exist | Create secrets, KMS keys, rotation, and runtime IAM | Secret-manager project/key IDs and runtime identity | Read a non-production test secret through the deployed runtime |
| E3 | Cloudflare | S3-compatible storage, signed object, and infrastructure boundaries exist | Create R2 bucket, API token, DNS, TLS, WAF, Turnstile, and domain rules | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Upload, signed download, expiry, deletion, and WAF smoke test |
| E4 | PostgreSQL/pgvector | Prisma schema, validation, migrations, and local connection template exist | Provision managed Postgres, enable pgvector, pooling, backups, and network policy | `DATABASE_URL` | `pnpm db:deploy`, health query, migration and restore drill |
| E5 | Redis/BullMQ/Temporal | Queue package, retry, idempotency, dead-letter, and worker contracts exist | Provision persistent TLS Redis or Temporal namespace | `REDIS_URL` or Temporal endpoint/namespace | Queue one media job and verify retry/dead-letter behavior |
| E6 | GPU workers | Adopted engine manifest and safe dispatch flags exist | Create RunPod/GPU deployment, model cache, image registry, storage, and budget | GPU endpoint, model paths, `GPU_WORKER_ENABLED=true`, engine flags | Run one approved fixture through an isolated worker |
| E7 | AI/speech providers | AI router, structured output validation, evidence persistence, and usage contracts exist | Create provider accounts, keys, quotas, budgets, and data-processing approvals | Provider API keys, endpoint URLs, model IDs | Run a non-sensitive test brief and reconcile usage |
| E8 | Social platforms | Provider specs, validation, idempotency, upload/poll/publish boundaries exist | Create developer apps, OAuth redirect URLs, scopes, test channels, and approvals | Meta/TikTok/YouTube/LinkedIn client IDs/secrets/tokens | Publish only a private/unlisted test asset after confirmation |
| E9 | Stripe/Lago | Billing routes, quote, ledger, webhook signature and idempotency boundaries exist | Create merchant account, products/prices, portal, tax rules, and webhooks | Stripe/Lago keys, price IDs, webhook secrets | Test-mode checkout/webhook and ledger reconciliation |
| E10 | Better Auth | Role policy, tenant scope, session/OAuth/passkey/TOTP contracts exist | Configure domain, OAuth apps, passkey origins, email delivery, and session secrets | `AUTH_SESSION_SECRET`, OAuth IDs/secrets, email provider | Sign in, organization switch, passkey/TOTP test |
| E11 | Novu/Svix/email | Notification/event/webhook contracts, signing, retries, and dead letters exist | Create service/project, sender domain, signing keys, delivery provider | `NOVU_API_KEY`, `SVIX_API_KEY`, sender/domain settings | Send a test notification/webhook and replay a failure |
| E12 | Observability | Logger, OTel and health boundaries exist | Create Sentry/Grafana/Prometheus/OTel sinks, dashboards, alerts, retention | DSNs, collector URL, API keys | Confirm a request, queue job, error, and render trace arrive |
| E13 | Artifact Registry/environments | Docker, Compose, Terraform, CI, and environment template exist | Create dev/staging/prod projects, registries, networks, domains, approvals | Registry URL, cloud project IDs, deployment identity | Deploy staging and run production smoke suite |
| E14 | Benchmark dataset | Structural benchmark harness and thresholds exist | Supply licensed representative footage, labels, expected outputs, and reviewers | Dataset location, rights evidence, acceptance thresholds | Run benchmark suite and record pass/fail report |
| E15 | Licensing/legal | Provenance and license table exists; engines are isolated and disabled by default | Approve AGPL/GPL/Sustainable Use, model, font, music, stock, and dataset decisions | Written license approvals and isolation policy | Store approval references in launch evidence |
| E16 | Human creative approvals | Hook lock, storyboard, visual, QA, repair, rights, and final approval states exist | Assign authorized reviewers and approval policy | Reviewer IDs, roles, escalation rules | Complete one full review trail on a test project |
| E17 | Performance acceptance | Local load harness and metrics output exist | Define traffic, SLOs, budget, load window, and operations team | `LOAD_BASE_URL`, target SLOs, test environment | Run load test on staging and attach report |
| E18 | Security acceptance | Tenant scope, roles, secrets, signing, audit, rate limits, and restore boundaries exist | Authorize penetration test, domain verification, rotation, abuse and incident policies | Security report, incident contacts, approved domains | Resolve findings and record launch evidence |

## Browser operations

Browser setup can be performed when the user is already logged in and the action is non-destructive or explicitly confirmed. Creating an account, accepting terms, generating or revealing API keys, making a payment, submitting an app for platform review, publishing media, or changing production DNS requires the user to take over or confirm the exact action immediately before submission.

The safe sequence is:

```text
Open provider console
  → Inspect current account/project
  → Create non-sensitive project metadata if safe
  → Stop before credential reveal, payment, legal acceptance, or submission
  → User confirms or takes over
  → Store the secret in .env.local or the deployment secret manager
  → Run the corresponding smoke test
```

## Production readiness rule

A filled `.env` file alone does not make the system production-ready. Production readiness requires valid credentials, correct IAM, deployed queues/workers, approved legal terms, real media, successful integration tests, security acceptance, and a human-approved launch evidence record.
