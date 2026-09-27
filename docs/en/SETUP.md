# Setup Guide

Last updated: 2026-09-27

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **PostgreSQL** 14+
- **Redis** 7 (rate limiting, caches, bot state; most caching degrades gracefully without it, security rate limits fail closed)
- **OpenAI API Key**
- **Expo CLI** (for mobile development)
- **Android Studio** or **Xcode** (for native builds)
- **Python 3** (optional — wiki lint scripts and the marketing-site generators)
- **Docker** (only for the production stack)

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/ai-budget-assistant.git
cd ai-budget-assistant
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install
```

### 3. Environment Configuration

#### Backend (.env)

Create `apps/api/.env`:

```env
# Database
# In production, append connection_limit=10 to cap the Prisma connection pool
# (matches docker-compose.prod.yml), e.g. ...:5432/ai_budget?connection_limit=10
DATABASE_URL=postgresql://user:password@localhost:5432/budget_assistant

# Redis — rate limits, caches, bot state, OAuth state
REDIS_URL=redis://localhost:6379

# JWT. Access tokens live JWT_EXPIRES_IN (default 7d); refresh tokens are signed
# with JWT_REFRESH_SECRET and live 30 days (fixed in code), renewed on every refresh.
JWT_SECRET=your-super-secret-key-minimum-32-characters
JWT_REFRESH_SECRET=another-long-random-secret
JWT_EXPIRES_IN=7d

# Google Sign-In — comma-separated OAuth client IDs accepted as ID-token audiences (web,ios,android)
GOOGLE_OAUTH_CLIENT_IDS=

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Server
PORT=3000
# Leave unset for local dev (defaults to localhost:8081 and localhost:3001).
# PRODUCTION must be an explicit comma-separated origin list, never '*':
# with credentials enabled, cors matches '*' as a literal origin, so the admin
# browser gets no Access-Control-Allow-Origin and login breaks.
# e.g. CORS_ORIGIN=https://admin.ai-budget.pl,https://app.ai-budget.pl
CORS_ORIGIN=
# E-mails allowed into the admin dashboard
ADMIN_EMAILS=admin@example.com
# Base URL of receipt-split guest links; leave unset (defaults to https://api.ai-budget.pl)
APP_PUBLIC_URL=

# E-mail (SMTP) for verification codes, reports and admin e-mails
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Push notifications use Expo Push API — no additional config required.

# Telegram — the USER-FACING assistant bot only (chat, expenses, voice, photo)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_USERNAME=
# Webhook mode when set (otherwise long polling, for development)
TELEGRAM_WEBHOOK_URL=
# Secret Telegram sends in X-Telegram-Bot-Api-Secret-Token (required in webhook mode)
TELEGRAM_WEBHOOK_SECRET=
# Legacy — no longer read by the API (ops alerts moved to the ops bot below)
TELEGRAM_CHAT_ID=

# Ops bot — SEPARATE from the assistant bot. New registrations, payments,
# referrals and request-a-bank alerts go here. No fallback: unset = not sent.
# The same names must also exist as GitHub Actions secrets for
# uptime-check.yml / backup-db.yml / infra-watch.yml / docker-gc.yml.
OPS_TELEGRAM_BOT_TOKEN=
OPS_TELEGRAM_CHAT_ID=
# Optional prefix so a shared ops channel can tell projects apart
OPS_PROJECT_NAME=AI Budget

# WhatsApp Business Cloud API (Meta). Token scope: whatsapp_business_messaging.
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
# HMAC key used to verify inbound webhook signatures.
WHATSAPP_APP_SECRET=your-app-secret
# Shown in the mobile app as a wa.me deep link.
WHATSAPP_BUSINESS_PHONE_NUMBER=+1234567890
WHATSAPP_API_VERSION=v21.0
# Meta-approved template that reopens the 24h window for the weekly voice digest.
# Unset = WhatsApp is not offered as a voice-digest channel.
WHATSAPP_DIGEST_TEMPLATE=

# Slack DM bot. Bot token scopes: chat:write, im:history, im:read, im:write,
# files:read, files:write (files:write uploads the voice-digest audio; without it
# the digest falls back to text). Event subscription: message.im.
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_ID=
SLACK_BOT_USER=
# Slack OAuth (multi-workspace install)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_OAUTH_REDIRECT_URL=https://api.ai-budget.pl/slack/oauth/callback
# 32-byte key (openssl rand -hex 32) encrypting per-workspace bot tokens at rest
SLACK_TOKEN_ENC_KEY=

# Stripe (subscriptions). apiVersion in code is pinned to
# '2026-01-28.clover' to match the SDK locked in package-lock.json.
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_REFERRAL_COUPON_ID=
# Price ids are read per currency: STRIPE_{PRO,BUSINESS}_{MONTHLY,YEARLY}_PRICE_ID_<CURRENCY>

# Investments — market data provider
TWELVE_DATA_API_KEY=

# Restore credentials (Android session restore). SHA-256 fingerprint(s) of every
# signing certificate allowed; unset = the feature refuses to start its ceremonies.
RESTORE_CREDENTIAL_CERT_FINGERPRINTS=
RESTORE_CREDENTIAL_RP_ID=ai-budget.pl
RESTORE_CREDENTIAL_RP_NAME=

# Sentry (optional, for production error capture)
SENTRY_DSN=https://<key>@<org>.ingest.<region>.sentry.io/<project>
```

The root [`.env.example`](../../.env.example) is the full, commented reference. Beyond the above it documents optional tuning knobs with safe defaults — `COMMUNITY_*` (community price map: salt, k-anonymity, the read kill-switch `COMMUNITY_PRICE_READ_ENABLED` that must stay off, anti-Sybil thresholds), `RECEIPT_CHECK_*` (receipt price check; `RECEIPT_CHECK_ALERTS_ENABLED` stays off until the rollout in `docs/ops/receipt-price-check-rollout.md`), `SHOPPING_REMINDER_MIN_GAP_DAYS`, and the per-account daily AI ceilings `AI_IMPORT_MAX_PDF_PAGES`, `AI_IMPORT_MAX_INFERENCES_PER_DAY`, `AI_SPLIT_MAX_INFERENCES_PER_DAY`, `AI_CATEGORIZE_MAX_PER_DAY`. The Inflation Shield `SHIELD_*` knobs are listed under [Configuration Options](#configuration-options).

#### Mobile (.env)

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
# Google Sign-In client IDs (the web one is used on web and, through the
# ai-budget.pl/oauth/callback relay, on Android too)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

#### Admin (.env)

Create `apps/admin/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
# Only when the dashboard is served under a sub-path
NEXT_PUBLIC_BASE_PATH=
```

#### Firebase (`google-services.json`)

`apps/mobile/google-services.json` is **not committed** to the repo — the Firebase
Android API key is scanned as a secret by GitHub. Each developer must provide
their own copy.

1. Copy the template:
   ```bash
   cp apps/mobile/google-services.example.json apps/mobile/google-services.json
   ```
2. Download the real `google-services.json` from the
   [Firebase Console](https://console.firebase.google.com/) → *Project settings*
   → *Your apps* → Android app `com.budget.assistant`, and replace the template.
3. Ensure the Android API key is restricted by **package name** + **SHA-1**
   fingerprint in
   [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).

For CI, add the file contents as the `GOOGLE_SERVICES_JSON` GitHub Actions
secret — the `mobile-build` and `mobile-eas-build` workflows write it into
`apps/mobile/google-services.json` before the build step.

### 4. Database Setup

```bash
# Navigate to API directory
cd apps/api

# Generate Prisma client
npm run db:generate          # = npx prisma generate

# Run migrations
npm run db:migrate           # = npx prisma migrate dev

# (Optional) Seed database with sample data
npm run db:seed
```

A change to `schema.prisma` always ships with its migration in the same commit (`npx prisma migrate dev --name <name>`): nothing in CI or the deploy catches a missing one, and `/health` stays green while the first query touching the new column fails.

### 5. Start Development Servers

```bash
# From root directory - start all services
npm run dev

# Or start individually:

# Terminal 1 - Backend
cd apps/api
npm run dev

# Terminal 2 - Mobile
cd apps/mobile
npm run dev                  # expo start

# Terminal 3 - Admin dashboard (port 3001)
cd apps/admin
npm run dev

# Or the web build of the mobile app in a browser (http://localhost:8081)
npm run dev:web              # from the root
```

## Development

### Running the Backend

```bash
cd apps/api

# Development mode with hot reload
npm run dev

# Production build
npm run build
npm run start:prod

# Run tests
npm test
npm run test:e2e
```

### Running the Mobile App

```bash
cd apps/mobile

# Start Expo development server
npm run dev

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android

# Run on Web
npm run web
```

### Running Tests

```bash
# From root - run all tests
npm test

# API tests only
cd apps/api && npm test

# Watch mode (API)
cd apps/api && npm run test:watch

# Coverage report (API)
cd apps/api && npm run test:cov

# Type-check everything
npm run typecheck
```

### Building for Production

```bash
# Build all packages
npm run build

# Build specific package
npm run build -w @budget/api
npm run build -w @budget/mobile
```

## Mobile Development

### iOS Setup

1. Install Xcode from App Store
2. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
4. Run iOS app:
   ```bash
   cd apps/mobile
   npm run ios
   ```

### Android Setup

1. Install Android Studio
2. Install Android SDK (API 33+)
3. Create Android Virtual Device (AVD)
4. Set environment variables:

   **Linux/macOS:**
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```

   **Windows (PowerShell):**
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "D:\ProgramData\Local\Android\Sdk", "User")
   ```
   Or add `ANDROID_HOME` variable via System Properties → Environment Variables.

5. Generate native project (first time only):
   ```bash
   cd apps/mobile
   npx expo prebuild --platform android
   ```

6. Run Android app:
   ```bash
   cd apps/mobile
   npm run android
   ```

> **Important**: The app uses native build (`expo run:android`), not Expo Go, because it requires the `DETECT_SCREEN_CAPTURE` permission for Android 14+.

> **Location permission (ABA-310)**: the app declares `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` (Android) and `NSLocationWhenInUseUsageDescription` (iOS) via `expo-location`, for the opt-in "attach location to new expenses" feature. It is off by default and the permission is requested only when the user enables the toggle (receipt-address geocoding needs no device permission). These are already committed in `android/app/src/main/AndroidManifest.xml` and `app.json` — a stray `expo prebuild` must not drop them.

### Building Native Apps

#### iOS

```bash
cd apps/mobile

# Build for development
eas build --platform ios --profile development

# Build for production
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android

```bash
cd apps/mobile

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Docker Deployment

The files actually used are `docker/Dockerfile.api`, `docker/Dockerfile.admin` and `docker-compose.prod.yml` (see [Production Deployment](#production-deployment)); the repo has no development compose file. The snippets in this section are illustrative only.

### Backend

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/budget_assistant
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=budget_assistant
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Running with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## Production Deployment

The committed `docker-compose.prod.yml` is the source of truth for production
on the Hetzner VPS. Key differences from the dev compose above:

- **API has no host port mapping** — `budget-api-prod` is reachable only via
  the docker network; `shared-nginx` (a separate stack) terminates TLS for
  `api.ai-budget.pl` and proxies upstream. Do not `curl localhost:3000` from
  the VPS — it will not resolve. Always go through the public URL.
- **Volumes** `ai-budget_postgres_data` and `ai-budget_redis_data` MUST be
  preserved across deploys. Never run `docker volume prune` without filters.
- **`env_file`** is read only when the container is created (not on
  `docker restart`). To pick up new env vars:
  ```bash
  cd /opt/ai-budget
  docker compose -f docker-compose.prod.yml --env-file .env.production \
    up -d --force-recreate api
  ```

### CI/CD

`.github/workflows/deploy.yml` triggers on every push to `development` that
touches `apps/api/**`, `apps/admin/**`, `packages/**`, `docker/**`,
`docker-compose.prod.yml`, or `scripts/deploy.sh`. The workflow:

1. SSHs into the VPS and runs `scripts/deploy.sh` (git reset, `npm install`
   with `package-lock.json` copied, `prisma migrate deploy`,
   `up -d --force-recreate api admin`, then `docker image prune -f` +
   `docker builder prune -af` to reclaim the build cache each deploy).
2. Verify-step polls `https://api.ai-budget.pl/api/v1/health` for up to 120s
   and fails the run with log dump if the service does not become healthy.

Before the SSH step the runner executes `scripts/check-no-shared-utils-runtime-import.sh`: a runtime `import`/`require` of `@budget/shared-utils` in `apps/api/src` fails the deploy, because the API has no build step for workspace packages (`import type` is fine).

The web build is deployed separately by `.github/workflows/web-deploy.yml` on every push to `development` (not path-filtered); it sets `EXPO_PUBLIC_BUILD_SHA` so the About screen shows `<version>+<short sha>`. Details: `docs/wiki/features/web-build-and-hosting.md`.

### Snap Docker is held

After the 2026-04-27 outage caused by `snap` auto-refreshing the Docker
package and hijacking `/var/run/docker.sock` from the apt-installed daemon,
snap docker is now `held` and `disabled`:

```bash
snap refresh --hold docker
snap disable docker
```

Only the apt-installed `dockerd` should manage production containers.
Do not re-enable the snap version. The system data root is
`/var/lib/docker`; preserve it.

### Disk hygiene

`scripts/deploy.sh` already runs `docker image prune -f` + `docker builder prune -af`
on every deploy — the build cache was the main cause of the disk reaching 89%
(ABA-165), since images are built on the VPS. Manual cleanup is rarely needed now:

```bash
journalctl --vacuum-size=500M    # cap journal logs (~2-3 GB savings)
apt-get clean                    # apt cache (~400 MB)
docker builder prune -af         # all build cache (safe; no volumes)
docker image prune -f            # dangling untagged images
# NEVER: docker system prune --volumes  (would wipe postgres data)
```

Because `deploy.yml` is path-filtered, a stretch of mobile/marketing/docs work means the per-deploy prune never runs; the scheduled **`.github/workflows/docker-gc.yml`** (`scripts/docker-gc.sh`, Sundays 01:00 UTC plus `workflow_dispatch`) is what actually bounds the build cache — it does nothing below 70% disk and alerts only when the disk is still above 85% after cleaning. The Docker daemon is shared with other projects' containers, so `docker volume prune` (with any filter) and `docker image prune -a` are both forbidden. Runbook: `docs/ops/disk-pressure.md`.

To investigate what is consuming disk without SSHing in yourself, run the
**Infra Diagnostics** workflow (`.github/workflows/infra-diagnostics.yml`,
manual `workflow_dispatch`). It runs `scripts/infra-diagnostics.sh` over SSH and
prints `df -h`, `docker system df`, and a `du` breakdown to the run log.

## Database Backups

Production PostgreSQL is backed up nightly and off-host (ABA-163). The backup
runner never touches live data and holds only the encryption **public** key, so
even a fully compromised CI cannot read past backups.

### Nightly workflow

`.github/workflows/backup-db.yml` runs on cron `0 2 * * *` (02:00 UTC) and can
also be triggered manually via `workflow_dispatch`. It runs on a GitHub Actions
runner (not the VPS) and performs:

1. SSH into the VPS and `docker exec budget-db-prod pg_dump -Fc` (custom format)
   — see `scripts/backup-db.sh`.
2. Sanity-check the dump: minimum size (10 KB) and `pg_restore --list` object
   count (≥ 10). A suspect dump fails the run.
3. Encrypt with `age` (asymmetric) using the recipient public key — the runner
   never has the private key.
4. Publish the encrypted archive as a Release asset
   (`ai_budget-YYYY-MM-DD.dump.age`, tag `backup-YYYY-MM-DD`) in the **private**
   backup repo `BACKUP_REPO`.
5. Prune old backups with GFS retention (`scripts/prune-backups.sh`):
   **7 daily** + **4 weekly** (Sunday anchors) + **6 monthly** (1st-of-month
   anchors); everything else is deleted.
6. On failure, send a Telegram alert to the ops channel via
   `OPS_TELEGRAM_BOT_TOKEN` / `OPS_TELEGRAM_CHAT_ID`.

### Scope and RPO

- **RPO ≤ 24 h** (worst case = data written since the last 02:00 UTC dump).
- **Redis is NOT backed up** — it is cache only and can be rebuilt.
- **Receipt images are stored in-DB**, so the `pg_dump` already includes them;
  there is no separate blob backup.

### Decryption key (offline)

The `age` **private key is offline** and owner-held (e.g. in a password
manager). It is **not** in CI and is the only thing that can decrypt any backup.
Losing it means losing every backup. The full restore procedure (download →
decrypt → verify into a scratch DB → restore to production) lives in
[`docs/ops/restore-runbook.md`](../ops/restore-runbook.md).

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `AGE_PUBLIC_KEY` | `age1...` recipient public key the runner encrypts to |
| `BACKUP_REPO` | `owner/repo` of the private backup repo holding the Release assets |
| `BACKUP_REPO_TOKEN` | PAT with `contents:write` on the backup repo (publish + prune) |
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | VPS access for the dump (reused from deploy) |
| `OPS_TELEGRAM_BOT_TOKEN`, `OPS_TELEGRAM_CHAT_ID` | Failure alerts to the ops channel (shared with uptime, infra-watch and docker-gc) |

## Monitoring & Observability

### Health endpoint

`GET /api/v1/health` (public, no auth):

```json
{
  "status": "ok",
  "db": "ok",
  "uptimeSeconds": 384,
  "timestamp": "2026-04-27T18:22:48.653Z"
}
```

Returns HTTP `503` with `db: "fail"` if Postgres is unreachable.
Used by:

- Docker `HEALTHCHECK` in `docker/Dockerfile.api` (requires HTTP 200).
- CI verify-step (waits up to 120s after `force-recreate`).
- External uptime monitor (below).

### Uptime monitor

`.github/workflows/uptime-check.yml` runs every 5 minutes:

1. Curls the public `/api/v1/health` with retries.
2. On non-200 or transport failure, sends a Telegram message to the ops
   channel via `OPS_TELEGRAM_BOT_TOKEN` / `OPS_TELEGRAM_CHAT_ID` (GitHub
   Actions secrets, NOT in repo env files).
3. Run is marked `failure` so it shows up red in Actions UI.

To override the URL (e.g. for a staging probe), set repo variable
`HEALTH_URL`.

### Infra watch (disk + containers)

`.github/workflows/infra-watch.yml` runs every 30 minutes:

1. SSHes to the VPS and pipes `scripts/infra-check.sh` over the connection
   (`ssh … 'bash -s' < scripts/infra-check.sh`), so it does not depend on a
   deploy having landed.
2. The script checks root-disk usage on `/` (alerts if above `DISK_THRESHOLD`,
   default `85`%) and that each prod container (`budget-db-prod`,
   `budget-redis-prod`, `budget-api-prod`, `budget-admin-prod`) is running and
   not `unhealthy`.
3. On any problem, the captured summary is sent to Telegram (same secrets as
   the uptime monitor). No new secrets are required.

This complements the uptime monitor with disk pressure and per-container
granularity the HTTP probe cannot see.

### Log rotation

`docker-compose.prod.yml` sets a `json-file` logging driver with
`max-size: "10m"` / `max-file: "3"` on `postgres`, `redis`, `api`, and `admin`
(~30 MB cap per container) so container logs cannot fill the disk. The limit
applies after the next `up -d` recreates the containers.

### Disaster recovery

- `docs/ops/restore-runbook.md` — restore the database onto a working server.
- `docs/ops/disaster-recovery-runbook.md` — rebuild the whole stack after a
  total VPS loss.

Both require the **offline `age` private key** (decrypts the backups). The full
rebuild also requires an **offline copy of `.env.production`** — the prod
secrets live only on the VPS, so keep a copy in the password manager. Redis is
cache-only and is intentionally **not** persisted (it repopulates on restart).

### Sentry

`apps/api/src/instrument.ts` is imported as the very first line of
`main.ts` so it can install hooks before any other module loads. If
`SENTRY_DSN` is set, `@sentry/node` v8 initializes with:

- `tracesSampleRate: 0.1` in production, `0` otherwise
- `release: process.env.GIT_SHA` if exposed by deploy
- Express error handler hooked after Nest boot via
  `Sentry.setupExpressErrorHandler(...)`

Without `SENTRY_DSN`, the SDK no-ops and nothing is sent.

To verify reachability without redeploying, send a test event from inside
the running container:

```bash
docker exec -e SENTRY_DSN="$DSN" budget-api-prod node -e \
  'const S=require("@sentry/node"); S.init({dsn:process.env.SENTRY_DSN}); \
   S.captureException(new Error("boot test")); S.close(5000)'
```

## Configuration Options

### Backend Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | optional |
| `JWT_SECRET` | Secret for signing JWTs | required |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (30-day lifetime, fixed in code) | required |
| `JWT_EXPIRES_IN` | Access token expiry | `7d` |
| `GOOGLE_OAUTH_CLIENT_IDS` | Comma-separated Google OAuth client IDs accepted by `POST /auth/google` | required for Google sign-in |
| `ADMIN_EMAILS` | Comma-separated e-mails `AdminGuard` admits to `/admin/*` (and the admin Socket.io namespace) | required for the admin dashboard |
| `APP_PUBLIC_URL` | Base URL of receipt-split guest links | `https://api.ai-budget.pl` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing e-mail | required for e-mail |
| `OPENAI_API_KEY` | OpenAI API key | required |
| `PORT` | Server port | `3000` |
| `CORS_ORIGIN` | Allowed origins. Prod: explicit comma-separated list, never `*` | `*` |
| `STRIPE_SECRET_KEY` | Stripe key (apiVersion pinned to `2026-01-28.clover`) | required for billing |
| `STRIPE_WEBHOOK_SECRET` | Verifies `POST /webhooks/stripe` | required for billing |
| `STRIPE_{PRO,BUSINESS}_{MONTHLY,YEARLY}_PRICE_ID_<CUR>` | Stripe price id per plan, period and currency | required for checkout |
| `STRIPE_REFERRAL_COUPON_ID` | Coupon for the referral free-month reward | optional |
| `TELEGRAM_BOT_TOKEN` | User-facing assistant bot token | optional |
| `TELEGRAM_BOT_USERNAME` | Bot username shown with link codes | optional |
| `TELEGRAM_WEBHOOK_URL` | Enables webhook mode (else long polling) | optional |
| `TELEGRAM_WEBHOOK_SECRET` | Expected `X-Telegram-Bot-Api-Secret-Token` | required in webhook mode |
| `TELEGRAM_CHAT_ID` | Legacy, no longer read by the API | — |
| `OPS_TELEGRAM_BOT_TOKEN`, `OPS_TELEGRAM_CHAT_ID` | Ops bot for system alerts (no fallback to the assistant bot) | optional |
| `OPS_PROJECT_NAME` | Prefix on every ops message | optional |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API access token (`whatsapp_business_messaging` scope) | optional |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | optional |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID | optional |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | optional |
| `WHATSAPP_APP_SECRET` | HMAC key for inbound webhook signature verification | optional |
| `WHATSAPP_BUSINESS_PHONE_NUMBER` | Phone number shown as a `wa.me` deep link in the app | optional |
| `WHATSAPP_API_VERSION` | Meta Graph API version (e.g. `v21.0`) | optional |
| `WHATSAPP_DIGEST_TEMPLATE` | Approved template for the weekly voice digest; unset = WhatsApp not offered | optional |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_ID`, `SLACK_BOT_USER` | Slack DM bot (no-op when unset); needs the `files:write` scope for voice-digest audio | optional |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_OAUTH_REDIRECT_URL` | Slack multi-workspace OAuth | optional |
| `SLACK_TOKEN_ENC_KEY` | 32-byte key encrypting stored workspace tokens | required with Slack OAuth |
| `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` | Signing-cert SHA-256 fingerprints allowed to use restore credentials | required for the feature |
| `RESTORE_CREDENTIAL_RP_ID`, `RESTORE_CREDENTIAL_RP_NAME` | WebAuthn relying party | `ai-budget.pl`, `AI Budget Assistant` |
| `TWELVE_DATA_API_KEY` | Market data for investments | optional |
| `AI_CATEGORIZE_MAX_PER_DAY` | Daily model passes of categorize-uncategorized per account | `5` |
| `AI_IMPORT_MAX_PDF_PAGES`, `AI_IMPORT_MAX_INFERENCES_PER_DAY` | AI statement-import limits | `20`, `20` |
| `AI_SPLIT_MAX_INFERENCES_PER_DAY` | Daily receipt auto-split classifications per account | `20` |
| `COMMUNITY_PRICE_SALT`, `COMMUNITY_PRICE_K`, `COMMUNITY_PRICE_READ_ENABLED`, `COMMUNITY_*` | Community price map (reads stay off) — see `.env.example` | off |
| `RECEIPT_CHECK_*` | Receipt price check tuning; `RECEIPT_CHECK_ALERTS_ENABLED` stays off | see `.env.example` |
| `SHOPPING_REMINDER_MIN_GAP_DAYS` | Minimum days between shopping pushes | `2` |
| `SENTRY_DSN` | Sentry DSN; absence makes the SDK a no-op | optional |
| `SHIELD_MIN_MONTHLY_RISE_PCT` | Inflation Shield: minimum forecast monthly price rise (%) to recommend a product | `5` |
| `SHIELD_MIN_CADENCE_DAYS` | Inflation Shield: minimum purchase cadence (days) for a product to be considered stockpileable | `14` |
| `SHIELD_MAX_STOCK_WEEKS` | Inflation Shield: cap on the stock-up horizon (weeks) used to size a recommended quantity | `8` |
| `SHIELD_MAX_UNITS` | Inflation Shield: hard cap on the recommended stock-up quantity per product | `12` |
| `SHIELD_MIN_POINTS` | Inflation Shield: minimum price data points required before forecasting a product | `3` |
| `SHIELD_FORECAST_LOOKBACK_WEEKS` | Inflation Shield: regression window (weeks) used to forecast a product's price trend | `12` |
| `SHIELD_MIN_SPAN_DAYS` | Inflation Shield: minimum time span (days) covered by the lookback window for a forecast to be trusted | `14` |
| `SHIELD_HORIZON_WEEKS` | Inflation Shield: forecast horizon (weeks) | `4` |

All `SHIELD_*` variables are optional overrides of `SHIELD_DEFAULTS` (`apps/api/src/modules/insights/inflation-shield.util.ts`) — set only when tuning the Inflation Shield engine.

### Mobile Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API URL (including `/api/v1`) | `http://localhost:3000/api/v1` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth client used for sign-in (web, and Android via the relay) | required for Google sign-in |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Per-platform client IDs — set in `eas.json`/`.env.example` but not read by the current code | optional |
| `EXPO_PUBLIC_BUILD_SHA` | Git commit sha shown on the About screen as `1.26.0+<7-char sha>` instead of the bare version. `web-deploy.yml` sets it to `github.sha` for the web build; a local build normally leaves it unset, and native never sets it | optional |

### Expo App Configuration

Edit `apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Budget Assistant",
    "slug": "budget-assistant",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.budgetassistant"
    },
    "android": {
      "package": "com.yourcompany.budgetassistant"
    }
  }
}
```

## Troubleshooting

### Common Issues

#### Database Connection Failed

```
Error: P1001: Can't reach database server
```

**Solution**: Ensure PostgreSQL is running and `DATABASE_URL` is correct.

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql
```

#### Prisma Client Not Found

```
Error: @prisma/client did not initialize yet
```

**Solution**: Regenerate Prisma client.

```bash
cd apps/api
npm run db:generate
```

#### Metro Bundler Cache Issues

```
Error: Unable to resolve module
```

**Solution**: Clear Metro cache.

```bash
cd apps/mobile
npx expo start --clear
```

#### iOS Build Failed

```
Error: Command PhaseScriptExecution failed
```

**Solution**: Clear derived data and reinstall pods.

```bash
cd apps/mobile/ios
rm -rf ~/Library/Developer/Xcode/DerivedData
pod deintegrate
pod install
```

#### Android Build Failed

```
Error: Could not find com.android.tools.build:gradle
```

**Solution**: Sync Gradle and clear cache.

```bash
cd apps/mobile/android
./gradlew clean
./gradlew --refresh-dependencies
```

### Getting Help

- Check [GitHub Issues](https://github.com/your-org/ai-budget-assistant/issues)
- Review [API Documentation](./API.md)
- See [Architecture](./ARCHITECTURE.md) for system design

## Scripts Reference

### Root Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all services in development |
| `npm run dev:web` | Start the mobile app in a browser (Expo web) |
| `npm run build` | Build all packages |
| `npm test` | Run all tests |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | Type-check all packages |
| `npm run format` | Prettier format |
| `npm run generate:help` | Regenerate `apps/mobile/src/help/content.ts` from `user_docs/` (never edit that file by hand) |
| `npm run clean` | Clean all build artifacts |

Documentation checks (Python, no model): `python scripts/wiki-lint.py` and `python scripts/wiki-staleness.py` — the same checks `wiki-audit.yml` runs weekly.

### API Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Build for production |
| `npm run start:prod` | Run production build |
| `npm test` | Run unit tests |
| `npm run test:watch` / `npm run test:cov` | Watch mode / coverage |
| `npm run test:e2e` | Run E2E tests |
| `npm run typecheck` | Type-check |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:seed` | Prisma generate / migrate dev / db push / seed |
| `npm run db:studio` | Open Prisma Studio |

### Mobile Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Expo server |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm run web` | Run on Web |
| `npm run build:ios` | Build iOS app |
| `npm run build:android` | Build Android app |
| `npm run typecheck` / `npm run lint` / `npm test` | Type-check / lint / Jest |

### Admin Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the dashboard on port 3001 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` / `npm run lint` | Type-check / lint |
