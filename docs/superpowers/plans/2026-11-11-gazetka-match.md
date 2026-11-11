# Gazetka Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user shares promo-leaflet screenshots (or a PDF) and gets back only the promotions that match their own usual purchases; opted-in users and admins feed a community promo layer that pushes confirmed promos to other users who buy the product.

**Architecture:** A new API module `leaflets` owns personal leaflet reads (one vision call per page that both extracts items and picks matches from a numbered list of the user's basket), a separate per-user page budget, and personal results kept until the leaflet expires. A second part of the same module, behind `COMMUNITY_PROMOS_ENABLED` (default OFF), stores anonymous promo facts, confirms them by consensus or admin upload, and runs a daily closed-set push. The app gets one screen (phone + desktop web), a share-sheet chooser and a shopping-list entry point; the admin dashboard gets a Leaflets page.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, OpenAI (`gpt-4.1` vision, as `PriceTagService`), Expo 54 / React Native (+ web), Next.js 16 admin, Jest.

**Spec:** `docs/superpowers/specs/2026-11-11-gazetka-match-design.md`

## Global Constraints

- The server never fetches a leaflet: no URL download, no retailer or aggregator site access, anywhere.
- Leaflet images and PDFs are never persisted (server or device cache beyond processing) and never displayed back; only extracted facts are stored.
- No promotion is shown for a product the user does not buy (no catalog view).
- Matching is closed-set: the model returns an index into the numbered basket list or `null`; out-of-range, non-integer or duplicate indexes are dropped, never guessed. No string-similarity matching.
- Prompt rule for "same product": same product type; same brand when the basket name has one; pack size must match when both sides state one; when unsure, no match.
- Basket = resolved names (`COALESCE(alias, canonicalName)`) bought ≥ 2 times in the last 90 days, plus unchecked shopping-list items with a `canonicalName`; capped at the 150 most frequent.
- Usual price = median per-unit price this user paid in the last 90 days, any store, in the leaflet's currency only. No FX conversion.
- Leaflet page budget is separate from the monthly AI limit: Free 20, Pro 200, Business 500 pages/month (env `LEAFLET_PAGES_FREE|PRO|BUSINESS`), reset together with the AI-usage month.
- Page cap per user share: 10; native PDF limit 10 MB stands (larger → "share screenshots instead").
- Admin upload cap: 60 pages, 50 MB (env `LEAFLET_ADMIN_MAX_PAGES`, `LEAFLET_ADMIN_MAX_MB`), no page budget, no consent needed.
- Copy (all 9 locales) frames promo prices as "according to a leaflet — check in store"; it compares with what the user usually pays and never says "buy now" / "don't miss out".
- Accounts with `encryptionTier >= 2` are excluded with a message saying the usual price cannot be computed because item prices are encrypted.
- Viewers may read leaflets; Add to list follows the shopping list's own rules.
- Community: confirmed = ≥ K distinct contributors (default K = 3, env `COMMUNITY_PROMO_K`) of which ≥ 2 trusted (env `COMMUNITY_PROMO_MIN_TRUSTED`), same (chain, canonicalName, promoPrice, validFrom, validTo); footprint correlation clustering is NOT used. Admin uploads confirm immediately on Publish.
- Community push: only to users with `notifyLeafletPromos` on, who bought at that chain in the last 90 days, at most one push per user per day, deduped per (promo, user). Never for an expired promo.
- Consent: existing `User.contributeCommunityPrices`; its copy mentions leaflets; users who opted in before this feature contribute leaflets only after `leafletConsentNoticeAt` is set.
- Repo rules: a `schema.prisma` change lands with its migration in the same commit; no runtime import from `@budget/shared-*` in `apps/api` (`import type` only); fire-and-forget via `logFireAndForget`; every new i18n key in all 9 locales; every new screen has a header and ships phone + desktop web (≥ 1024) together; platform split is component-level (`.web.tsx`), never route-level.

## Review Focus

1. **Leaflet currency differs from the user's purchases** (a EUR leaflet, PLN receipts): the match is shown without a "usually" line and without any conversion — pinned in Task 2 (`usualPrice` returns `null`) and Task 4 (response has `usualPrice: null`).
2. **Brand-new user with an empty basket**: reading must not start and no page is charged; the screen says to scan a few receipts first — pinned in Task 4 (`EMPTY_BASKET` 422, budget untouched).
3. **Budget runs out mid-share**: pages already read keep their matches, the rest are reported as dropped, the paywall opens once — pinned in Task 3 (consume refuses beyond limit) and Task 5 (hook stops on 403 and keeps earlier results).
4. **Unreadable page** (blurry screenshot, non-leaflet image): reported as unreadable and its page unit refunded — pinned in Task 4.
5. **Leaflet with no readable validity dates**: personal result kept 7 days from creation, and it never contributes to the community layer — pinned in Task 4 (prune) and Task 7 (contribution skipped `no_validity`).

---

## File Structure

API — new module `apps/api/src/modules/leaflets/`:
- `leaflets.module.ts` — imports `PrismaModule`, `SubscriptionsModule`, `PriceHistoryModule`, `NotificationsModule`, `CommunityPriceModule`.
- `leaflet-page.util.ts` — pure: `normalizeLeafletPage`, `LEAFLET_PAGE_FORMAT` (strict JSON schema).
- `leaflet-basket.util.ts` — pure: `buildUsualBasket`, `usualPrice`, `resolveBasketIndex`.
- `leaflet-reader.service.ts` — the per-page OpenAI vision call.
- `leaflet-budget.service.ts` — separate page budget.
- `leaflets.service.ts` — create/read/list/prune personal leaflets, PDF background reading.
- `leaflets.controller.ts` — `/leaflets` routes.
- `leaflet-prune.cron.ts` — prune expired personal leaflets and community promos.
- `community-promo.util.ts` — pure: `isPromoConfirmed`, `promoKey`.
- `community-promo.service.ts` — contribution + confirmed-promo queries (flagged).
- `leaflet-promo-push.cron.ts` + `leaflet-notification-ledger.service.ts` — daily push.
- `leaflet-push-match.service.ts` — closed-set user-basket × confirmed-promo model call.
- `leaflets-admin.controller.ts` + `leaflets-admin.service.ts` — admin upload/review/publish/stats.

API — shared change: `apps/api/src/modules/ai/prompts/canonical-name-rules.ts` (extracted constant, imported by `ocr.service.ts` and the reader).

Shared types: `packages/shared-types/src/entities/leaflet.ts` (+ re-export in `entities/index.ts`), DTOs in `packages/shared-types/src/dto/leaflet.ts` (+ barrel), `'leaflet_promo'` in `NotificationType` (`entities/primitives.ts`).

Mobile:
- `src/services/leaflets.api.ts`
- `src/features/leaflets/leafletPages.ts` (pure page planning), `src/features/leaflets/useLeafletReader.ts`
- `src/components/leaflets/LeafletScreen.tsx`, `LeafletScreen.web.tsx`, `LeafletMatchRow.tsx`, `desktop/LeafletDesktop.tsx`, `LeafletConsentNotice.tsx`
- `app/leaflets/index.tsx` (thin route; `Stack.Screen` with header in `app/_layout.tsx`)
- `src/stores/shareIntakeStore.ts` + `src/hooks/useShareIntake.ts` + `src/features/share-intake/shareIntakeGate.ts` — chooser
- `app/shopping-list/index.tsx` — "Check a leaflet" entry
- `src/components/settings/notifications/NotificationsSettings.tsx`, `src/components/settings/data/DataSettings.tsx`, `src/services/notifications.ts`
- `src/services/telemetry.types.ts` — `gazetka` flow
- i18n: `src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`, namespace `leaflets`

Admin: `apps/admin/src/app/leaflets/page.tsx`, `apps/admin/src/hooks/use-leaflets.ts`, `apps/admin/src/components/leaflets/*`, sidebar entry in `src/components/layout/app-sidebar.tsx`.

---

### Task 1: Data model for personal leaflets and the page budget

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261112000000_leaflets/migration.sql`
- Create: `packages/shared-types/src/entities/leaflet.ts`, `packages/shared-types/src/dto/leaflet.ts`
- Modify: `packages/shared-types/src/entities/index.ts`, `packages/shared-types/src/dto/index.ts`, `packages/shared-types/src/entities/primitives.ts`

**Interfaces:**
- Produces (Prisma):
  - `Leaflet { id uuid, accountId String? (null for admin), userId String, kind 'personal'|'admin', source 'share'|'picker'|'upload'|'pdf'|'admin', platform 'android'|'web'|'ios'|null, chain String?, validFrom DateTime? @db.Date, validTo DateTime? @db.Date, currencyCode String?, status 'reading'|'done'|'failed', pagesRead Int, pagesUnreadable Int, pagesDropped Int, publishedAt DateTime?, unpublishedAt DateTime?, expiresAt DateTime, createdAt }` → `leaflets`, index `[accountId, expiresAt]`, `[kind, publishedAt]`.
  - `LeafletItem { id, leafletId (cascade), page Int, name String, canonicalName String, promoPrice Decimal(12,2), regularPrice Decimal(12,2)?, currencyCode String, condition String?, validFrom Date?, validTo Date?, basketName String?, usualPrice Decimal(12,2)?, addedToListAt DateTime? }` → `leaflet_items`, index `[leafletId]`.
  - `Subscription.leafletPagesUsed Int @default(0) @map("leaflet_pages_used")`.
  - `User.notifyLeafletPromos Boolean @default(true)`, `User.leafletConsentNoticeAt DateTime?`.
- Produces (shared types): `LeafletKind`, `LeafletSource`, `LeafletStatus`, `LeafletMatch { itemId, name, promoPrice, regularPrice|null, currencyCode, condition|null, basketName, usualPrice|null }`, `LeafletResult { id, chain|null, validFrom|null, validTo|null, status, pagesRead, pagesUnreadable, pagesDropped, matches: LeafletMatch[], unmatchedCount }`, `LeafletPageResult { page, readable: boolean, matches: LeafletMatch[], unmatchedCount }`, `LeafletBudget { used, limit, resetAt }`, DTOs `CreateLeafletRequest { source, platform }`, `LeafletPageRequest { imageBase64, mimeType? }`, `LeafletPdfRequest { pdfBase64 }`.
- Produces: `NotificationType` gains `'leaflet_promo'`.

- [ ] **Step 1:** Add the models/columns above to `schema.prisma` with `@map` snake_case names, matching existing style.
- [ ] **Step 2:** Run `cd apps/api && npx prisma migrate dev --name leaflets --create-only`; rename the folder to `20261112000000_leaflets`; check the SQL contains only the new tables/columns (no unrelated drops — in particular not `categories_account_system_key_type_live_key`).
- [ ] **Step 3:** Run `npx prisma generate` and `npm run typecheck -w @budget/api`. Expected: PASS.
- [ ] **Step 4:** Add the shared types; run `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add apps/api/prisma packages/shared-types && git commit -m "feat(leaflets): data model for personal leaflets and page budget"`

### Task 2: Pure cores — page normalization, basket, usual price, index resolution

**Files:**
- Create: `apps/api/src/modules/ai/prompts/canonical-name-rules.ts`
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts` (replace the inline "canonicalName rules" block, lines ~290–297, with the constant)
- Create: `apps/api/src/modules/leaflets/leaflet-page.util.ts`, `leaflet-basket.util.ts`
- Test: `apps/api/src/modules/leaflets/leaflet-page.util.spec.ts`, `leaflet-basket.util.spec.ts`, `apps/api/src/modules/ai/prompts/canonical-name-rules.spec.ts`

**Interfaces:**
- Produces:
  - `export const CANONICAL_NAME_RULES: string` (the exact existing block, unchanged text).
  - `export interface RawLeafletItem { name: string; canonicalName: string; promoPrice: number; regularPrice: number | null; currencyCode: string; condition: string | null; validFrom: string | null; validTo: string | null; basketIndex: number | null }`
  - `export interface NormalizedLeafletPage { readable: boolean; chain: string | null; validFrom: string | null; validTo: string | null; items: RawLeafletItem[] }` (dates `YYYY-MM-DD`)
  - `export function normalizeLeafletPage(raw: unknown, basketSize: number, now: Date): NormalizedLeafletPage`
  - `export const LEAFLET_PAGE_FORMAT` (strict json_schema, like `PRICE_TAG_FORMAT`)
  - `export interface BasketProduct { name: string; count: number }`
  - `export function buildUsualBasket(rows: { resolvedName: string; date: Date }[], listNames: string[], now: Date, cap = 150): BasketProduct[]`
  - `export function usualPrice(rows: { resolvedName: string; date: Date; unitPrice: number; currency: string }[], name: string, currency: string, now: Date): number | null`
  - `export function resolveBasketIndex(index: unknown, basket: BasketProduct[], used: Set<number>): string | null`

- [ ] **Step 1: Write failing tests**

```ts
// canonical-name-rules.spec.ts
it('keeps the canonicalName rules text and OCR uses the constant', () => {
  expect(CANONICAL_NAME_RULES).toContain('"MLEKO 3,2% ŁACIATE 1L 6SZT"       → "Mleko Łaciate 3,2% 1L"');
  const src = readFileSync(join(__dirname, '../services/ocr.service.ts'), 'utf8');
  expect(src).toContain('CANONICAL_NAME_RULES');
  expect(src).not.toContain('canonicalName rules — brand/product name'); // no second inline copy
});

// leaflet-page.util.spec.ts
it('drops items with missing/absurd promo price and a regular price not above promo', ...)
  // { promoPrice: 0 } dropped; { promoPrice: 4.99, regularPrice: 4.99 } → regularPrice null
it('marks a page with zero valid items as unreadable', () => expect(normalizeLeafletPage({ items: [] }, 5, NOW).readable).toBe(false));
it('nulls basketIndex that is non-integer, negative or >= basketSize', ...) // 2.5, -1, 5 with basketSize 5 → null
it('parses dates "16.11" and "16.11.2026" relative to now (2026-11-11) and nulls validTo < validFrom', ...)
it('upper-cases and validates currency to /^[A-Z]{3}$/', ...)
it('caps name at 120 and condition at 60 chars', ...)

// leaflet-basket.util.spec.ts
it('basket = names bought >= 2 times in 90 days plus list names, most frequent first', () => {
  // rows: Masło x3 (within 90d), Chleb x1, Mleko x2 but one 100 days ago → only Masło; listNames ['Kawa'] → ['Masło', 'Kawa']
});
it('caps at 150 and dedupes list names already in the basket', ...)
it('usualPrice is the median in the requested currency only', () => {
  // PLN 7.49, 7.99, 6.99 + EUR 2.00 → usualPrice(..., 'PLN') === 7.49; usualPrice(..., 'EUR') === 2.00; 'USD' → null
});
it('resolveBasketIndex returns the name once; a second use of the same index returns null', ...)
```

- [ ] **Step 2:** Run `cd apps/api && npx jest src/modules/leaflets src/modules/ai/prompts` — Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement. `normalizeLeafletPage` follows `normalizePriceTag`'s `str`/`money` helpers (copy them locally — they are not exported, and a shared helper is not worth a refactor here). Date parsing: `DD.MM` takes `now`'s year, or next year if that date is > 300 days in the past.
- [ ] **Step 4:** Run the same jest command plus `npx jest src/modules/ai/services/ocr.service.spec.ts` — Expected: PASS (OCR behaviour unchanged).
- [ ] **Step 5: Commit** — `feat(leaflets): pure cores for page normalization and basket matching`

### Task 3: Separate leaflet page budget

**Files:**
- Create: `apps/api/src/modules/leaflets/leaflet-budget.service.ts`
- Modify: `apps/api/src/modules/subscriptions/subscriptions.service.ts` (`resetUsageIfNeeded` also sets `leafletPagesUsed: 0`; export `getOrCreateSubscription` if not public)
- Test: `apps/api/src/modules/leaflets/leaflet-budget.service.spec.ts`

**Interfaces:**
- Consumes: `SubscriptionsService.getOrCreateSubscription(userId)`, `recordAdditionalUsage(userId, 'leaflet', 1, accountId)`.
- Produces:
  - `LEAFLET_PAGE_LIMITS = { free: 20, pro: 200, business: 500 }` (env overrides `LEAFLET_PAGES_FREE|PRO|BUSINESS`)
  - `class LeafletBudgetService { consume(userId: string, accountId: string | null, pages = 1): Promise<void>` — throws `ForbiddenException({ code: 'LEAFLET_LIMIT' })` when `used + pages > limit`; `refund(userId: string, pages = 1): Promise<void>` (never below 0); `get(userId: string): Promise<LeafletBudget>` }
  - Trialing users use the trial tier's row of the same table; `customAiLimit`/`bonusAiRequests` do NOT apply.

- [ ] **Step 1: Write failing tests** — `free user at 19 can consume 1, at 20 gets LEAFLET_LIMIT`; `business has 500, not unlimited`; `refund never goes below 0`; `consume does not touch aiRequestsUsed`; `a reset month zeroes leafletPagesUsed` (via `SubscriptionsService.resetUsageIfNeeded` spec addition).
- [ ] **Step 2:** Run `npx jest src/modules/leaflets/leaflet-budget src/modules/subscriptions` — Expected: FAIL.
- [ ] **Step 3:** Implement with an atomic `updateMany({ where: { userId, leafletPagesUsed: { lte: limit - pages } }, data: { increment } })`; zero rows updated → throw. Log COGS with `recordAdditionalUsage` (never throws).
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(leaflets): separate monthly leaflet page budget`

### Task 4: Reading a leaflet — API endpoints (single-player)

**Files:**
- Create: `leaflet-reader.service.ts`, `leaflets.service.ts`, `leaflets.controller.ts`, `leaflet-prune.cron.ts`, `leaflets.module.ts`, `dto/index.ts` (zod schemas, in the style of `ai/utils/sanitize.ts`)
- Modify: `apps/api/src/app.module.ts`; `apps/api/src/modules/price-history/price-history.service.ts` (add public `getBasketRows(accountId)` returning `fetchRows` output, read-only)
- Modify: `apps/api/src/modules/ai/services/receipt-pdf.service.ts` — none; call `renderToPngs(buf, undefined, maxPages)` with an explicit `maxPages`
- Test: `leaflets.service.spec.ts`, `leaflets.controller.spec.ts`, `leaflet-reader.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 utils, Task 3 `LeafletBudgetService`, `PriceHistoryService.getBasketRows`, `ReceiptPdfService.renderToPngs`, `normalizeCommunityMerchant` (chain normalization).
- Produces:
  - `LeafletReaderService.readPage(imageBase64: string, mimeType: string, basket: BasketProduct[], accountCurrency: string): Promise<NormalizedLeafletPage>` — model `gpt-4.1`, `temperature: 0`, `response_format: LEAFLET_PAGE_FORMAT`; the prompt embeds `CANONICAL_NAME_RULES`, the numbered basket (`0: Masło Łaciate 200g` …) and the matching rule from Global Constraints. The model never sees prices from the user's history.
  - Routes (all `JwtAuthGuard + AccountContextGuard`, no `ViewerBlockGuard`):
    - `POST /leaflets` body `CreateLeafletRequest` → `{ id }`. Refuses `422 { code: 'EMPTY_BASKET' }` when the basket is empty and `403 { code: 'ENCRYPTED_ACCOUNT' }` when `encryptionTier >= 2`.
    - `POST /leaflets/:id/pages` body `LeafletPageRequest` → `LeafletPageResult`. Consumes 1 page first; unreadable → refund. More than 10 pages on one leaflet → `pagesDropped++`, `409 { code: 'PAGE_CAP' }`, nothing charged.
    - `POST /leaflets/:id/pdf` body `LeafletPdfRequest` (≤ 10 MB decoded, else `413 { code: 'PDF_TOO_LARGE' }`) → `{ id }` immediately; pages read in the background (fire-and-forget, `logFireAndForget`), budget consumed per page, stopping on `LEAFLET_LIMIT` with the rest counted as dropped.
    - `GET /leaflets/:id` → `LeafletResult`; `GET /leaflets` → active (`expiresAt > now`) personal leaflets for the account, newest first.
    - `POST /leaflets/items/:itemId/added` → 204, stamps `addedToListAt` once.
    - `GET /leaflets/budget` → `LeafletBudget`.
  - Chain and dates: first non-null value across pages wins; `expiresAt = validTo + 1 day`, or `createdAt + 7 days` when `validTo` is null.
  - `LeafletPruneCron` (`@Cron('30 3 * * *')`) deletes personal leaflets past `expiresAt`.
  - Scoping: every query filters `accountId` from the guard; a leaflet id from another account → 404.

- [ ] **Step 1: Write failing tests** (Prisma and OpenAI mocked, as `price-tag.service.spec.ts` does):
  - `create returns EMPTY_BASKET and does not touch the budget when the basket is empty`
  - `create returns ENCRYPTED_ACCOUNT for encryptionTier 2`
  - `page read stores items, returns only matched items with basketName and usualPrice`
  - `usualPrice is null when the leaflet currency differs from all purchases`
  - `unreadable page is refunded and counted in pagesUnreadable`
  - `11th page returns PAGE_CAP and is not charged`
  - `pdf over 10 MB returns PDF_TOO_LARGE`; `pdf stops at LEAFLET_LIMIT and counts the rest as dropped`
  - `GET /leaflets/:id of another account returns 404`
  - `expiresAt = validTo + 1 day; no validTo → createdAt + 7 days`; `prune deletes only expired personal leaflets`
  - `reader prompt contains CANONICAL_NAME_RULES and the numbered basket, and no price history`
- [ ] **Step 2:** Run `npx jest src/modules/leaflets` — Expected: FAIL.
- [ ] **Step 3:** Implement the services, controller and module; register the module in `app.module.ts`.
- [ ] **Step 4:** Run `npx jest src/modules/leaflets && npm run typecheck -w @budget/api && npm run lint -w @budget/api` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(leaflets): read promo leaflets against the usual basket`

### Task 5: App — leaflet screen (phone + desktop web) and reader hook

**Files:**
- Create: `apps/mobile/src/services/leaflets.api.ts`, `src/features/leaflets/leafletPages.ts`, `src/features/leaflets/useLeafletReader.ts`, `src/components/leaflets/LeafletScreen.tsx`, `LeafletScreen.web.tsx`, `LeafletMatchRow.tsx`, `desktop/LeafletDesktop.tsx`, `app/leaflets/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (`Stack.Screen name="leaflets/index"` with `headerShown: true, title: t('leaflets.title')`), `src/services/api.ts` (spread `leafletsApi` like `shoppingListsApi`), `src/services/telemetry.types.ts` + `apps/api/src/modules/telemetry/telemetry.validator.ts` (`'gazetka'` flow, both lists equal), all 9 locale files (`leaflets.*`)
- Test: `apps/mobile/src/features/leaflets/__tests__/leafletPages.test.ts`

**Interfaces:**
- Consumes: Task 4 routes and shared types.
- Produces:
  - `planLeafletPages(files: { uri: string; mimeType: string; size: number }[]): { pages: File[]; pdf: File | null; dropped: number; tooLargePdf: boolean }` — images first, at most 10; at most one PDF, used only when there are no images; PDF > 10 MB → `tooLargePdf`.
  - `useLeafletReader()` → `{ start(files, source): Promise<void>, result: LeafletResult | null, progress: { done: number; total: number }, error: 'empty_basket' | 'encrypted' | 'failed' | null }`. Pages are sent sequentially, each downscaled through `downscaleForOcr` before `uriToBase64`; results merge in as they arrive. A 403 `LEAFLET_LIMIT` stops the loop, keeps earlier matches, opens `useUpgradeStore.getState().show(i18n.t('leaflets.limitBody'), 'pro')` once. A PDF polls `GET /leaflets/:id` every 2 s until `status !== 'reading'`.
  - `LeafletScreen` props `{ files?: SharedFile[]; source: LeafletSource }`; with no files it opens the multi-image picker (`launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 })`; on web the same call gives a multi-file input). Header text: chain + "valid until <date>"; rows `LeafletMatchRow` (name, promo price, "usually X → Y" only when `usualPrice != null`, condition, **Add to list** → `shoppingListStore.addItem(basketName, basketName)` then fire-and-forget `api.markLeafletItemAdded(itemId)`); empty-state and unreadable-pages notices; the "according to a leaflet — check in store" footnote.
  - `LeafletScreen.web.tsx` decides on `useIsDesktopWeb()`: desktop → `LeafletDesktop` (drop zone accepting images/PDF via `onDrop`, same hook, two-column results), else the phone component. Desktop layout per aba-web-designer: get a short spec from that agent before building `LeafletDesktop`.
  - Telemetry: `trackAction('gazetka', 'started' | 'completed' | 'failed')` on web (no-op on native).

- [ ] **Step 1: Write failing tests** for `planLeafletPages`: 12 images → 10 pages + 2 dropped; images + PDF → PDF ignored and counted dropped; single 11 MB PDF → `tooLargePdf`; empty → no pages.
- [ ] **Step 2:** Run `cd apps/mobile && npx jest src/features/leaflets` — Expected: FAIL.
- [ ] **Step 3:** Implement the util, API client, hook, components, route, header registration, telemetry union (API validator + mobile type), and `leaflets.*` keys in all 9 locales (use the `i18n-add-strings` skill).
- [ ] **Step 4:** Run `npx jest src/features/leaflets`, `npm run typecheck`, `npm run lint`, and `npx jest src/modules/telemetry` in `apps/api` — Expected: PASS. Then run the web build (`npm run dev:web`) and check the screen at 390 px and 1280 px wide with two screenshots: matches render, empty-basket message renders.
- [ ] **Step 5: Commit** — `feat(leaflets): leaflet screen on phone and desktop web`

### Task 6: Entry points — share-sheet chooser and shopping list

**Files:**
- Modify: `apps/mobile/src/features/share-intake/shareIntakeGate.ts`, `src/hooks/useShareIntake.ts`, `src/stores/shareIntakeStore.ts`, `app/shopping-list/index.tsx` (+ its desktop counterpart if the list has one; check `src/components/shopping-list/`), 9 locale files
- Test: `apps/mobile/src/features/share-intake/__tests__/shareIntakeGate.test.ts`

**Interfaces:**
- Produces: `decideShareNavigation` gains `'choose'`: when files are pending and the gate is otherwise ready, it returns `'choose'` instead of `'navigate'` or `'block_viewer'`. The hook then shows one `showAlert` with buttons **Receipts** (only when `canEdit`; → existing `/expense/receipt?source=share`), **Promo leaflet** (→ `/leaflets` with the files taken from the store via a new `takeFiles(): SharedFile[]`), **Cancel** (discards and deletes cache copies). Shared text keeps its current path untouched. The last choice is not remembered (decided).
- Shopping list gets a **Check a leaflet** button (phone and desktop) → `/leaflets` with no files.

- [ ] **Step 1: Write failing tests** — `files pending + ready + editor → 'choose'`; `files pending + ready + viewer → 'choose'` (viewer may use leaflets); `not ready → 'wait'`; `screenOpen → 'idle'`; existing text-path expectations unchanged.
- [ ] **Step 2:** Run `npx jest src/features/share-intake` — Expected: FAIL.
- [ ] **Step 3:** Implement. Viewer choosing **Receipts** is impossible (button hidden), so the old `viewerBlocked` alert remains only for the text path.
- [ ] **Step 4:** Run tests, typecheck, lint — Expected: PASS. On an Android device (dev build): share 3 screenshots from the gallery → chooser → Promo leaflet → matches; share 1 receipt → chooser → Receipts → existing confirm card.
- [ ] **Step 5: Commit** — `feat(leaflets): share-sheet chooser and shopping-list entry point`

### Task 7: Community promo layer — contribution and consent (flag default OFF)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create migration `20261112010000_community_promos`
- Create: `apps/api/src/modules/leaflets/community-promo.util.ts`, `community-promo.service.ts`
- Modify: `leaflets.service.ts` (fire-and-forget contribute after each page), `apps/api/src/modules/users/*` (profile accepts `leafletConsentNoticeAt: 'now'`; setting `contributeCommunityPrices: true` also stamps `leafletConsentNoticeAt`)
- Modify mobile: `src/components/leaflets/LeafletConsentNotice.tsx` (new), `LeafletScreen` (show it once when `contributeCommunityPrices && !leafletConsentNoticeAt`), `src/components/settings/data/DataSettings.tsx` (consent copy mentions leaflets), 9 locales
- Test: `community-promo.util.spec.ts`, `community-promo.service.spec.ts`

**Interfaces:**
- Produces (Prisma): `CommunityPromoObservation { id, chain, canonicalName, promoPrice Decimal(12,2), currencyCode, condition String?, validFrom Date, validTo Date, contributorKey, trusted Boolean, isAdmin Boolean, adminLeafletId String?, ingestedAt }` → `community_promo_observations`; `@@unique([chain, canonicalName, promoPrice, currencyCode, validFrom, validTo, contributorKey])`; index `[validTo]`. No account id, user id, image or location.
- Produces:
  - `promoKey(p: { chain; canonicalName; promoPrice; currencyCode; validFrom; validTo }): string`
  - `isPromoConfirmed(rows: { contributorKey: string; trusted: boolean; isAdmin: boolean }[], k: number, minTrusted: number): boolean` — any `isAdmin` row → true; else distinct keys ≥ k and distinct trusted keys ≥ minTrusted.
  - `CommunityPromoService.contribute(userId: string, chain: string | null, items: RawLeafletItem[], validFrom: string | null, validTo: string | null): Promise<'disabled' | 'no_consent' | 'no_notice' | 'no_validity' | 'not_eligible' | 'rate_limited' | 'ok'>` — checks in that order: `COMMUNITY_PROMOS_ENABLED === 'true'` and a usable `COMMUNITY_PRICE_SALT`; consent; notice; chain + both dates present and `validTo >= today`; `isEligibleContributor` with the same env thresholds as community prices; `incrementWindow('promo:contrib:{key}', 1 day)` ≤ 3 leaflets/day (fails closed). `trusted` computed exactly as `CommunityPriceService.contribute` does (tenure or `isStripePaidSub`). Writes with `createMany({ skipDuplicates: true })`. Never throws into the caller.
  - `CommunityPromoService.confirmedActive(now: Date): Promise<ConfirmedPromo[]>` where `ConfirmedPromo = { key; chain; canonicalName; promoPrice; currencyCode; condition; validTo }`, only `validTo >= today`, `adminLeafletId` rows excluded when that leaflet has `unpublishedAt`.
  - Prune: `LeafletPruneCron` also deletes observations with `validTo < today`.

- [ ] **Step 1: Write failing tests** — util: `3 contributors with 2 trusted → confirmed`, `3 with 1 trusted → not`, `1 admin row → confirmed`, `same contributor twice counts once`; service: each early-return code above in order, `no_validity` when `validTo` null, `rate_limited` on Redis error (fail closed), `flag off → disabled and no write`, written rows carry no account/user id.
- [ ] **Step 2:** Run `npx jest src/modules/leaflets/community-promo` — Expected: FAIL.
- [ ] **Step 3:** Schema + migration (same commit), service, users-profile change, mobile notice + consent copy + 9 locales.
- [ ] **Step 4:** Run API tests, typecheck, lint; mobile typecheck — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(leaflets): community promo contributions behind COMMUNITY_PROMOS_ENABLED`

### Task 8: Community promo push (closed-set, daily)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; migration `20261112020000_leaflet_notification_log` (`LeafletNotificationLog`, structurally identical to `ShoppingNotificationLog`)
- Create: `leaflet-notification-ledger.service.ts` (one-constructor subclass of `NotificationDedupLedger`), `leaflet-push-match.service.ts`, `leaflet-promo-push.cron.ts`
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (`leaflet_promo` gated by `notifyLeafletPromos`), `notification-i18n.ts` (`leafletPromoTitle`, `leafletPromoBody` in 9 languages), `users.service.ts` (`leafletPromos` preference get/update)
- Modify mobile: `src/services/notifications.ts` (`leaflet_promo` → `/leaflets`; fire-and-forget `api.markLeafletPushOpened(pushKey)`), `NotificationsSettings.tsx` (toggle), 9 locales
- Modify: `leaflets.controller.ts` — `POST /leaflets/push-opened` body `{ pushKey }` → 204 (stamps `openedAt` on the log row for the caller only)
- Test: `leaflet-push-match.service.spec.ts`, `leaflet-promo-push.cron.spec.ts`, `notification-i18n.spec.ts` additions

**Interfaces:**
- Consumes: `CommunityPromoService.confirmedActive`, `PriceHistoryService.getBasketRows`, `buildUsualBasket`, `usualPrice`.
- Produces:
  - `LeafletPushMatchService.match(basket: BasketProduct[], promos: ConfirmedPromo[]): Promise<Array<{ promoIndex: number; basketName: string }>>` — one `gpt-4.1-mini` text call; the model returns `{ promoIndex, basketIndex }` pairs only; both resolved through range checks, duplicates dropped, failure → `[]` (never "everything").
  - `LeafletPromoPushCron` `@Cron('0 9 * * *')`, no-op unless `COMMUNITY_PROMOS_ENABLED === 'true'`. Candidates: active users with `pushToken`, `notifyLeafletPromos`, and their `defaultAccountId` (paginate with `paginateById`); per user: promos whose chain matches `normalizeCommunityMerchant` of any expense merchant on that account in the last 90 days; skip accounts with `encryptionTier >= 2`; one match call; drop pairs already in the ledger (`dedupKey = promoKey`), one push listing up to 3 matches, `data: { type: 'leaflet_promo', pushKey }`; ledger `withinFloor(accountId, 'leaflet_promo', 1)` enforces one per day. Uses the usual price in the body only when it exists in the promo's currency.
  - The ledger's `accountId` is the user's `defaultAccountId` (the basket's account). `LeafletNotificationLog` adds one nullable column beyond the shopping log's shape, `openedAt DateTime?`; the generic delegate interface is unaffected. `pushKey` is the log row's `id` of the first matched promo; `POST /leaflets/push-opened` updates `openedAt` only where `id = pushKey AND accountId = caller's defaultAccountId`.

- [ ] **Step 1: Write failing tests** — match: out-of-range and duplicate pairs dropped, model error → `[]`; cron: `flag off → no queries`, `user who never shopped at the chain → no push`, `expired promo never pushed`, `second run same day → no second push`, `notifyLeafletPromos false → sendToUser returns false`, `encrypted account skipped`; i18n spec: all 9 languages present, body contains "check in store" wording key.
- [ ] **Step 2:** Run `npx jest src/modules/leaflets src/modules/notifications` — Expected: FAIL.
- [ ] **Step 3:** Implement schema + migration (same commit), services, cron, preference plumbing, mobile routing + toggle + locales.
- [ ] **Step 4:** Run API + mobile tests, typecheck, lint — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(leaflets): daily community promo push`

### Task 9: Admin API — upload, review, publish, stats

**Files:**
- Create: `apps/api/src/modules/leaflets/leaflets-admin.controller.ts`, `leaflets-admin.service.ts`
- Test: `leaflets-admin.service.spec.ts`, `leaflets-admin.controller.spec.ts`

**Interfaces:**
- Consumes: `LeafletReaderService`, `ReceiptPdfService.renderToPngs(buf, undefined, LEAFLET_ADMIN_MAX_PAGES)`, `CommunityPromoService`.
- Produces — `@Controller('admin/leaflets') @UseGuards(JwtAuthGuard, AdminGuard)`:
  - `POST /admin/leaflets` multipart (`FilesInterceptor('files', 60, { limits: { fileSize: 50 * 1024 * 1024 } })`, the pattern of `import-bank.controller.ts`): images or one PDF → creates `Leaflet { kind: 'admin', accountId: null }`, reads all pages in the background with an empty basket (extraction only, `basketIndex` ignored), returns `{ id }`.
  - `GET /admin/leaflets` (list with status, counts, publishedAt), `GET /admin/leaflets/:id` (items + progress).
  - `PATCH /admin/leaflets/:id` `{ chain?, validFrom?, validTo? }`; `PATCH /admin/leaflets/:id/items/:itemId` `{ name?, canonicalName?, promoPrice?, regularPrice?, condition? }`; `DELETE /admin/leaflets/:id/items/:itemId`.
  - `GET /admin/leaflets/:id/recipients` → `{ users: number }` — users who would be pushed (same filters as Task 8, without the model call: candidates whose 90-day merchants include the chain).
  - `POST /admin/leaflets/:id/publish` — requires chain, `validFrom`, `validTo >= today`, ≥ 1 item; writes `CommunityPromoObservation` rows `{ isAdmin: true, trusted: true, adminLeafletId, contributorKey: computeContributorKey(salt, adminUserId) }`; sets `publishedAt`. Works even when `COMMUNITY_PROMOS_ENABLED` is off (rows wait for the flag).
  - `POST /admin/leaflets/:id/unpublish` — sets `unpublishedAt`; `confirmedActive` stops returning its promos.
  - `GET /admin/leaflets/stats?days=30` → `{ personalLeaflets, sharesWithMatch, pagesRead, pagesUnreadable, pagesDropped, matchesShown, addedToList, pushesSent, pushesOpened }` from `leaflets`, `leaflet_items` and `leaflet_notification_log` (accounts in `ADMIN_EMAILS` excluded, via `parseAdminEmails`).
  - Admin uploads never consume a page budget and need no consent.
- Ops note (no code): uploads up to 50 MB need `client_max_body_size` ≥ 55m on the shared nginx `api.ai-budget.pl` server block; the owner verifies or raises it before using the page. Record this in `docs/ops/` in Task 11.

- [ ] **Step 1: Write failing tests** — `non-admin → 403` (AdminGuard), `61st PDF page is not rendered`, `publish without validTo → 400`, `publish writes isAdmin+trusted rows with no account or user id`, `unpublish hides promos from confirmedActive`, `stats exclude ADMIN_EMAILS accounts`, `upload does not call LeafletBudgetService`.
- [ ] **Step 2:** Run `npx jest src/modules/leaflets/leaflets-admin` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests, typecheck, lint — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(leaflets): admin leaflet upload, review and publish`

### Task 10: Admin dashboard — Leaflets page

**Files:**
- Create: `apps/admin/src/app/leaflets/page.tsx`, `apps/admin/src/hooks/use-leaflets.ts`, `apps/admin/src/components/leaflets/LeafletUpload.tsx`, `LeafletReview.tsx`, `LeafletStats.tsx`
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx` (`{ href: "/leaflets", label: "Leaflets", icon: Newspaper }`)

**Interfaces:**
- Consumes: Task 9 routes (ky `api-client`, React Query, like `use-app-versions.ts`; upload via `FormData`).
- Produces: page with three parts — **Upload** (drop zone, images or one PDF, shows read progress by polling `GET /admin/leaflets/:id` every 2 s); **Review** (chain + date inputs, items table with inline edit and delete, a **Publish** button whose confirm dialog shows "N users will be notified" from `/recipients`; published leaflets list with **Unpublish**); **Stats** (the Task 9 numbers, 30 days). The page never shows uploaded images after extraction.

- [ ] **Step 1:** Implement hooks and components.
- [ ] **Step 2:** Run `npm run typecheck -w admin && npm run lint -w admin && npm run build -w admin` — Expected: PASS.
- [ ] **Step 3:** Run `npm run dev` in `apps/admin` against a local API, upload a 3-page sample PDF, edit an item, publish, unpublish; screenshot each state.
- [ ] **Step 4: Commit** — `feat(admin): leaflets page for upload, review and publish`

### Task 11: Docs and wiring

**Files:**
- Create: `docs/wiki/features/gazetka-match.md` (What this is, Entry points, Key concepts, Invariants = Global Constraints that bite, History), link from the analytics/shopping hub and `docs/wiki/index.md`; one line in `docs/wiki/log.md`
- Modify: `user_docs/<9 langs>/38-shopping-list.md` (extend the existing section — no new help registration needed), then `npm run generate:help` and the help-center rebuild per `features/help-content-pipeline.md`
- Modify: `CLAUDE.md` Environment Variables only (repo-wide): `LEAFLET_PAGES_FREE|PRO|BUSINESS`, `LEAFLET_ADMIN_MAX_PAGES`, `LEAFLET_ADMIN_MAX_MB`, `COMMUNITY_PROMOS_ENABLED` (default OFF), `COMMUNITY_PROMO_K`, `COMMUNITY_PROMO_MIN_TRUSTED`; and the API modules list gains `leaflets`
- Create: `docs/ops/leaflets.md` — enabling the community layer, the nginx body-size check, rollback (flag off + force-recreate `api`)

- [ ] **Step 1:** Write the pages; run `python scripts/wiki-lint.py` — Expected: no new errors.
- [ ] **Step 2:** Run `npm run generate:help` — Expected: `apps/mobile/src/help/content.ts` regenerated with the new text in 9 languages.
- [ ] **Step 3: Commit** — `docs(leaflets): wiki page, user docs, env vars, ops runbook`
