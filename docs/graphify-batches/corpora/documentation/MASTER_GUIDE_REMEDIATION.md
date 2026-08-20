# Master Guide Remediation Notes

This repository now contains executable boundaries for the guide’s major runtime concerns while retaining the existing frontend application. The remaining activation steps are external-service operations rather than local source edits.

## Runtime services

Run PostgreSQL with pgvector, Redis, the Next web service, and the worker through `docker-compose.yml` for local integration. Production deployment uses the `Dockerfile` and the Terraform Cloud Run/Cloud Run Job definitions under `infrastructure/terraform`.

## Database

Prisma 7 is configured through `prisma.config.ts` and uses `@prisma/adapter-pg` in `src/server/db.ts`. Apply migrations only after setting a real `DATABASE_URL`:

```bash
pnpm db:deploy
pnpm db:seed
```

The editor migration is `prisma/migrations/20260818000100_ai_video_editor/migration.sql`.

## Provider activation

The application uses internal interfaces in `src/server/provider-adapters.ts`; provider-specific business logic must remain behind these interfaces. Set the corresponding `*_BASE_URL`, `*_API_KEY`, and optional `*_MODEL` values from `.env.example`. No credentials are committed. The adapter intentionally fails closed when a required provider is not configured.

## Editor pipeline

The editor now has typed plan entities, narrative map, edit decisions, visual bible, XState lifecycle transitions, versioned prompt families, evidence extraction boundaries, deterministic FFmpeg rendering, a complete issue taxonomy, specialized quality judges, and automatic-repair limits. Local media analysis requires `ffprobe`; local rendering requires `ffmpeg`. Remote workers should persist media through the storage abstraction and call the same contracts rather than bypassing them.

## Production gates

Before enabling autonomous publishing, configure authentication, workspace membership, storage buckets, provider credentials, signed webhooks, rate limiting, observability exporters, backup/restore drills, and real CI secrets. The editor must have verified evidence, an approved plan, a completed render, a passing or explicitly reviewed quality evaluation, and final human approval before export or publishing.

## External work still required

Cloudflare account resources, Google Cloud projects, Pub/Sub topics, Cloud Run deployment, RunPod workers, Better Auth’s passkey/TOTP/OAuth provider configuration, first-party social application credentials, Stripe webhooks, Secret Manager/KMS, Sentry/OTel exporters, and load/E2E environments cannot be provisioned from this repository alone. They must be created in the relevant accounts and then connected through the documented environment contract.
