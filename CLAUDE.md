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
- **Auth**: JWT via `@UseGuards(JwtAuthGuard)`. Request type: `AuthenticatedRequest` from `common/types/index.ts`. Password reset via 6-digit email code (`POST /auth/forgot-password`, `POST /auth/reset-password`) with in-memory rate limiting and bcrypt-hashed codes. Email change also via 6-digit code (`POST /auth/change-email/request`, `POST /auth/change-email/confirm`) — JWT-guarded, requires current password on request, issues new tokens on confirm
- **Account scoping**: `AccountContextGuard` middleware reads `X-Account-Id` header, resolves membership, adds `accountId` and `accountRole` to request
- **Role-based access**: `AccountRoleGuard` with `@RequireRole('owner')` decorator
- **Service signature**: `(accountId, userId, dto)` as parameters, all Prisma queries filter by `accountId`
- **Transaction attribution**: `Expense.userId` and `Income.userId` already store the creator's id (set from `request.userId` at create time). Both services include `user: { select: { name: true } }` in all Prisma queries and call a `toExpenseResponse()`/`toIncomeResponse()` helper to flatten it into `createdByUserName: string | null` on the returned object. No migration needed — just always pass the user include and map the result.
- **Database**: Prisma ORM. Schema at `apps/api/prisma/schema.prisma`. Uses `@map("snake_case")` for column names
- **29 modules**: `accounts`, `account-transfers`, `admin`, `ai`, `analytics`, `app-versions`, `auth`, `backups`, `budgets`, `categories`, `currency-exchange`, `debts`, `encryption`, `expenses`, `gamification`, `incomes`, `insights`, `investments`, `mail`, `notifications`, `projects`, `referrals`, `reports`, `subscriptions`, `sync`, `tags`, `telegram`, `users`, `wallet`
- **Debt reminders**: `modules/debts/debt-reminder.cron.ts` — `@Cron('0 9 * * *')` daily cron that finds active lent/borrowed debts due in 3 days (upcoming) or overdue yesterday, batches repayment queries to compute remaining balance, and calls `NotificationsService.sendToUser(..., 'debt_reminder')`. Respects `user.notifyDebtReminders` preference (default `true`). User preference toggle in `app/settings/notifications.tsx`. `NotificationType` includes `'debt_reminder'`; `NotificationPreferencesResponse` includes `debtReminders: boolean`.
- **Recurring expenses**: `modules/expenses/expense-recurring.cron.ts` — `@Cron('0 8 * * *')` daily cron that groups all active recurring expenses by `recurringId`, takes the most recent per series, computes `nextDue = lastDate + period` (weekly/monthly/yearly), and if `nextDue <= today` clones the expense with today's date (same `recurringId`) and sends a push notification. Respects `user.notifyRecurringExpenses` preference (default `true`). Mobile new-expense form has a "Repeat" toggle + period chip picker that sets `isRecurring: true`, assigns a `recurringId` UUID, and sets `recurringPeriod`. Expense detail screen shows a "Part of a recurring series" banner with period label and an inline "Stop Recurring" button (`PATCH /expenses/:id/stop-recurring` sets `isRecurring: false`; history preserved). User preference toggle in `app/settings/notifications.tsx`.
- **App version gate**: `modules/app-versions/` — public `GET /app-versions/check?platform=ios|android&version=x.y.z` (no auth, mobile calls before login) returns `{latestVersion, minSupportedVersion, isUpdateAvailable, isUpdateRequired, releaseNotes, storeUrl}`. Admin CRUD under `/admin/app-versions` (behind `JwtAuthGuard + AdminGuard`). Latest row per platform = `ORDER BY publishedAt DESC LIMIT 1`. Service enforces `latestVersion >= minSupportedVersion` via `utils/semver.ts`. Default Play Store URL hardcoded; iOS storeUrl is a placeholder until App Store ID is assigned (admin overrides per row).
- **Budget history**: `GET /budgets/:id/history?periods=6` returns chronological `BudgetHistoryEntry[]` ({periodStart, periodEnd, limit, actual, isOverBudget}). Uses `computeBudgetPeriod` to iterate the last N periods (max 12). Returns `[]` for `custom`-period budgets. Category / currency filters mirror `getProgress`. Mobile stores result in `budgetStore.budgetHistory[budgetId]` (in-memory, fetched on budget detail screen mount).
- **AI module features**:
  - **Chat Q&A**: Natural language financial questions powered by GPT-4
  - **Natural Language Commands**: Execute actions via chat (create expenses/budgets, query data) using OpenAI function calling
  - **11 AI functions**: `create_expense`, `create_income`, `create_budget`, `create_category`, `get_expenses`, `get_budget_status`, `get_category_breakdown`, `record_debt_repayment`, `create_debt`, `get_debt_summary`, `update_goal_balance`
  - **Debt commands**: `record_debt_repayment(debtId, amount, date?)` creates a linked repayment income/expense; `create_debt(contactName, amount, currencyCode, direction, dueDate?)` creates lent (Expense) or borrowed (Income) record with `isDebt=true`; `get_debt_summary()` returns active debts (read, cached). AI resolves contact names via `activeDebts` context (ids included) — ambiguous names trigger clarifying question.
  - **Goal command**: `update_goal_balance(goalId, newAmount)` calls `GoalPlannerService.updateGoal({ currentAmount })`. Resolves goal names via `savingsGoals` context (ids now included). Auto-completes goal if `currentAmount >= targetAmount`.
  - **Confirmation flow**: Write actions (`create_*`, `record_debt_repayment`, `update_goal_balance`) require user confirmation before execution; read actions (`get_*`) execute immediately (10-min cache)
  - **Language detection**: Automatically detects user language (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in same language
  - **Currency mapping**: Supports currency symbol detection (₴→UAH, $→USD, €→EUR, zł→PLN, £→GBP, ₽→RUB)
  - **Endpoints**: `POST /ai/chat`, `POST /ai/chat/confirm`, `POST /ai/chat/reject`; `GET /ai/chat/conversations` (last 20, per-user, no AccountContextGuard), `GET /ai/chat/conversations/:id/messages` (last 50, user+assistant roles only, 404 if wrong user)
  - **Chat history**: `ChatConversation` + `ChatMessage` models already stored server-side. Mobile loads history via `chatStore.loadConversations()` / `loadConversation(id)` with SQLite cache (in `src/db/chatRepository.ts`). Chat tab shows a History bottom-sheet and a "New Conversation" button when browsing past conversations.

- **Telegram bot**: `modules/telegram/` — Telegraf-based bot with 7 handlers: `ChatHandler` (AI chat with usage tracking, 1.0/msg), `VoiceHandler` (Whisper transcription + chat, 2.0), `PhotoHandler` (OCR receipt scan, 2.0), `CommandHandler` (/start, /link, /help, /usage, /account, /newchat, /unlink), `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`. All system messages localized via `helpers/i18n.ts` (8 languages, resolved from `user.language`). AI usage tracked and limits enforced — users get localized warning when limit reached.

- **WhatsApp bot**: `modules/whatsapp/` — `@Global()` NestJS module using the official Meta Business Cloud API. Parallel to Telegram with identical features (chat, voice/Whisper, OCR receipts, expense/income/category commands), reusing the same shared services (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). Differences from Telegram: (a) **webhook-only** at `POST /whatsapp/webhook` excluded from `/api/v1` prefix in `main.ts`; (b) **HMAC-SHA256** signature verification via `verifySignature` helper using globally-available `req.rawBody` (Stripe pattern in `main.ts:13-20`); (c) **Redis-backed state** instead of in-memory Map — `wa:msg:{id}` (idempotency, TTL 24h), `wa:pa:{shortId}` (pending AI actions, TTL 1800s), `wa:receipt:{shortId}` + `wa:awaiting_date:{phone}` (receipt-scan date-change flow), `wa:cat:{shortId}` (category-name passthrough); (d) **callback IDs** use `--` separator (UUIDs contain single `-`); (e) **interactive elements** via `WhatsAppClientService.sendButtons` (max 3 buttons × 20 char labels) and `sendList` (max 10 rows); (f) **WhatsApp markdown** instead of HTML (`*bold*`, `_italic_`, `` `code` ``) via `markdownToWhatsApp` helper. Account linking via 6-hex code: mobile shows QR + `wa.me/{phone}?text=link%20{code}` deep link (`apps/mobile/app/settings/whatsapp.tsx` using `react-native-qrcode-svg`); bot's `CommandHandler.handleLink` is the only command accepted from unlinked numbers. Link endpoints live on `UsersController` (`POST/GET/DELETE /users/me/whatsapp-link[-code]`) mirroring Telegram precedent. `helpers/i18n.ts` is a port of telegram's with HTML→WA-markdown substitutions across all 33 keys × 8 languages.

### Mobile (React Native/Expo)
- **Platforms**: iOS, Android, **Web** (Expo web via `react-native-web` + Metro). Web is supported for quick browser testing — run `npm run dev:web` from project root (or `npm run web` from `apps/mobile/`). On web, native-only modules fall back via platform-specific files: `secureStorage.web.ts` (localStorage), `db/client.web.ts` (in-memory mock, no persistence — server still works), `useBiometric.web.ts` (no-op). MMKV uses its built-in `createMMKV.web.ts` (localStorage-backed). `expo-notifications`, `react-native-android-widget`, `expo-screen-orientation` are guarded by `Platform.OS === 'web'` checks or platform-specific imports. **Caveat**: SQLite-backed offline-first flows are disabled on web — data shows only what the API returns, no local cache; receipts/voice/biometric features are also degraded. Use web for UI testing, not full functional testing.
- **Navigation**: Expo Router. Screens in `app/`, tabs in `app/(tabs)/` — home, expenses, budgets, analytics, chat. `(tabs)/_layout.tsx` fires `Haptics.selectionAsync()` on every `tabPress` via `screenListeners` (`expo-haptics`, web no-op).
- **State**: 23 Zustand stores in `src/stores/` — `authStore`, `accountStore`, `expenseStore`, `incomeStore`, `budgetStore`, `categoryStore`, `tagStore`, `projectStore`, `walletStore`, `chatStore`, `insightsStore`, `exchangeRateStore`, `subscriptionStore`, `themeStore`, `widgetVisibilityStore`, `debtStore`, `encryptionStore`, `gamificationStore`, `goalStore`, `investmentStore`, `referralStore`, `reportStore`, `scenarioStore`
- **Local DB**: SQLite via Drizzle ORM. Schema in `src/db/schema/index.ts`. 13 repositories in `src/db/*Repository.ts` use raw `executeSql()` — `account`, `category`, `chat`, `currencyExchange`, `expense`, `expenseItem`, `income`, `project`, `split`, `tag`, `wallet`
- **API client**: `src/services/api.ts` — singleton `ApiClient` class, auto-injects `X-Account-Id` header, auto JWT refresh, 401 → logout
- **Offline-first**: write to SQLite first, queue sync via `syncQueue` table, sync to server when online
- **Local-first tab hydration**: list-bearing tabs (`(tabs)/index`, `expenses`, `analytics`) call `hydrateTransactions()` from `useEffect([currentAccountId])` (not `useFocusEffect`). `hydrateTransactions` (in `src/stores/hydrateTransactions.ts`) is the single coordinator that runs `loadExpenses` then `loadIncomes` **sequentially** (parallel made them contend on the single SQLite connection — local reads went from 65ms steady to 65-602ms spiky) and exposes a `useHydrationStore.isHydrating` flag. It has its own re-entry guard, so the ~5 parallel call sites (`DatabaseProvider`, `authStore` × 5, `AccountSwitcher`, three tab `useEffect`s) collapse to one hydrate cycle. Pull-to-refresh and `settings/data.tsx` "Sync now" call it with `{ force: true }`. Both `loadExpenses` and `loadIncomes` themselves have a re-entry guard plus a 30-second per-account skip-recent window (`force: true` bypasses it). Their server-pull merge loop is structured in 4 phases: A) collect+dedup unique categories/projects from server response, B) decrypt all rows in parallel via `Promise.all`, C) build entity objects in pure JS, D) one `withTransaction` (from `src/db/client`) for ALL writes — categories once, projects once, expenses, per-record items/splits/tags/project-links, soft-deletes. The post-merge `loadCategories+loadProjects` cascade is **awaited** (not fire-and-forget) so the next hydrate cycle does not contend with background reads. `categoryStore.loadCategories` caches seeded accounts in a module-level `Set<accountId>` — first call seeds defaults + patches colors (~60ms); subsequent calls just re-read from SQLite (~5ms). Stores read SQLite first, set `isLoading: false` immediately, then proceed to the server-pull phase — tab paints from cache instantly. Receipt-image fetch in `expense/[id]` is deferred via `InteractionManager`. Empty list + `isLoading=true` shows a centered `ActivityIndicator`; empty list + `!isLoading` shows the "Add your first…" empty state. Account switches re-trigger the fetch via the `currentAccountId` dep.
- **i18n**: 8 locales in `src/i18n/locales/` — `en.ts` (source), `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`. When adding keys, update ALL 8 files.
- **Help system**: In-app help screen (`app/help/index.tsx`, `app/help/[id].tsx`) is powered by **auto-generated** `src/help/content.ts`. NEVER create or edit `content.ts` manually. Workflow: (1) write/edit markdown in `user_docs/<lang>/NN-slug.md` for all 8 languages, (2) add the section id to `scripts/generate-help-content.js` SECTIONS array and to `src/help/sections.ts`, (3) run `npm run generate:help` from the project root. Do NOT create a manual `app/help.tsx` file — the route is handled by `app/help/index.tsx`.
- **Services**: `api.ts`, `notifications.ts`, `secureStorage.native.ts` / `secureStorage.web.ts`, `widgetData.ts`, `appVersion.ts` (raw fetch wrapper around the public `/app-versions/check`, used pre-login)
- **Screens**: `(auth)/` login/register/forgot-password/reset-password, `(tabs)/` main tabs, `expense/`, `income/`, `budget/`, `account/`, `analytics/`, `calendar/`, `projects/`, `tags/`, `wallet/` (index, set-balance, exchange/index, exchange/[id], transfer, transfers, exchanges, [id]), `debts/`, `goals/`, `settings/` (index hub, profile, appearance, ai, widgets, notifications, security, categories, data, about, ai-usage-details, change-email — 2-step flow with 6-digit code, pending state persisted in `secureStorage` under key `pendingEmailChange` with 30-min TTL so the screen resumes at step 2 after app restart), `subscription.tsx`, `referral.tsx`, `admin.tsx`, `story.tsx`, `fat-finder.tsx`, `scenario-simulator.tsx`
- **Components**: `charts/` (Bar, Donut, Pie, Weekday, GroupedBar), `interactive-charts/` (drill-down charts with ChartRenderer), `insights/` (InsightCard, InsightCarousel), `widgets/` (NetProfitWidget, NetCapitalWidget, CalendarWidget), `story/`, `chat/` (ActionConfirmationCard, ActionResultCard), `AccountSwitcher`, `AiUsageBadge`, `CreateCategoryModal`, `HydrationProgressBar` (2.5px indeterminate slider at top of screen, mounted once in `(tabs)/_layout.tsx`, driven by `useHydrationStore.isHydrating` — visible during cold-start / account-switch / pull-to-refresh hydration), `Paywall`, `ProjectPicker`, `SplitEditor`, `TagPicker`, `TagChip`, `TransactionActionSheet`, `UpdatePrompt` (Google Play / App Store update modal — mounted at root in `app/_layout.tsx`, force/soft modes, dismissal persisted per-version in `secureStorage` under key `skippedUpdateVersion`. For soft prompts, tapping **Update** also writes `skippedUpdateVersion` before opening the store so the modal closes immediately and does not linger if the user returns from the store without installing; required prompts never dismiss locally and rely on the `AppState`-active force version-check to confirm the install)
- **Hooks**: `src/hooks/useCalendarData.ts` — shared hook for calendar grid computation, date filtering, category breakdowns with multi-currency conversion. Used by `CalendarWidget` (home screen) and `app/calendar/index.tsx` (full-screen page). `src/hooks/useAiCostConfirmation.ts` — one-time confirmation dialog before expensive AI operations (cost >= 2.0), stores dismissal per feature in AsyncStorage. `src/hooks/useAppVersionCheck.ts` — calls public `/app-versions/check` on mount and on `AppState` `active`, 6h in-memory cache, web no-op, fail-silent (never blocks app boot), exports `__resetAppVersionCheckCache()` test seam. `src/hooks/useOrientationLock.ts` — locks portrait on phones (`Math.min(width, height) < 600dp`) and unlocks on tablets/foldables, called once from `app/_layout.tsx`. App-level `orientation` is `"default"` so the manifest doesn't restrict large screens (Android 16 ignores manifest orientation lock on large screens anyway); the JS hook restores phone-only portrait UX. Web is a no-op.
- **Features**: `src/features/analytics/useAnalytics.ts` — analytics computations hook. Returns `AnalyticsSummary` (incl. `vsAverage: number` — signed % vs trailing 3-month rolling average, computed locally from SQLite expense store). `CategorySpending` items include `vsAverage: number | null` — per-category delta vs 3-month trailing avg shown as green/red chip below the percentage in the category list (month view only; `null` = new category or non-month view, chip hidden; ±5% noise threshold, computed offline from SQLite). `src/features/scenario/useScenarioProjection.ts` — scenario simulator projection hook (pure client-side, reads expense/income stores, projects savings over 3/6/12 months)
- **Scenario persistence**: `src/stores/scenarioStore.ts` — MMKV-backed store (`scenario-storage` id). Persists `SavedScenario[]` (id, name, expenseAdj, incomeAdj, extraIncomes, horizon, createdAt). Free tier: 5 scenarios max; Pro/Business: unlimited. Actions: `saveScenario(name, snapshot, isPro) → 'ok'|'limit_reached'`, `deleteScenario(id)`, `canSave(isPro)`. `scenario-simulator.tsx` has Save modal, load bottom sheet, and native Share button (text summary via `Share.share()`). No API endpoint — device-local only.

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
npm run dev:web                # Start mobile app in browser (Expo web on http://localhost:8081)

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
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_BUSINESS_PHONE_NUMBER`, `WHATSAPP_API_VERSION` — WhatsApp Business Cloud API. Token scope `whatsapp_business_messaging` only. `WHATSAPP_APP_SECRET` is the HMAC key for inbound webhook signature verification. `WHATSAPP_BUSINESS_PHONE_NUMBER` is shown in the mobile app as a `wa.me` deep link. Webhook URL is `https://api.ai-budget.pl/whatsapp/webhook` (no `/api/v1` prefix — excluded in `main.ts`).
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
