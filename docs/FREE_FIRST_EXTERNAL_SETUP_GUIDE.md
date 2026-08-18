# Creozentic free-first setup guide

## Read this first

You do **not** need to buy everything at the beginning. Start with local development plus a small number of free services. Do not enter a credit card unless you understand the provider’s billing screen and are ready to accept its terms.

A free account is not always the same as a free service. Some providers offer a free quota, some offer trial credit, some pause an inactive project, and some require a payment method before creating API credentials.

The safest first goal is:

> **Run Creozentic locally, connect a free database, connect a free Redis queue, use Google Gemini’s free API tier for planning, and use local FFmpeg for rendering. Add publishing and GPU generation later.**

## 1. Cost classification

| Group | Services | Cost status | Start now? |
|---|---|---|---|
| Free/local | Node, pnpm, FFmpeg, PostgreSQL in Docker/local, Redis in Docker/local, GitHub, local storage, existing OSS engines | No service bill | Yes |
| Free quotas or free plans | Supabase Free, Upstash Redis Free, Gemini API free tier, Deepgram free credit, YouTube Data API quota, GitHub OAuth | Free within limits; terms and limits apply | Yes, carefully |
| Free account but approval required | Meta, TikTok, LinkedIn developer apps; Better Auth OAuth providers | Usually no API usage fee, but app review, account type, scopes, and test users are required | Later, after local app works |
| Trial or credit-card risk | Google Cloud, Cloudflare R2, some hosted GPU and AI providers | May provide credits or free quota, but can require billing setup and can charge after limits | Defer |
| Paid per use | OpenAI API, Anthropic API, fal.ai video/image generation, RunPod/GPU, production email, production observability | Do not activate until you have budget | Defer |
| Human/legal | Licenses, benchmark footage, rights, final approvals, security review | Cannot be automated by software | Decide later |

## 2. What can work without spending money

With no money, the project can still do the following:

| Feature | Free implementation |
|---|---|
| Open the frontend | Local Next.js development server |
| Store development data | Local PostgreSQL or Supabase Free |
| Run asynchronous jobs | Local Redis or Upstash Free |
| Store small development files | Local `.data/storage` directory; R2 is not required yet |
| Analyze technical video facts | Local `ffprobe` and FFmpeg |
| Make a basic vertical video | Local FFmpeg renderer |
| Create structured editing plans | Gemini free tier, subject to current limits and Google’s free-tier data terms |
| Transcribe test audio | Deepgram’s advertised free credit, if available to your account, or local speech tools if installed |
| Publish test videos to YouTube | YouTube API quota plus OAuth, subject to Google project and channel setup |
| Test the editor UI | Playwright and local demo mode |

Advanced image/video generation, GPU workers, production cloud hosting, commercial social publishing, billing, and large-scale speech/CV analysis should wait.

## 3. Step zero: create your local configuration

The repository already contains these files:

```text
.env.example
.env.local
```

`.env.local` is ignored by Git. Never paste real keys into GitHub, chat, screenshots, or a public issue.

Open a terminal in the Creozentic folder and run:

```bash
cd /home/ubuntu/creozentic
pnpm install
pnpm env:check
pnpm dev
```

Open `http://127.0.0.1:3000` in your browser.

If the page opens, local mode is working. Local mode does not need cloud accounts.

## 4. Free database option: Supabase Free

Supabase’s official Free plan currently lists 500 MB database size, 5 GB egress, 1 GB file storage, and 50,000 monthly active users. Free projects may pause after one week of inactivity, and the Free plan has a project limit.[1]

### Create the account and project

1. Open [supabase.com](https://supabase.com).
2. Click **Start your project** or **Sign in**.
3. Sign in with GitHub or email.
4. In the dashboard, click **New project**.
5. Create an organization if Supabase asks for one.
6. Set the project name to `creozentic-dev`.
7. Choose a database password and save it in a private password manager. Do not send it in chat.
8. Choose a nearby region.
9. Select the **Free** plan if the dashboard offers a plan choice.
10. Click **Create new project** and wait for the project to finish creating.

### Copy the database URL

Supabase’s official instructions say to click **Connect** in the project dashboard and select a connection method.[2]

For this project, begin with the **Session pooler** connection if the sandbox or deployment is IPv4-only:

1. Open the Supabase project.
2. Click **Connect** at the top.
3. Select **Session pooler**.
4. Copy the PostgreSQL connection string.
5. In `/home/ubuntu/creozentic/.env.local`, replace the entire line beginning with `DATABASE_URL=`:

```text
DATABASE_URL=postgres://postgres.PROJECT_REF:YOUR_PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres
```

Do not leave the words `YOUR_PASSWORD` in the file. URL-encode special characters in the password if Supabase tells you to.

### Create the schema

```bash
cd /home/ubuntu/creozentic
pnpm exec prisma generate
pnpm exec prisma db push
pnpm env:check
```

If Supabase pauses the project, open the Supabase dashboard and click **Restore project** or the equivalent resume button before testing.

## 5. Free queue option: Upstash Redis

Upstash’s official pricing page lists a Free Redis plan with a limited data size and bandwidth. It also describes a temporary instant Redis database that is deleted after three days unless claimed.[3]

Use a normal claimed account database rather than the temporary instant database for Creozentic.

### Create the account and database

1. Open [console.upstash.com](https://console.upstash.com).
2. Click **Sign up**.
3. Create an account with GitHub or email.
4. Click **Create database**.
5. Name it `creozentic-dev`.
6. Pick the region nearest your database or deployment.
7. Keep the **Free** plan if available.
8. Click **Create**.
9. Open the database details page.
10. Find **Connect** or **REST API** credentials.
11. Copy the Redis TLS URL, normally beginning with `rediss://`.
12. Replace this line in `.env.local`:

```text
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379
```

### Test it

```bash
pnpm env:check
pnpm test:unit
```

Do not upgrade to a paid plan. Set a usage or budget limit if the dashboard offers one.

## 6. Free AI planning option: Google Gemini API

Google’s official Gemini pricing page currently shows a Free tier with limited model access, free input/output tokens for eligible models, and Google AI Studio access. The page also warns that content in the Free tier may be used to improve Google products, while paid-tier content has different terms.[4]

Use only non-sensitive test material until you understand the data terms.

### Create a Gemini key

1. Open [Google AI Studio](https://aistudio.google.com).
2. Sign in with your Google account.
3. Click **Get API key** or **Create API key**.
4. Select **Create API key in new project** if you do not already have a project.
5. If you see a project selector, choose the development project.
6. Click **Create API key**.
7. Copy the key immediately. Google normally shows a key only in the creation flow.
8. In `.env.local`, set the provider values used by the project’s AI gateway. Use the exact variable names your current adapter expects; the safe template includes:

```text
CREATIVE_PROVIDER_ID=gemini
CREATIVE_PROVIDER_API_KEY=PASTE_YOUR_GEMINI_KEY_HERE
CREATIVE_PROVIDER_URL=https://generativelanguage.googleapis.com
LOCAL_CREATIVE_PROVIDER_ENABLED=false
```

9. Save the file.
10. Never place the key in frontend code. It belongs only in server-side environment variables.

### Test it

Start the application and run a small non-sensitive structured planning request. Keep the request short. Watch the Google AI Studio usage screen so you do not exceed free limits.

If Google asks for billing before creating a particular model key, stop. Use an eligible free model or defer that feature. Do not activate paid billing without understanding the screen.

## 7. Free speech-to-text option: Deepgram trial credit

Deepgram’s official pricing page currently advertises a Free `$200 Credit` option and says no credit card is required for its Pay As You Go signup.[5] Trial terms can change, so verify the signup screen before submitting.

### Create the account and key

1. Open [Deepgram Console](https://console.deepgram.com/signup).
2. Click **Sign Up Free**.
3. Create the account.
4. Open the console.
5. Find **API Keys** in the project settings or dashboard.
6. Click **Create a New API Key**.
7. Give it a name such as `creozentic-dev-transcription`.
8. Select the smallest permission that can perform speech-to-text.
9. Click **Create Key**.
10. Copy it immediately.
11. Set the speech provider variables in `.env.local` according to the adapter’s expected names:

```text
TEXT_PROVIDER_URL=https://api.deepgram.com
TEXT_PROVIDER_API_KEY=PASTE_YOUR_DEEPGRAM_KEY_HERE
LOCAL_TEXT_PROVIDER_ENABLED=false
```

12. Use a short, non-sensitive audio clip for the first test.
13. Check the Deepgram usage page after the test.

If the console asks for payment before issuing a key, stop and use local technical evidence until you have a budget.

## 8. Free YouTube API test publishing

YouTube’s official documentation says you need a Google Account, a project in Google Developers Console, the YouTube Data API v3 enabled, and OAuth 2.0 for user-authorized operations.[6] The API uses quota rather than a simple per-request payment model; the official documentation describes a default daily quota and operation costs.[6]

### Create the Google project

1. Open [Google Cloud Console](https://console.cloud.google.com).
2. At the top project selector, click **New Project**.
3. Name it `creozentic-youtube-dev`.
4. Click **Create**.
5. Open **APIs & Services**.
6. Click **Library**.
7. Search for **YouTube Data API v3**.
8. Click it.
9. Click **Enable**.
10. Open **APIs & Services → Credentials**.
11. Click **Create Credentials → OAuth client ID**.
12. If Google asks for a consent screen, choose **External** for a personal test project.
13. Add your own email as a test user.
14. Choose **Web application** as the application type.
15. Add the Creozentic callback URL from the application’s connection settings. Do not invent a different callback URL.
16. Click **Create**.
17. Copy the **Client ID** and **Client Secret** into the server environment only.

Use the project variables from `.env.example`:

```text
YOUTUBE_CLIENT_ID=PASTE_CLIENT_ID_HERE
YOUTUBE_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
```

YouTube publishing should first be tested as **private** or **unlisted**, never public. Publishing content is a sensitive browser operation and requires your confirmation immediately before the final publish step.

## 9. Free social developer accounts: Meta, TikTok, LinkedIn

These accounts may not charge for basic developer registration, but they are not automatically ready for production publishing. They require app configuration, test accounts, permissions, OAuth redirect URLs, and sometimes review.

### Meta / Instagram

The official Meta guide says: open App Dashboard, click **Create App**, connect a verified business when needed, choose **Other**, choose **Business**, enter app name/contact email, add the Instagram product, add a test Instagram account, configure webhooks, add redirect URLs, and complete App Review for live data.[7]

Beginner sequence:

1. Open [Meta for Developers](https://developers.facebook.com).
2. Sign in.
3. Click **My Apps**.
4. Click **Create App**.
5. Choose the business/other flow described by Meta’s current dashboard.
6. Enter the app name `Creozentic Dev` and your contact email.
7. Add the Instagram product and click **Set Up**.
8. Add your own test Instagram account under the app roles/tester area.
9. Add the OAuth callback URL from Creozentic.
10. Copy the App ID and App Secret into `.env.local`:

```text
META_APP_ID=PASTE_META_APP_ID_HERE
META_APP_SECRET=PASTE_META_APP_SECRET_HERE
```

11. Do not submit App Review until the local callback and privacy/deletion URLs work.

### TikTok

The official TikTok documentation provides an App Management area, app registration, sandbox, OAuth, Content Posting API, and App Review documentation.[8]

Beginner sequence:

1. Open [TikTok for Developers](https://developers.tiktok.com).
2. Sign in.
3. Open **Manage apps** or **App Management**.
4. Click **Connect an app** or **Create app**.
5. Add Login Kit and Content Posting API only if the dashboard allows them.
6. Add the exact Creozentic redirect URL.
7. Create a sandbox/test user if TikTok offers the option.
8. Copy the client key and client secret:

```text
TIKTOK_CLIENT_KEY=PASTE_TIKTOK_CLIENT_KEY_HERE
TIKTOK_CLIENT_SECRET=PASTE_TIKTOK_CLIENT_SECRET_HERE
```

9. Start with an upload or private test. Do not apply for production review until the local flow is proven.

### LinkedIn

1. Open [LinkedIn Developers](https://www.linkedin.com/developers).
2. Sign in.
3. Click **My apps**.
4. Click **Create app**.
5. Add an app name, LinkedIn Page, logo, and contact information.
6. Open **Auth**.
7. Add the exact OAuth redirect URL from Creozentic.
8. Request only the scopes required by the publishing feature.
9. Copy the client ID and client secret into the server environment.

LinkedIn approval and organization permissions may be required for publishing. Treat those as External approval steps.

## 10. Cloudflare R2: probably defer without money

Cloudflare’s official documentation says you must purchase R2 before generating an R2 API token. The R2 free tier has free usage limits, but account activation and token creation may still require billing setup.[9]

Therefore, with no money, use local storage first. Do not create R2 credentials until you are ready to accept Cloudflare billing terms.

When ready:

1. Open the Cloudflare dashboard.
2. Open **R2 object storage**.
3. Create a Standard bucket such as `creozentic-dev`.
4. Under **Account Details**, click **Manage** next to **API Tokens**.
5. Choose **Create Account API token** or **Create User API token**.
6. Select the smallest **Object Read & Write** permission.
7. Scope it to the one bucket.
8. Click **Create**.
9. Copy both **Access Key ID** and **Secret Access Key** immediately. The secret is not shown again.[9]
10. Find your Cloudflare Account ID.
11. Set:

```text
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=creozentic-dev
S3_ACCESS_KEY_ID=PASTE_ACCESS_KEY_ID_HERE
S3_SECRET_ACCESS_KEY=PASTE_SECRET_ACCESS_KEY_HERE
LOCAL_STORAGE_ENABLED=false
```

## 11. Google Cloud Pub/Sub and Secret Manager

Google Cloud advertises $300 in free credit for new customers and says the free trial is not charged until the user activates a full paid account. Google’s free-tier documentation also indicates that a billing account is required for many Free Tier services.[10]

Because this can create billing risk, do not start here if you have no money. Use local Redis and local environment variables first.

When ready:

1. Open [Google Cloud Console](https://console.cloud.google.com).
2. Create or select a project.
3. Open **APIs & Services → Library**.
4. Enable **Pub/Sub API**, **Secret Manager API**, **Cloud KMS API**, and any APIs required by deployment.
5. Open **Pub/Sub → Topics** and click **Create topic**.
6. Create a topic named `creozentic-jobs`.
7. Create a subscription named `creozentic-worker`.
8. Open **IAM & Admin → Service Accounts**.
9. Create a runtime service account.
10. Grant only the required roles.
11. Open **Secret Manager → Create secret**.
12. Add secrets one by one rather than putting everything in one large secret.
13. Never paste production secrets into Git.

## 12. Accounts that can wait

Do not spend money on these now:

| Item | Why wait |
|---|---|
| RunPod/GPU | Needed for heavy engines, not for the local editor baseline |
| fal.ai video/image | Paid per output or compute |
| OpenAI API | API use is billed separately from ChatGPT and should not be assumed free |
| Anthropic API | API usage is billed by tokens; use only if you have funds or trial credit |
| Cloudflare R2 | Token creation may require purchasing/activating R2 |
| Production Google Cloud | Billing account and deployment resources create cost risk |
| Stripe/Lago live billing | Test mode can wait; live merchant setup is not needed for local development |
| Production observability | Local logs and test reports are enough during development |
| Real benchmark dataset | Requires rights, labeling, and reviewer time |
| Legal approvals | Required before shipping adopted engines, fonts, music, or stock media |

## 13. What to paste where

Use this rule:

| Value you receive | Put it in |
|---|---|
| Database connection string | `DATABASE_URL=` |
| Redis TLS URL | `REDIS_URL=` |
| Gemini API key | `CREATIVE_PROVIDER_API_KEY=` |
| Deepgram API key | `TEXT_PROVIDER_API_KEY=` |
| Cloudflare R2 access key | `S3_ACCESS_KEY_ID=` |
| Cloudflare R2 secret | `S3_SECRET_ACCESS_KEY=` |
| Cloudflare bucket | `S3_BUCKET=` |
| YouTube OAuth client ID | `YOUTUBE_CLIENT_ID=` |
| YouTube OAuth client secret | `YOUTUBE_CLIENT_SECRET=` |
| Meta app ID | `META_APP_ID=` |
| Meta app secret | `META_APP_SECRET=` |
| TikTok client key | `TIKTOK_CLIENT_KEY=` |
| TikTok client secret | `TIKTOK_CLIENT_SECRET=` |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET=` |
| Webhook signing secret | `WEBHOOK_SIGNING_SECRET=` |

Never put these values in `NEXT_PUBLIC_*` variables. Anything beginning with `NEXT_PUBLIC_` can be exposed to the browser.

## 14. Test after each service

After adding one service, test only that service before adding another:

```bash
cd /home/ubuntu/creozentic
pnpm env:check
pnpm test:unit
pnpm test:e2e
pnpm build
```

For database changes:

```bash
pnpm exec prisma generate
pnpm exec prisma db push
```

For a real API key, use a tiny non-sensitive request. Check the provider’s usage screen. If a provider asks for payment, stop and leave the feature in local/demo mode.

## References

[1]: https://supabase.com/pricing "Supabase pricing"
[2]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase database connection guide"
[3]: https://upstash.com/pricing/redis "Upstash Redis pricing"
[4]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API pricing"
[5]: https://deepgram.com/pricing "Deepgram pricing"
[6]: https://developers.google.com/youtube/v3/getting-started "YouTube Data API getting started"
[7]: https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app "Meta Instagram app setup"
[8]: https://developers.tiktok.com/doc/content-posting-api-get-started "TikTok Content Posting API getting started"
[9]: https://developers.cloudflare.com/r2/api/tokens/ "Cloudflare R2 API token authentication"
[10]: https://cloud.google.com/free "Google Cloud free program"
