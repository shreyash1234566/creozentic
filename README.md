# Creozentic by Autozentic

Creozentic is the Daily Creative Autopilot platform for brand-approved
posters, ads, reels, captions, UGC-ready creatives, review, delivery, and
publishing. The UI keeps the existing visual system; the server path is a
Next.js + Prisma + Redis application with durable workflow, asset, approval,
billing, connector, and audit records.

## Local development

1. Copy `.env.example` to `.env.local` and keep `CREOZENTIC_RELEASE_MODE=false`.
2. Start PostgreSQL and Redis, then run `pnpm install`, `pnpm db:deploy`,
   `pnpm db:seed`, and `pnpm dev`.
3. Use local deterministic storage/providers only for development. They are
   visibly marked as demo/local and are not production-quality generation.

## Production checklist

Configure real PostgreSQL, Redis, S3/R2 storage, session/encryption secrets,
runner authentication, FFmpeg/font assets, and the provider endpoints listed in
`docs/production-prerequisites.md`. Set `CREOZENTIC_RELEASE_MODE=true` only
after the release configuration validator passes. Release mode requires
authenticated workspace access and blocks missing creative, text, media, safety,
and moderation providers.

Apply migrations and verify the release before traffic with `pnpm db:deploy`,
`pnpm db:generate`, `pnpm exec tsc --noEmit`, `pnpm test:unit`, `pnpm build`,
`pnpm start`, and `pnpm test:production-smoke`.

Provider contracts, schedules, launch evidence, backups, the UGC lifecycle,
and the daily operating sequence are documented in
`docs/production-operations.md`. Credentials and live account/app setup are
deployment prerequisites; the repository never fabricates provider quality,
payment success, customer interviews, or paid-beta evidence.
