# AI Budget Assistant

## Architecture

Turborepo monorepo with 4 packages:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 + Prisma 5 + PostgreSQL + Redis | REST API backend |
| `apps/mobile` | Expo 54 + React Native 0.81 + Zustand + SQLite/Drizzle | Mobile app (iOS/Android/Web) |
| `packages/shared-types` | TypeScript interfaces | Entities and DTOs shared between api and mobile |
| `packages/shared-utils` | Zod schemas + formatting + constants | Validation and utilities shared between api and mobile |

## Key Patterns

### API (NestJS)
- **Module structure**: `modules/<feature>/` contains `module.ts`, `controller.ts`, `service.ts`, `dto/index.ts`, `guards/`
- **Auth**: JWT via `@UseGuards(JwtAuthGuard)`. Request type: `AuthenticatedRequest` from `common/types/index.ts`
- **Account scoping**: `AccountContextGuard` middleware reads `X-Account-Id` header, resolves membership, adds `accountId` and `accountRole` to request
- **Role-based access**: `AccountRoleGuard` with `@RequireRole('owner')` decorator
- **Service signature**: `(accountId, userId, dto)` as parameters, all Prisma queries filter by `accountId`
- **Database**: Prisma ORM. Schema at `apps/api/prisma/schema.prisma`. Uses `@map("snake_case")` for column names
- **19 modules**: `accounts`, `admin`, `ai`, `analytics`, `auth`, `budgets`, `categories`, `currency-exchange`, `expenses`, `incomes`, `insights`, `mail`, `notifications`, `projects`, `subscriptions`, `sync`, `tags`, `telegram`, `users`, `wallet`
- **AI module features**:
  - **Chat Q&A**: Natural language financial questions powered by GPT-4
  - **Natural Language Commands**: Execute actions via chat (create expenses/budgets, query data) using OpenAI function calling
  - **6 AI functions**: `create_expense`, `create_income`, `create_budget`, `get_expenses`, `get_budget_status`, `get_category_breakdown`
  - **Confirmation flow**: Write actions (create_*) require user confirmation before execution; read actions (get_*) execute immediately
  - **Language detection**: Automatically detects user language (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in same language
  - **Currency mapping**: Supports currency symbol detection (₴→UAH, $→USD, €→EUR, zł→PLN, £→GBP, ₽→RUB)
  - **Endpoints**: `POST /ai/chat`, `POST /ai/chat/confirm`, `POST /ai/chat/reject`

### Mobile (React Native/Expo)
- **Navigation**: Expo Router. Screens in `app/`, tabs in `app/(tabs)/` — home, expenses, budgets, analytics, chat
- **State**: 14 Zustand stores in `src/stores/` — `authStore`, `accountStore`, `expenseStore`, `incomeStore`, `budgetStore`, `categoryStore`, `tagStore`, `projectStore`, `walletStore`, `chatStore`, `insightsStore`, `exchangeRateStore`, `subscriptionStore`, `themeStore`
- **Local DB**: SQLite via Drizzle ORM. Schema in `src/db/schema/index.ts`. 12 repositories in `src/db/*Repository.ts` use raw `executeSql()` — `account`, `category`, `currencyExchange`, `expense`, `expenseItem`, `income`, `project`, `split`, `tag`, `wallet`
- **API client**: `src/services/api.ts` — singleton `ApiClient` class, auto-injects `X-Account-Id` header, auto JWT refresh, 401 → logout
- **Offline-first**: write to SQLite first, queue sync via `syncQueue` table, sync to server when online
- **i18n**: 8 locales in `src/i18n/locales/` — `en.ts` (source), `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`. When adding keys, update ALL 8 files.
- **Services**: `api.ts`, `notifications.ts`, `secureStorage.native.ts` / `secureStorage.web.ts`, `widgetData.ts`
- **Screens**: `(auth)/` login/register, `(tabs)/` main tabs, `expense/`, `income/`, `budget/`, `account/`, `analytics/`, `projects/`, `tags/`, `wallet/`, `settings.tsx`, `subscription.tsx`, `admin.tsx`, `story.tsx`
- **Components**: `charts/` (Bar, Donut, Pie, Weekday, GroupedBar), `interactive-charts/` (drill-down charts with ChartRenderer), `insights/` (InsightCard, InsightCarousel), `story/`, `chat/` (ActionConfirmationCard, ActionResultCard), `AccountSwitcher`, `CreateCategoryModal`, `Paywall`, `ProjectPicker`, `SplitEditor`, `TagPicker`, `TagChip`, `UsageWarning`

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
```

## Environment Variables

See `.env.example`:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_EXPIRES_IN` — JWT token config
- `OPENAI_API_KEY` — OpenAI for AI features (Whisper, GPT)
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` — push notifications
- `EXPO_PUBLIC_API_URL` — API URL for mobile app
