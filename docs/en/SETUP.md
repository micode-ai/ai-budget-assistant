# Setup Guide

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **PostgreSQL** 14+
- **Redis** (optional, for caching)
- **OpenAI API Key**
- **Expo CLI** (for mobile development)
- **Android Studio** or **Xcode** (for native builds)

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
DATABASE_URL=postgresql://user:password@localhost:5432/budget_assistant

# Redis (optional)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-key-minimum-32-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Server
PORT=3000
CORS_ORIGIN=*

# Push notifications use Expo Push API — no additional config required.

# Telegram (bot for in-app commands; same token used by the
# uptime-check GitHub Actions workflow for downtime alerts)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Stripe (subscriptions). apiVersion in code is pinned to
# '2026-01-28.clover' to match the SDK locked in package-lock.json.
STRIPE_SECRET_KEY=sk_live_or_test_...

# Sentry (optional, for production error capture)
SENTRY_DSN=https://<key>@<org>.ingest.<region>.sentry.io/<project>
```

#### Mobile (.env)

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
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
npm run prisma generate

# Run migrations
npm run prisma migrate dev

# (Optional) Seed database with sample data
npm run prisma db seed
```

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
npm start
```

## Development

### Running the Backend

```bash
cd apps/api

# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start:prod

# Run tests
npm test
npm test:e2e
```

### Running the Mobile App

```bash
cd apps/mobile

# Start Expo development server
npm start

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

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
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
   `up -d --force-recreate api admin`).
2. Verify-step polls `https://api.ai-budget.pl/api/v1/health` for up to 120s
   and fails the run with log dump if the service does not become healthy.

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

```bash
journalctl --vacuum-size=500M    # cap journal logs (~2-3 GB savings)
apt-get clean                    # apt cache (~400 MB)
docker builder prune -f          # build cache only (safe; no volumes)
docker image prune -f            # dangling untagged images
# NEVER: docker system prune --volumes  (would wipe postgres data)
```

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
2. On non-200 or transport failure, sends a Telegram message to
   `TELEGRAM_CHAT_ID` via `TELEGRAM_BOT_TOKEN` (both stored as GitHub
   Actions secrets, NOT in repo env files).
3. Run is marked `failure` so it shows up red in Actions UI.

To override the URL (e.g. for a staging probe), set repo variable
`HEALTH_URL`.

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
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `OPENAI_API_KEY` | OpenAI API key | required |
| `PORT` | Server port | `3000` |
| `CORS_ORIGIN` | Allowed origins | `*` |
| `STRIPE_SECRET_KEY` | Stripe key (apiVersion pinned to `2026-01-28.clover`) | required for billing |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (in-app + ops alerts) | optional |
| `TELEGRAM_CHAT_ID` | Chat ID for system/uptime notifications | optional |
| `SENTRY_DSN` | Sentry DSN; absence makes the SDK a no-op | optional |

### Mobile Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API URL | required |

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
npm run prisma generate
```

#### Metro Bundler Cache Issues

```
Error: Unable to resolve module
```

**Solution**: Clear Metro cache.

```bash
cd apps/mobile
npm start --clear
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
| `npm run build` | Build all packages |
| `npm test` | Run all tests |
| `npm run lint` | Lint all packages |
| `npm run clean` | Clean all build artifacts |

### API Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Build for production |
| `npm start:prod` | Run production build |
| `npm test` | Run unit tests |
| `npm test:e2e` | Run E2E tests |
| `npm run prisma studio` | Open Prisma Studio |

### Mobile Package

| Script | Description |
|--------|-------------|
| `npm start` | Start Expo server |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm run web` | Run on Web |
| `npm run build:ios` | Build iOS app |
| `npm run build:android` | Build Android app |
