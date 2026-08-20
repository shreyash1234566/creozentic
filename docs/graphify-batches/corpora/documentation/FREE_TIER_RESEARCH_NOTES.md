# Verified free-tier research notes

## Cloudflare R2

Source: https://developers.cloudflare.com/r2/pricing/

Official page last updated Aug 7, 2026. R2 Standard storage has a free tier of 10 GB-month per month, 1 million Class A operations per month, 10 million Class B operations per month, and free egress. Infrequent Access does not use the same free tier and can incur retrieval fees and a 30-day minimum storage duration. R2 still requires careful usage monitoring because storage or operation usage above the free tier is billable.

## Supabase

Source: https://supabase.com/pricing

Official pricing page states the Free plan is $0/month and includes 50,000 monthly active users, 500 MB database size, 5 GB egress, 5 GB cached egress, and 1 GB file storage. Free projects can pause after one week of inactivity and the Free plan is limited to two active projects. Pro begins at $25/month and adds paid compute and other quotas. Supabase is a possible free development Postgres/pgvector option, but the project’s production schema, backups, and workload should be tested against its limits.

## Upstash Redis

Source: https://upstash.com/pricing/redis

Official page states the Free Redis plan is $0/month with 256 MB maximum data and 10 GB maximum bandwidth. The page also documents a free instant Redis database for agents with no signup/authentication, but an unclaimed database is deleted after three days; it must be claimed in the console to persist. Upstash requires caution about current plan terms, command limits, and whether a card is requested when moving to paid usage.

These findings are preliminary infrastructure research. Provider-specific setup instructions, current account UI labels, free AI quotas, social developer requirements, billing requirements, and deployment pricing must be checked from each provider’s official documentation before the user performs setup.

## Gemini API

Source: https://ai.google.dev/gemini-api/docs/pricing

Google’s official page currently lists a Free tier with limited model access, free input/output tokens for eligible models, and Google AI Studio access. The page states that Free-tier content may be used to improve Google products, while paid-tier content has different terms. Use non-sensitive test content until the data terms are acceptable.

## Deepgram

Source: https://deepgram.com/pricing

Deepgram’s official pricing page currently advertises a Free $200 credit option and says no credit card is required for Pay As You Go signup. Credits and promotional terms can change, so the account console should be checked before use.

## fal.ai

Source: https://fal.ai/pricing

The official pricing page presents usage-based GPU/model pricing, including per-second video and per-image model prices. It should be classified as paid/defer unless the account dashboard explicitly provides a current promotional credit.

## Meta Instagram

Source: https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app

Meta’s official setup guide says to create an app from App Dashboard, connect a business when required, choose the appropriate use case/app type, add the Instagram product, add a test account, configure webhooks and redirect URLs, and complete App Review for live data and permissions.

## TikTok

Source: https://developers.tiktok.com/doc/content-posting-api-get-started

TikTok’s official documentation provides App Management, sandbox, OAuth, Content Posting API, and App Review paths. Developer registration may not cost money, but production Content Posting access depends on app configuration, scopes, test users, and review.

## YouTube Data API

Source: https://developers.google.com/youtube/v3/getting-started

YouTube’s official guide requires a Google Account, a project in Google Developers Console, enabling YouTube Data API v3, and OAuth 2.0 for user-authorized operations. The API uses quotas; the guide documents default quota behavior and operation costs rather than a direct per-request bill.

## Google Cloud

Source: https://cloud.google.com/free

Google advertises $300 in free credits for new customers and always-free products, but some free-tier access requires a billing account. Treat Google Cloud deployment, Pub/Sub, Secret Manager, KMS, and Cloud Run as billing-risk items even when trial credit is available.

## Cloudflare R2 authentication

Source: https://developers.cloudflare.com/r2/api/tokens/

Cloudflare’s official R2 authentication documentation states that R2 must be purchased before generating an R2 API token. The token flow is R2 object storage → Account Details → Manage API Tokens → create scoped Object Read & Write token; the Secret Access Key is shown only once. R2 should therefore be deferred for a zero-budget setup.

## Supabase connection

Source: https://supabase.com/docs/guides/database/connecting-to-postgres

Supabase’s official guide says to click Connect in the project dashboard and choose the direct or pooled connection string. Session pooler is suitable for IPv4-only persistent applications; transaction pooler is intended for transient/serverless connections and does not support prepared statements.
