# Mobile App (Expo / React Native)

## What this is
The primary user-facing product: an Expo 54 / React Native 0.81 app targeting iOS, Android, and web. It follows an offline-first architecture — all reads go to SQLite first, background API sync follows.

## Entry points
- `apps/mobile/app/_layout.tsx` — root layout; mounts `UpdatePrompt`, calls `useOrientationLock`, wraps everything in providers
- `apps/mobile/app/(tabs)/` — the five main tabs: `index` (home), `expenses`, `budgets`, `analytics`, `chat`
- `apps/mobile/src/stores/index.ts` — re-exports all 22 Zustand stores
- `apps/mobile/src/db/schema/index.ts` — SQLite table definitions (Drizzle ORM)
- `apps/mobile/src/services/api.ts` — barrel that composes the `api` singleton from 14 domain modules (`auth.api.ts`, `users.api.ts`, `expenses.api.ts`, …); base `HttpClient` lives in `http-client.ts` and handles `X-Account-Id` injection, JWT refresh, 401 → logout

## Key concepts
- **Offline-first** — writes go to SQLite immediately via `*Repository.ts`, are queued in `syncQueue`, then pushed to the API when online
- **Local-first tab hydration** — tabs call their store's `loadXxx()` in both `useEffect([currentAccountId])` and `useFocusEffect`; stores read SQLite first, set `isLoading: false`, then refresh from API in the background
- **Zustand stores** — 22 stores under `src/stores/`; each store manages server state + loading flags; account switches re-trigger fetches via `currentAccountId` dep
- **SQLite repositories** — 14 `*Repository.ts` files in `src/db/` use raw `executeSql()` against the Drizzle schema
- **i18n** — 8 locales in `src/i18n/locales/` (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`); all 8 files must be updated together
- **Help system** — `src/help/content.ts` is **auto-generated** by `npm run generate:help`; never edit it manually; source is `user_docs/<lang>/NN-slug.md`
- **Encryption** — `src/services/encryptionHelper.ts` + `encryptionMiddleware.ts` + `encryptionStore.ts` encrypt sensitive fields before writing to SQLite

## Cross-references
- Talks to: `api` via `src/services/api.ts` (barrel) → `http-client.ts` for REST calls
- Uses: `shared-types` for entity interfaces
- Uses: `shared-utils` for Zod validation and formatting helpers

## Where to look first
For a screen bug, start at `apps/mobile/app/<screen>/`. For a data issue, check the relevant `src/stores/<feature>Store.ts` and `src/db/<feature>Repository.ts`.
