# Safe to Spend + Affordability Oracle + Notification Auto-Capture — Design

Three coupled features. #1 and #3 share ONE deterministic cashflow engine. #2 is an
independent Android-only native capture path that lands expenses through the existing
write pipeline. Date: 2026-06-28.

Role routing: db-engineer (schema), backend-engineer (engine service + AI function + endpoint),
mobile-engineer (hooks, widget, native module, screens), aba-ai-engineer (AI function wiring +
prompt), aba-security (native NotificationListenerService + new write surface — flagged below).

---

## Goal

- **#1 Safe to Spend Today** — one deterministic number on the home hero + Android widget:
  what the user can spend today and still cover the rest of the month's known obligations and
  on-track goal contributions. Zero AI cost, multi-currency aware.
- **#3 Affordability Oracle** — "Can I afford X for N?" in chat → binary YES/NO + one-line reason
  from the SAME engine. Deterministic verdict, LLM only narrates.
- **#2 Notification Auto-Capture (Android)** — a native `NotificationListenerService` reads bank
  push notifications, parses amount/merchant/currency, and auto-creates an expense via the
  existing offline-first pipeline (`MerchantRulesService` for category, `externalRef` for dedup).
  iOS is a graceful no-op.

---

## 1. Shared cashflow engine — the crux

### Single-source-of-truth decision: **server-side (NestJS), one service**

The engine lives in the API as `modules/insights/safe-to-spend.service.ts` (the `insights`
module already exists and already holds derived/projection logic). Rationale:

- #3 (the AI function) runs server-side and MUST hit the same logic. A client-only engine would
  force the AI to re-implement it or round-trip to the client — neither is acceptable.
- The inputs (`user_subscriptions`, recurring expenses, income history, goals, wallet summary)
  are all already queryable server-side via existing services. The engine is a thin aggregation
  over them — no new data needed (see §2).
- The mobile home hero/widget calls a new **`GET /insights/safe-to-spend`** endpoint and caches
  the result locally; it does NOT re-derive the number. This keeps #1 and #3 byte-identical.

**Why not client-side like `useFinancialHealthScore.ts`/`useScenarioProjection.ts`?** Those are
pure presentational hooks over already-synced SQLite. Safe-to-spend depends on
`user_subscriptions` and goal pace, which are not all fully mirrored offline, and #3 needs it
server-side regardless. We DO add a thin client hook `useSafeToSpend.ts` (mirrors those two
hooks' shape) but it consumes the endpoint result + falls back to a local approximation when
offline (see Mobile flow). Server is canonical; client is a cache + offline degrade.

The engine pure-computes a verdict; FX conversion reuses `ExchangeRateService` exactly as
`ai-tools.service.ts` already does (`getRatesSafe`/`convertAmount`, lines 37–53).

### Inputs (all existing data, queried by `accountId`)

| Input | Source |
|---|---|
| Current balance per currency | `WalletService.getSummary(accountId)` → `balances[].currentBalance` (wallet.service.ts:60) |
| Known upcoming subscription charges | `prisma.userSubscription` where `isActive`, `nextRenewalDate <= horizon`; project forward by `billingCycle` within horizon (weekly may recur 2–4×) |
| Known recurring expenses | Same grouping as `expense-recurring.cron.ts:41–82`: latest per `recurringId`, `addPeriod(lastDate, period)`, count occurrences `<= horizon` |
| Expected income before horizon | Inferred (see income inference below) |
| On-track goal contributions | `prisma.savingsGoal` where `status='active'`; required pace = `(targetAmount − currentAmount) / monthsLeft`, prorated to days remaining in horizon |
| Display currency | `user.currencyCode` |
| FX rates | `ExchangeRateService.getRates(base)` |

**Horizon**: `min(end-of-current-month, nextExpectedIncomeDate)` if a confident income event is
inferred; otherwise end-of-current-month. `daysRemaining = horizonDate − today` (inclusive, min 1).

**Income inference** (deterministic, no LLM): look back 90 days of `Income` rows, group by
normalized `description` + `amount` bucket, detect a ~monthly cadence (gaps 25–35d, ≥2
occurrences) — reuse the recurrence heuristic already proven in the anomaly module's
`recurring_suggestion` detector (`modules/anomaly/`, monthly gap 25–35d). If a confident monthly
income is found and its next predicted date `<= end-of-month`, include it as `expectedIncome`
and use that date as the horizon. Low confidence → `expectedIncome = 0`, horizon = end-of-month,
set `incomeInferred=false` (the verdict notes "assuming no further income this month").

### Formula (transparent, deterministic)

```
projectedObligations = Σ upcoming subscriptions (≤ horizon, converted to base)
                     + Σ upcoming recurring expenses (≤ horizon, converted)
                     + Σ on-track goal contributions due before horizon (converted)
projectedAvailable   = Σ wallet currentBalance (converted to base)
                     + expectedIncome (converted, 0 if not inferred)
                     − projectedObligations
buffer               = configurable safety floor (default 0; see open questions)
safeToSpendToday     = max(0, (projectedAvailable − buffer) / daysRemaining)
```

`safeToSpendToday` is the headline number. The breakdown is returned so the UI/AI can explain it.

### Data structures (new DTOs in `packages/shared-types/src/dto/insights.ts`)

```ts
export interface SafeToSpendBreakdown {
  walletBalance: number;          // Σ converted current balances
  expectedIncome: number;         // 0 if not inferred
  upcomingSubscriptions: number;
  upcomingRecurring: number;
  goalContributions: number;
  buffer: number;
}

export interface SafeToSpendResponse {
  baseCurrency: string;           // user.currencyCode
  safeToSpendToday: number;
  projectedAvailable: number;
  daysRemaining: number;
  horizonDate: string;            // ISO date, end-of-month or next income
  incomeInferred: boolean;
  fxApproximate: boolean;         // true if any amount was FX-converted
  breakdown: SafeToSpendBreakdown;
  computedAt: string;             // ISO
}

// #3 verdict — engine output, narrated by the LLM
export interface AffordabilityVerdict {
  affordable: boolean;
  amount: number;
  currencyCode: string;
  safeToSpendToday: number;       // base currency
  amountInBase: number;
  reasonCode:
    | 'within_safe'               // amount <= safeToSpendToday
    | 'within_available_tight'    // <= projectedAvailable but eats most of it
    | 'over_available'            // exceeds projectedAvailable
    | 'delays_goal'               // affordable but pushes a goal off-track
    | 'wait_until_income';        // affordable only after next inferred income
  goalImpact?: { goalName: string; slipDays: number };
  suggestedDate?: string;         // ISO, for wait_until_income
  baseCurrency: string;
}
```

The verdict is computed deterministically: convert `amount` to base, compare against
`safeToSpendToday` and `projectedAvailable`, recompute goal pace with the purchase subtracted to
detect `slipDays`. The LLM receives this struct and writes the one-liner (e.g. "Yes — but your
'Vacation' goal slips ~2 weeks"). Phrasing only, never the decision.

---

## 2. Data model / migrations

### Engine (#1/#3): **NO migration.** Computable entirely from existing tables

`WalletBalance`, `Income`, `Expense` (recurring fields already present, schema.prisma:319–321),
`UserSubscription`, `SavingsGoal` (schema.prisma:1142). Confirmed — say so explicitly to
db-engineer: the engine ships with zero schema changes.

### #2 Notification capture — two small additions

**(a) New `ExpenseSource` value `'notification'`** — additive, no migration (the column is a
plain `String @default("manual")`, schema.prisma:322). Add to the union in
`packages/shared-types/src/entities/primitives.ts:5`:
```ts
export type ExpenseSource = 'manual' | 'voice' | 'ocr' | 'import'
  | 'telegram' | 'whatsapp' | 'slack' | 'notification';
```
Bank-notification expenses carry `source: 'notification'` and
`externalRef = 'notif:<sha256(packageName|amount|merchant|isoDate)>.slice(0,16)'` so they dedup
against re-deliveries via the existing `@@unique([accountId, externalRef])` (schema.prisma:352)
and against bank-import rows via the existing content-dedup (`flagContentDuplicates`).

**(b) Per-bank parse templates — NO new table needed initially.** Start with a **code-shipped
template registry** mirroring `import-bank/parsers/*` + `merchants-pl.ts`: a new
`apps/mobile/src/services/notificationParser/templates.pl.ts` holding regex templates keyed by
Android package name (`pl.pkobp.iko`, `pl.mbank`, `eu.eleader.mobilebanking.pekao`, Revolut,
etc.). This keeps parsing **client-side** (the notification text never leaves the device until it
becomes a normal expense) and reuses `normalizeMerchantPL`/`suggestCategoryFromMerchantPL`
patterns. A DB-backed per-account template table is deferred (open question §7) — only needed if
we let users define custom templates remotely.

> If the team prefers server-managed templates from day one: add table
> `notification_parse_templates (id, packageName, lang, amountRegex, merchantRegex, currencyDefault, isActive)`
> — global (not account-scoped), admin-managed. Recommended as a Phase 2, not Phase 1.

---

## 3. API surface

### #1 — `GET /insights/safe-to-spend`
- Guards: `JwtAuthGuard + AccountContextGuard` (read-only, no role/viewer guard — viewers may see it).
- Service: `SafeToSpendService.compute(accountId, userId, baseCurrency)` — follows the
  `(accountId, userId, dto)` convention; `baseCurrency` resolved from `user.currencyCode` in the
  controller (same pattern chat.service.ts uses to pass display currency).
- Response: `SafeToSpendResponse`.
- Caching: Redis `sts:{accountId}:{baseCurrency}` TTL 300s via `CacheService`. Invalidate on
  expense/income/subscription/goal writes by adding a `cacheService.del('sts:…')` alongside the
  existing `invalidateChatCache` calls (expenses.service.ts:267,512,532) — or simply rely on the
  short TTL (recommended; avoids touching many write paths). Per-user key because base currency
  is per-user (same reasoning as `buildToolCacheKey`, ai-tools.service.ts:252).

### #3 — new 12th AI function `check_affordability`
- No new HTTP endpoint — it's a **read action** in `ai-tools.service.ts` (executes immediately,
  no confirmation, like the `get_*` tools).
- Tool schema (add to `getToolDefinitions()`, ai-tools.service.ts:55):
```ts
{
  type: 'function',
  function: {
    name: 'check_affordability',
    description: 'Answer "can I afford X" questions. Computes a deterministic YES/NO from the '
      + 'cashflow engine. Use whenever the user asks if they can afford/buy something for an amount.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The price the user wants to spend' },
        currencyCode: { type: 'string', enum: ['USD','EUR','PLN','GBP','UAH','RUB','BYN'] },
        description: { type: 'string', description: 'What they want to buy (optional)' },
      },
      required: ['amount'],
    },
  },
}
```
- Wiring in `ai-tools.service.ts`: add `'check_affordability'` to the `executeAction` switch
  (line 263) calling a new `executeCheckAffordability(data, accountId, userId, baseCurrency)`
  that delegates to `SafeToSpendService` (inject it into `AiToolsService`'s constructor,
  line 21). It is a READ action → NOT added to `isWriteAction` (line 236). It IS cacheable via
  `executeWithCache` (the cache key already includes `baseCurrency`).
- Add `'check_affordability'` to `ChatActionType` (shared-types/src/dto/ai.ts:33) and a
  `CheckAffordabilityActionData` interface.
- Prompt: add a rule in `prompt-builder.service.ts` — "for affordability questions, call
  `check_affordability`; report its `affordable` verdict and `reasonCode` verbatim, never guess
  a yes/no yourself." Mirrors the existing "report `overBy` verbatim" rule (ai-tools.service.ts:586).

### #2 — reuses existing write path, no new endpoint
Parsed notifications become normal expenses through `expenseStore.addExpense` → SQLite →
`api.createExpense` (offline-first). Server side: `ExpensesService.create` already accepts
`source` and `externalRef` and enforces dedup. No new endpoint. (A future server-managed template
fetch endpoint is the only candidate addition — deferred.)

---

## 4. Mobile flow

### #1 Safe to Spend — hero + widget + hook
- **Hook** `apps/mobile/src/features/insights/useSafeToSpend.ts` (mirrors
  `useFinancialHealthScore.ts` shape): returns `{ data: SafeToSpendResponse | null, loading,
  hasEnoughData }`. Primary source = new store action `insightsStore.loadSafeToSpend()` hitting
  `GET /insights/safe-to-spend`; result cached in MMKV for offline display. **Offline fallback**:
  compute an approximate number locally from `expenseStore`/`incomeStore`/`walletStore`/`goalStore`
  + `convertAmount` (the same inputs the engine uses, minus subscriptions which may be stale) and
  flag `fxApproximate`. Pure `useMemo`, zero AI cost — matches the project's deterministic-hook
  precedent.
- **Store**: extend existing `insightsStore.ts` (don't add a new store) with
  `safeToSpend`, `loadSafeToSpend()`, `safeToSpendUpdatedAt`.
- **API client**: add `getSafeToSpend()` to `apps/mobile/src/services/insights.api.ts` (or
  `analytics.api.ts` if no insights file exists) and surface it on the `api` barrel.
- **Home hero**: render the number prominently in `app/(tabs)/index.tsx` hero header (above the
  quick-action strip). Tap → a bottom-sheet showing the `breakdown` (transparent formula). Gate
  behind a `WidgetKey` so users can hide it.
- **Widget**: add `'safeToSpend'` to `WIDGET_KEYS` (widgetVisibilityStore.ts:4) AND extend
  `widgetData.ts` — add a `safeToSpendToday`/`safeToSpendLabel` field to `WidgetSmallData` and
  push it into the existing `BudgetWidgetSmall` (or a new `SafeToSpendWidget`). `refreshWidgetData()`
  (widgetData.ts:217) already runs on Android only and re-renders via `requestWidgetUpdate` —
  feed it the cached `safeToSpend` value. No new native widget receiver needed if we reuse an
  existing widget surface; a dedicated receiver requires an AndroidManifest `<receiver>` block
  (cheap, follows the existing 4 receivers, manifest:46–73).

### #3 Affordability Oracle — chat only
No new screen. User asks in the existing AI chat (text or voice via existing
`income/voice.tsx`-style Whisper path). The 12th function executes immediately and the answer
renders in the normal chat bubble. Optionally add a tiny `ActionResultCard` variant
(`apps/mobile/src/components/chat/ActionResultCard.tsx`) that shows a green ✓ / red ✗ chip for
`check_affordability` results — deterministic render from the verdict struct (same pattern as the
`ExpensesResult` card).

### #2 Notification Auto-Capture — native module + JS flow

**Native module surface (new, Android-only):**
- `apps/mobile/android/app/src/main/java/com/budget/assistant/notifications/BankNotificationListenerService.kt`
  — extends `android.service.notification.NotificationListenerService`. On `onNotificationPosted`,
  filters by an allow-list of bank package names, extracts `extras` (`title`, `text`,
  `bigText`), and forwards a minimal payload to JS. It does **NOT** parse or create expenses
  natively — parsing stays in JS/TS to reuse `merchants-pl.ts`.
- `NotificationCaptureModule.kt` + `NotificationCapturePackage.kt` — a React Native
  `NativeModule` exposing: `isPermissionGranted(): Promise<boolean>`, `openPermissionSettings()`
  (launches `ACTION_NOTIFICATION_LISTENER_SETTINGS`), `setEnabled(boolean)`, and a
  `DeviceEventEmitter` event **`onBankNotification`** with payload
  `{ packageName: string, title: string, text: string, postedAt: number }`.
  Registered manually in `MainApplication.kt:getPackages()` (line 24 — the file explicitly
  documents this manual-add seam).
- **AndroidManifest** additions: the listener service block with
  `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` + intent-filter
  `android.service.notification.NotificationListenerService` (manifest application block,
  alongside the existing widget receivers ~line 73).

**JS bridge / parsing / flow:**
1. `apps/mobile/src/services/notificationCapture.ts` — subscribes to `onBankNotification`
   (only when the user enabled capture). On each event:
2. `notificationParser/index.ts` picks the template by `packageName`
   (`templates.pl.ts`), runs `amountRegex`/`merchantRegex`, derives `currencyCode` (default by
   template / PLN), applies `normalizeMerchantPL(merchant)`.
3. Resolve category: call existing merchant-rule resolution. On device this is the
   `merchantRulesStore` (already loads rules from API); fall back to
   `suggestCategoryFromMerchantPL`. Final fallback: uncategorized.
4. Dedup: compute the `notif:` `externalRef`; skip if `expenseStore` already holds it locally;
   server enforces the unique constraint as the backstop.
5. Create: `expenseStore.addExpense({ ..., source: 'notification', externalRef, merchant,
   currencyCode, date: postedAt })` → offline-first SQLite write → fire-and-forget
   `api.createExpense` (failures stay `pending`, logged with `console.warn` per the offline-logging
   rule, never `console.error`).
6. UX feedback: a low-priority local notification / in-app toast "Captured 54 zł · Żabka — tap to
   review", deep-linking to `expense/[id]`.

**Opt-in / permission UX** (new screen `app/settings/auto-capture.tsx`, linked from the import
hub `app/settings/import/index.tsx` and/or settings reference hub):
- Explain what it does + privacy ("notification text is parsed on-device, only the resulting
  expense syncs"). One-time toggle → calls `openPermissionSettings()` (OS-level grant) → polls
  `isPermissionGranted()` on return. Bank allow-list shown as checkboxes. A "test capture" review
  list of the last N parsed items so users trust it before auto-create. Android-only section,
  hidden on iOS (`Platform.OS !== 'android'`).
- **iOS**: the module is a no-op stub (`NotificationCapture.ios.ts` returns
  `isPermissionGranted()=false`, `setEnabled` no-op). The settings screen shows an "Android only"
  note. Documented fallback (NOT built in this iteration): an iOS Share-Sheet extension to forward
  a bank-app screenshot into the existing OCR receipt path — listed as an option, not required.

---

## 5. i18n (all 9 locales: en, de, es, fr, pl, ru, ua, be, nl)

`apps/mobile/src/i18n/locales/*.ts` — add keys:

- **Safe to Spend (#1)**: `safeToSpend.title`, `safeToSpend.today`, `safeToSpend.subtitle`,
  `safeToSpend.breakdownTitle`, `safeToSpend.wallet`, `safeToSpend.expectedIncome`,
  `safeToSpend.subscriptions`, `safeToSpend.recurring`, `safeToSpend.goals`, `safeToSpend.buffer`,
  `safeToSpend.daysLeft`, `safeToSpend.noIncomeAssumed`, `safeToSpend.approxRate`,
  `safeToSpend.widgetLabel`. (~14 keys)
- **Affordability (#3)**: `affordability.yes`, `affordability.no`, `affordability.tight`,
  `affordability.delaysGoal`, `affordability.waitUntil`. (~5 keys; the LLM narrates, but the
  `ActionResultCard` chip needs labels)
- **Auto-capture (#2)**: `autoCapture.title`, `autoCapture.subtitle`, `autoCapture.privacy`,
  `autoCapture.enable`, `autoCapture.grantPermission`, `autoCapture.permissionGranted`,
  `autoCapture.banks`, `autoCapture.androidOnly`, `autoCapture.captured`,
  `autoCapture.reviewLast`, `autoCapture.testTitle`. (~11 keys)
- **Widget labels**: extend `widgets.*` and the `WidgetLabels` interface (widgetData.ts:15) with
  `safeToSpend`.

Total ≈ 30 keys × 9 locales. Also add `safe_to_spend` notification i18n if the capture toast is a
real push (`apps/api/.../notification-i18n.ts` is server-side; the capture toast is local/client,
so client i18n suffices).

---

## 6. Dependency order

Follows CLAUDE.md "Dependency Order for Changes". **Engine track (A)** and **native track (B)**
are largely parallel; they only converge at the home screen + settings hub.

**Track A — engine (#1/#3):**
1. `packages/shared-types` — `SafeToSpendResponse`, `SafeToSpendBreakdown`,
   `AffordabilityVerdict`, `CheckAffordabilityActionData`; add `'check_affordability'` to
   `ChatActionType`; add `'notification'` to `ExpenseSource`. *(db-engineer + backend)*
2. `packages/shared-utils` — (optional) a pure `computeSafeToSpend(inputs)` helper if we want the
   formula shared between server and the mobile offline fallback. **Recommended**: put the pure
   math here so server and the offline hook can't drift.
3. **No Prisma migration** for the engine. *(db-engineer confirms.)*
4. API: `modules/insights/safe-to-spend.service.ts` + `GET /insights/safe-to-spend` controller +
   `SafeToSpendService` injected into `AiToolsService`; add `check_affordability` schema +
   `executeCheckAffordability`; prompt rule in `prompt-builder.service.ts`. *(backend + ai-engineer)*
   — chat.service tests live in `chat.service.spec.ts`; add an affordability case.
8. Mobile API client: `getSafeToSpend()`.
9. Mobile: `useSafeToSpend.ts`, `insightsStore` extension, home hero number + breakdown sheet,
   `safeToSpend` `WidgetKey` + `widgetData.ts` field + widget render, `ActionResultCard` chip.
10. i18n keys (all 9).

**Track B — native capture (#2), parallel to A:**
1. `shared-types` — `ExpenseSource` `'notification'` (shared with Track A step 1).
3b. **No migration** (source value + externalRef are additive).
5–7. Mobile native module: Kotlin `BankNotificationListenerService` +
   `NotificationCaptureModule`/`Package`, register in `MainApplication.kt`, AndroidManifest
   service block; `NotificationCapture.ios.ts` no-op stub. *(mobile-engineer + aba-security audit)*
8–9. `notificationCapture.ts`, `notificationParser/templates.pl.ts`, `expenseStore.addExpense`
   capture path, `app/settings/auto-capture.tsx`, link from import hub.
10. i18n keys (all 9).

Convergence: home screen (Track A) and settings hub link (Track B) are the only shared files;
sequence those last.

---

## 7. Risks & open questions

### #2 native build risk (the big one — per CLAUDE.md constraints)
- **Windows MAX_PATH / Fabric codegen.** The keyboard-controller native module broke the Windows
  Android build via deep Fabric codegen paths. **Mitigation**: write the listener as a **legacy
  (Old-Arch-style) `ReactContextBaseJavaModule`**, manually registered in
  `MainApplication.kt:getPackages()` (the documented seam, line 24) — do NOT add a TurboModule
  spec / codegen config. A plain Java/Kotlin module + `DeviceEventEmitter` event needs no codegen
  and produces no long generated paths. Flag this explicitly to mobile-engineer.
- **`MainActivity.kt super.onCreate(null)` invariant** — the listener service is a separate
  component and does not touch `MainActivity`. Confirm `expo prebuild` is NOT run (bare workflow,
  `android/` committed) so the invariant can't regress. The new module edits
  `MainApplication.kt`, `AndroidManifest.xml`, and adds Kotlin files only — `MainActivity.kt`
  stays untouched.
- **Bare Expo / EAS builds the committed `android/` directly** — no prebuild, no `app.json`
  config plugin needed. New native files must be committed; verify they're picked up by the
  existing Gradle build. No config-plugin (which would imply prebuild). EAS build risk: a new
  permission may trigger Play Console review for notification-access (sensitive permission) —
  Google scrutinizes `BIND_NOTIFICATION_LISTENER_SERVICE` heavily and may require a
  declaration/justification. **Flag for product**: this can delay store approval.
- **aba-security pre-merge audit REQUIRED** — this is a new native surface that reads ALL
  notifications + a new auto-write path into expenses. Per the architect rules, flag
  `aba-security` for: the listener's package allow-list (must not exfiltrate non-bank
  notifications), on-device-only parsing guarantee, and the `notification` write surface.
- **No crash reporting on mobile** (CLAUDE.md) — a misbehaving listener service is only visible
  via Play Console vitals / `adb logcat`. Keep the service defensive (try/catch, never throw out
  of `onNotificationPosted`).
- **Battery/perf** — `NotificationListenerService` is always-on. Filter by package as the very
  first step; do no work for non-bank notifications.

### Engine edge cases (#1/#3)
- **Multi-currency**: every input converted to `user.currencyCode` via `ExchangeRateService`
  (same `getRatesSafe`/`convertAmount` as ai-tools.service.ts:37–53). If a rate is missing,
  surface `fxApproximate=true` and fall back to native sums (graceful degrade — proven pattern).
  Mixed-currency wallets where one currency has no rate → that currency's balance is excluded and
  flagged; document this in the breakdown.
- **Income inference confidence** — the riskiest assumption. If no reliable monthly income is
  detected, horizon = end-of-month and `expectedIncome=0` (conservative: the number will be
  lower, never overstated). Open question: should we let the user pin a payday in settings to
  override inference? Recommended as a fast-follow.
- **Negative `projectedAvailable`** → `safeToSpendToday` clamps to 0; verdict for #3 returns
  `over_available`. Make sure the UI shows 0 (not a negative) with an explanatory subtitle.
- **Goal pace** — uses linear pace to deadline (same model as `useFinancialHealthScore.ts:104`).
  A goal already past deadline or already met contributes 0 remaining pace.
- **Cache staleness** — 300s TTL means a just-added large expense isn't reflected for up to 5
  min. Acceptable for a "today" number; if not, hook the `del('sts:…')` into the expense write
  paths next to the existing `invalidateChatCache` calls (expenses.service.ts:267,512,532).

### Open questions for product
1. **Buffer default** — 0, a fixed amount, or % of monthly income? Affects how conservative the
   number feels. Recommend 0 for v1 (transparent) with a settings override later.
2. **Server-managed parse templates** — ship code-shipped PL templates now (Phase 1) and defer
   the `notification_parse_templates` table + admin UI to Phase 2? Recommended yes.
3. **Pro gating** — Safe-to-Spend and Affordability are strong "killer" hooks. Are they free or
   Pro? If Pro, gate `GET /insights/safe-to-spend` + `check_affordability` with
   `SubscriptionTierGuard + @RequireTier('pro')` (the existing pattern for `/insights/*` AI
   features) and surface the `Paywall` via `upgradeStore`. **Route this decision to
   aba-stripe-engineer.** Auto-capture is a clear Pro candidate too.

---

## Out of scope (this iteration)
- iOS passive capture / Share-Sheet OCR fallback (noted as an option only).
- Server-side per-account custom parse templates + admin UI.
- Non-Polish bank notification templates (start PL; extend via the same registry).
- A dedicated "payday" override setting (fast-follow).
- Backfilling historical income inference into a stored field.
