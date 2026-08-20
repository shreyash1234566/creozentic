# Autozentic production prerequisites

The application code and local deterministic paths are implemented in this workspace. The following items are deployment/provider prerequisites rather than UI work:

- PostgreSQL: set `DATABASE_URL`, run `pnpm db:deploy`, then `pnpm db:generate`.
- Redis 5 or newer: set `REDIS_URL` and run one or more `pnpm worker` processes alongside the Next.js service.
- Object storage: configure the S3-compatible variables in `.env.example` for production. `LOCAL_STORAGE_ENABLED=true` is for local development only.
- Creative/text/moderation quality providers: configure the corresponding endpoint and API-key variables. The local deterministic creative/text providers are enabled only by the local `.env.local` and are intentionally not a substitute for production-quality model output.
- Media: the local renderer uses FFmpeg. Production workers should ship a pinned FFmpeg/Remotion image or configure `FFMPEG_PATH` and `FFMPEG_FONT_PATH`.
- Publishing/connectors: complete OAuth/app review and least-privilege scopes, then configure `PUBLISH_*`, `CONNECTOR_*`, and provider connection secrets. Publishing remains approval-gated; TikTok creator metadata/consent/audit and WhatsApp service-window/template rules are enforced by the server.
- Billing: configure Stripe/Razorpay checkout and signed webhook secrets before accepting paid top-ups or subscriptions.
- Custom models: only enable releases after the customer-funded rights evidence, benchmark evaluation, rollback, and deletion process is in place.
- Daily Autopilot: run a deployment cron against `POST /api/v1/schedules/tick` with `x-cron-secret` set to `SCHEDULE_CRON_SECRET`; keep new workspaces in Approval mode until brand calibration and pilot evidence pass the launch gate.
- Weekly calendar and agency operations: call `POST /api/v1/content-calendar` after brand setup, keep entries lockable, and monitor `/api/v1/agency/metrics` for the paid-beta launch gate. Do not treat unverified provider costs or human benchmark evidence as margin or launch proof.

Verification commands:

```text
pnpm exec prisma migrate status
pnpm exec tsc --noEmit
pnpm exec oxfmt --check app src prisma
pnpm build
```
