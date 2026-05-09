# AI Budget Assistant

## Architecture

Turborepo monorepo with 5 packages:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 + Prisma 5 + PostgreSQL + Redis | REST API backend |
| `apps/mobile` | Expo 54 + React Native 0.81 + Zustand + SQLite/Drizzle | Mobile app (iOS/Android/Web) |
| `apps/admin` | Next.js 16 + React 19 + TailwindCSS 4 + shadcn/ui + Recharts | Admin web dashboard (port 3001) |
| `packages/shared-types` | TypeScript interfaces | Entities and DTOs shared between api and mobile |
| `packages/shared-utils` | Zod schemas + formatting + constants | Validation and utilities shared between api and mobile |

## Key Patterns

### API (NestJS)
- **Module structure**: `modules/<feature>/` contains `module.ts`, `controller.ts`, `service.ts`, `dto/index.ts`, `guards/`
- **Auth**: JWT via `@UseGuards(JwtAuthGuard)`. Request type: `AuthenticatedRequest` from `common/types/index.ts`. Password reset via 6-digit email code (`POST /auth/forgot-password`, `POST /auth/reset-password`) with in-memory rate limiting and bcrypt-hashed codes
- **Account scoping**: `AccountContextGuard` middleware reads `X-Account-Id` header, resolves membership, adds `accountId` and `accountRole` to request
- **Role-based access**: `AccountRoleGuard` with `@RequireRole('owner')` decorator
- **Service signature**: `(accountId, userId, dto)` as parameters, all Prisma queries filter by `accountId`
- **Database**: Prisma ORM. Schema at `apps/api/prisma/schema.prisma`. Uses `@map("snake_case")` for column names
- **29 modules**: `accounts`, `account-transfers`, `admin`, `ai`, `analytics`, `app-versions`, `auth`, `backups`, `budgets`, `categories`, `currency-exchange`, `debts`, `encryption`, `expenses`, `gamification`, `incomes`, `insights`, `investments`, `mail`, `notifications`, `projects`, `referrals`, `reports`, `subscriptions`, `sync`, `tags`, `telegram`, `users`, `wallet`
- **App version gate**: `modules/app-versions/` — public `GET /app-versions/check?platform=ios|android&version=x.y.z` (no auth, mobile calls before login) returns `{latestVersion, minSupportedVersion, isUpdateAvailable, isUpdateRequired, releaseNotes, storeUrl}`. Admin CRUD under `/admin/app-versions` (behind `JwtAuthGuard + AdminGuard`). Latest row per platform = `ORDER BY publishedAt DESC LIMIT 1`. Service enforces `latestVersion >= minSupportedVersion` via `utils/semver.ts`. Default Play Store URL hardcoded; iOS storeUrl is a placeholder until App Store ID is assigned (admin overrides per row).
- **AI module features**:
  - **Chat Q&A**: Natural language financial questions powered by GPT-4
  - **Natural Language Commands**: Execute actions via chat (create expenses/budgets, query data) using OpenAI function calling
  - **7 AI functions**: `create_expense`, `create_income`, `create_budget`, `create_category`, `get_expenses`, `get_budget_status`, `get_category_breakdown`
  - **Confirmation flow**: Write actions (create_*) require user confirmation before execution; read actions (get_*) execute immediately
  - **Language detection**: Automatically detects user language (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in same language
  - **Currency mapping**: Supports currency symbol detection (₴→UAH, $→USD, €→EUR, zł→PLN, £→GBP, ₽→RUB)
  - **Endpoints**: `POST /ai/chat`, `POST /ai/chat/confirm`, `POST /ai/chat/reject`

- **Telegram bot**: `modules/telegram/` — Telegraf-based bot with 7 handlers: `ChatHandler` (AI chat with usage tracking, 1.0/msg), `VoiceHandler` (Whisper transcription + chat, 2.0), `PhotoHandler` (OCR receipt scan, 2.0), `CommandHandler` (/start, /link, /help, /usage, /account, /newchat, /unlink), `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`. All system messages localized via `helpers/i18n.ts` (8 languages, resolved from `user.language`). AI usage tracked and limits enforced — users get localized warning when limit reached.

### Mobile (React Native/Expo)
- **Navigation**: Expo Router. Screens in `app/`, tabs in `app/(tabs)/` — home, expenses, budgets, analytics, chat
- **State**: 22 Zustand stores in `src/stores/` — `authStore`, `accountStore`, `expenseStore`, `incomeStore`, `budgetStore`, `categoryStore`, `tagStore`, `projectStore`, `walletStore`, `chatStore`, `insightsStore`, `exchangeRateStore`, `subscriptionStore`, `themeStore`, `widgetVisibilityStore`, `debtStore`, `encryptionStore`, `gamificationStore`, `goalStore`, `investmentStore`, `referralStore`, `reportStore`
- **Local DB**: SQLite via Drizzle ORM. Schema in `src/db/schema/index.ts`. 12 repositories in `src/db/*Repository.ts` use raw `executeSql()` — `account`, `category`, `currencyExchange`, `expense`, `expenseItem`, `income`, `project`, `split`, `tag`, `wallet`
- **API client**: `src/services/api.ts` — singleton `ApiClient` class, auto-injects `X-Account-Id` header, auto JWT refresh, 401 → logout
- **Offline-first**: write to SQLite first, queue sync via `syncQueue` table, sync to server when online
- **Local-first tab hydration**: list-bearing tabs (`(tabs)/index`, `expenses`, `budgets`, `analytics`) call their store's `loadXxx()` from both `useEffect([currentAccountId])` AND `useFocusEffect`. Stores (`expenseStore`, `incomeStore`, `budgetStore`, `categoryStore`) read SQLite first, set `isLoading: false` immediately, then refresh from API in the background — so the tab paints from cache instantly and updates as the network call returns. Empty list + `isLoading=true` shows a centered `ActivityIndicator`; empty list + `!isLoading` shows the "Add your first…" empty state. Account switches re-trigger the fetch via the `currentAccountId` dep.
- **i18n**: 8 locales in `src/i18n/locales/` — `en.ts` (source), `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`. When adding keys, update ALL 8 files.
- **Help system**: In-app help screen (`app/help/index.tsx`, `app/help/[id].tsx`) is powered by **auto-generated** `src/help/content.ts`. NEVER create or edit `content.ts` manually. Workflow: (1) write/edit markdown in `user_docs/<lang>/NN-slug.md` for all 8 languages, (2) add the section id to `scripts/generate-help-content.js` SECTIONS array and to `src/help/sections.ts`, (3) run `npm run generate:help` from the project root. Do NOT create a manual `app/help.tsx` file — the route is handled by `app/help/index.tsx`.
- **Services**: `api.ts`, `notifications.ts`, `secureStorage.native.ts` / `secureStorage.web.ts`, `widgetData.ts`, `appVersion.ts` (raw fetch wrapper around the public `/app-versions/check`, used pre-login)
- **Screens**: `(auth)/` login/register/forgot-password/reset-password, `(tabs)/` main tabs, `expense/`, `income/`, `budget/`, `account/`, `analytics/`, `calendar/`, `projects/`, `tags/`, `wallet/` (index, set-balance, exchange/index, exchange/[id], transfer, transfers, exchanges, [id]), `debts/`, `goals/`, `settings/` (index hub, profile, appearance, ai, widgets, notifications, security, categories, data, about, ai-usage-details), `subscription.tsx`, `referral.tsx`, `admin.tsx`, `story.tsx`, `fat-finder.tsx`, `scenario-simulator.tsx`
- **Components**: `charts/` (Bar, Donut, Pie, Weekday, GroupedBar), `interactive-charts/` (drill-down charts with ChartRenderer), `insights/` (InsightCard, InsightCarousel), `widgets/` (NetProfitWidget, NetCapitalWidget, CalendarWidget), `story/`, `chat/` (ActionConfirmationCard, ActionResultCard), `AccountSwitcher`, `AiUsageBadge`, `CreateCategoryModal`, `Paywall`, `ProjectPicker`, `SplitEditor`, `TagPicker`, `TagChip`, `TransactionActionSheet`, `UpdatePrompt` (Google Play / App Store update modal — mounted at root in `app/_layout.tsx`, force/soft modes, dismissal persisted per-version in `secureStorage` under key `skippedUpdateVersion`)
- **Hooks**: `src/hooks/useCalendarData.ts` — shared hook for calendar grid computation, date filtering, category breakdowns with multi-currency conversion. Used by `CalendarWidget` (home screen) and `app/calendar/index.tsx` (full-screen page). `src/hooks/useAiCostConfirmation.ts` — one-time confirmation dialog before expensive AI operations (cost >= 2.0), stores dismissal per feature in AsyncStorage. `src/hooks/useAppVersionCheck.ts` — calls public `/app-versions/check` on mount and on `AppState` `active`, 6h in-memory cache, web no-op, fail-silent (never blocks app boot), exports `__resetAppVersionCheckCache()` test seam.
- **Features**: `src/features/analytics/useAnalytics.ts` — analytics computations hook; `src/features/scenario/useScenarioProjection.ts` — scenario simulator projection hook (pure client-side, reads expense/income stores, projects savings over 3/6/12 months)

### Admin (Next.js)
- **Pages**: Dashboard (`/`), Login (`/login`), Users (`/users`, `/users/[id]`), AI Usage (`/ai-usage`), Subscriptions (`/subscriptions`), Communications (`/communications`), App Versions (`/app-versions`), Audit Log (`/audit-log`), Settings (`/settings`)
- **App Versions page**: per-platform tabs (Android/iOS); list of past releases with "Current" badge on the most recent; "New release" Dialog form with semver-pattern inputs and 8-locale release-notes textareas (EN required); delete-confirm via `Dialog` (codebase has no `AlertDialog` primitive). Hooks: `src/hooks/use-app-versions.ts`.
- **Tech**: Next.js 16 App Router, React Query 5 (data fetching), shadcn/ui components, Recharts (charts), Socket.io-client (real-time), ky (HTTP client)
- **API client**: `src/lib/api-client.ts` — ky instance, auto-injects Bearer token, 401 → logout. Base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3000/api/v1`)
- **Auth**: `src/lib/auth.ts` — login via `POST /auth/login`, tokens in localStorage (`admin_token`, `admin_refresh_token`)
- **Real-time**: `src/lib/socket.ts` — Socket.io namespace `/admin`, events: `new_user`, `ai_request`, `error`, `subscription_change`
- **Dashboard features**: KPI cards, subscription distribution pie chart, registration trends, AI cost by feature, live activity feed, top AI spenders
- **Communications page**: 5 tabs — Send Push, Send Email, Broadcast, Scheduled, History. History tab has summary stats cards, type filter (push/email/broadcast), expandable rows with recipient details (name/email), body preview, broadcast filters, delivery success bar, and paginated list with relative dates

### Shared Types
- Entities: `packages/shared-types/src/entities/index.ts` — 30+ domain interfaces
- DTOs: `packages/shared-types/src/dto/index.ts` — API request/response shapes
- API types: `packages/shared-types/src/api/index.ts` — API endpoint types
- Types use `PascalCase` interfaces, enums use string literal unions (e.g., `type AccountRole = 'owner' | 'editor' | 'viewer'`)
- Key enums: `Currency` (USD/EUR/PLN/GBP/UAH/RUB), `AccountRole` (owner/editor/viewer), `AccountType` (personal/business/shared/investment), `ExpenseSource` (manual/voice/ocr/import), `BudgetPeriod` (daily/weekly/monthly/yearly/custom), `SubscriptionTier` (free/pro/business), `SyncStatus` (pending/synced/conflict/error)

### Shared Utils
- Validation: `packages/shared-utils/src/validation/index.ts` — Zod schemas for auth, expenses, incomes, budgets, categories, tags, projects, sync
- Formatting: `packages/shared-utils/src/formatting/index.ts`
- Constants: `packages/shared-utils/src/constants/index.ts`

## Dependency Order for Changes

When modifying features that span multiple packages, follow this order:

1. `packages/shared-types` — entity interfaces and DTOs
2. `packages/shared-utils` — Zod validation schemas (if needed)
3. `apps/api/prisma/schema.prisma` — database schema, then `npx prisma migrate dev --name <name>` + `npx prisma generate`
4. `apps/api/src/modules/*` — API services, controllers, guards
5. `apps/mobile/src/db/schema/index.ts` — SQLite schema (independent from API DB)
6. `apps/mobile/src/db/*Repository.ts` — data access layer
7. `apps/mobile/src/stores/*` — Zustand stores
8. `apps/mobile/src/services/api.ts` — API client methods
9. `apps/mobile/app/*` — screens and UI
10. `apps/mobile/src/i18n/locales/*.ts` — translations (all 8 files)

Mobile SQLite changes (step 5-6) are independent from API Prisma changes (step 3-4) and can run in parallel.

## Commands

```bash
npm install                    # Install all dependencies
npm run dev                    # Start all dev servers (turbo)
npm run build                  # Build all packages
npm run lint                   # Lint all code
npm run typecheck              # TypeScript check all code
npm run test                   # Run tests
npm run format                 # Prettier format
npm run clean                  # Clean all builds + node_modules

# API specific (run from apps/api/)
npx prisma generate            # Regenerate Prisma client
npx prisma migrate dev --name X  # Create DB migration
npx prisma studio              # Visual DB editor

# Mobile specific (run from apps/mobile/)
npx expo start                 # Start Expo dev server
npx expo start --web           # Start web preview

# Admin specific (run from apps/admin/)
npm run dev                    # Start admin dashboard on port 3001

# Help content (run from project root)
npm run generate:help          # Regenerate apps/mobile/src/help/content.ts from user_docs/
```

## Environment Variables

See `.env.example`:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_EXPIRES_IN` — JWT token config
- `OPENAI_API_KEY` — OpenAI for AI features (Whisper, GPT)
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` — push notifications
- `EXPO_PUBLIC_API_URL` — API URL for mobile app
- `STRIPE_SECRET_KEY` — Stripe API key (apiVersion pinned to `2026-01-28.clover`, must match SDK in `package-lock.json`)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — Telegram bot for in-app commands and ops alerts; also set as GitHub Actions secrets so `uptime-check.yml` can deliver downtime alerts
- `SENTRY_DSN` — optional. When set, `apps/api/src/instrument.ts` initializes `@sentry/node` (must be imported FIRST in `main.ts`, before any other module). When unset, Sentry is a no-op.

## Production

Hetzner VPS (Hetzner cloud), Docker Compose. Stack defined in `docker-compose.prod.yml`:
- `budget-db-prod` (postgres:16-alpine, 512M), `budget-redis-prod` (redis:7-alpine, 96M), `budget-api-prod` (512M), `budget-admin-prod` (256M), plus shared `accounting-nginx` (separate stack) reverse-proxying `api.ai-budget.pl` and `admin.ai-budget.pl`. API container has **no host port mapping** — reach it only through nginx or the docker network.
- Volumes: `ai-budget_postgres_data`, `ai-budget_redis_data` (preserve across deploys; never `docker volume prune` without filters).
- Deploy: push to `development` triggers `.github/workflows/deploy.yml` → SSH → `scripts/deploy.sh` (`git reset --hard`, `npm install` with lock, build, `prisma migrate deploy`, `up -d --force-recreate api admin`). Verify-step polls `https://api.ai-budget.pl/api/v1/health` for up to 120 s.
- **Snap-installed Docker is held and disabled** (`snap refresh --hold docker`, `snap disable docker`) after the 2026-04-27 incident where snap auto-refresh hijacked `/var/run/docker.sock` from the apt-installed daemon. Do not re-enable snap docker; only the apt-installed `dockerd` (system data root `/var/lib/docker`) owns prod state.
- Adding env vars: `docker restart` does NOT reload `env_file`. Must `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate <service>`.

## Observability

- **Health**: `GET /api/v1/health` (public, no auth) — runs `SELECT 1` on Postgres, returns `{status, db, uptimeSeconds, timestamp}`. 503 if DB fails. Used by Docker `HEALTHCHECK` (requires HTTP 200) and CI verify-step.
- **Uptime**: `.github/workflows/uptime-check.yml` runs every 5 min via cron, hits the public `/api/v1/health`. On non-200, sends a Telegram alert via `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` GitHub Secrets with HTTP code, response body, and a link to the failed run.
- **Errors**: `@sentry/node` v8 captures unhandled exceptions and Express 5xx errors. Init must remain at the top of `main.ts` via `import './instrument'` — moving it after other imports breaks instrumentation.
- **No Prometheus / Datadog / external APM** at this time.
