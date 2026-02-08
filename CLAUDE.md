# AI Budget Assistant

## Architecture

Turborepo monorepo with 4 packages:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS + Prisma + PostgreSQL + Redis | REST API backend |
| `apps/mobile` | Expo (React Native) + Zustand + SQLite/Drizzle | Mobile app (iOS/Android/Web) |
| `packages/shared-types` | TypeScript interfaces | Entities and DTOs shared between api and mobile |
| `packages/shared-utils` | Zod schemas | Validation schemas shared between api and mobile |

## Key Patterns

### API (NestJS)
- **Module structure**: `modules/<feature>/` contains `module.ts`, `controller.ts`, `service.ts`, `dto/index.ts`, `guards/`
- **Auth**: JWT via `@UseGuards(JwtAuthGuard)`. Request type: `AuthenticatedRequest` from `common/types/index.ts`
- **Account scoping**: `AccountContextGuard` middleware reads `X-Account-Id` header, resolves membership, adds `accountId` and `accountRole` to request
- **Role-based access**: `AccountRoleGuard` with `@RequireRole('owner')` decorator
- **Service signature**: `(accountId, userId, dto)` as parameters, all Prisma queries filter by `accountId`
- **Database**: Prisma ORM. Schema at `apps/api/prisma/schema.prisma`. Uses `@map("snake_case")` for column names

### Mobile (React Native/Expo)
- **Navigation**: Expo Router. Screens in `app/`, tabs in `app/(tabs)/`
- **State**: Zustand stores in `src/stores/` (authStore, accountStore, expenseStore, budgetStore)
- **Local DB**: SQLite via Drizzle ORM. Schema in `src/db/schema/index.ts`. Repositories in `src/db/*Repository.ts` use raw `executeSql()`
- **API client**: `src/services/api.ts` - singleton `ApiClient` class, auto-injects `X-Account-Id` header
- **Offline-first**: write to SQLite first, queue sync via `syncQueue` table, sync to server when online
- **i18n**: 7 locales in `src/i18n/locales/` — `en.ts` (source), `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`. When adding keys, update ALL 7 files.

### Shared Types
- Entities: `packages/shared-types/src/entities/index.ts` — domain interfaces
- DTOs: `packages/shared-types/src/dto/index.ts` — API request/response shapes
- Types use `PascalCase` interfaces, enums use string literal unions (e.g., `type AccountRole = 'owner' | 'editor' | 'viewer'`)

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
10. `apps/mobile/src/i18n/locales/*.ts` — translations (all 7 files)

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

# API specific (run from apps/api/)
npx prisma generate            # Regenerate Prisma client
npx prisma migrate dev --name X  # Create DB migration
npx prisma studio              # Visual DB editor

# Mobile specific (run from apps/mobile/)
npx expo start                 # Start Expo dev server
npx expo start --web           # Start web preview
```
