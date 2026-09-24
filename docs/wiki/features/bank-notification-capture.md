# Bank-notification auto-capture

*Hub: [mobile-app](../mobile-app.md)*

## What this is

On Android, a push from an allow-listed bank app becomes an expense without the user typing
anything. The notification text is parsed **on the device** and never leaves it; only the resulting
expense is synced. iOS and web have no equivalent and ship no-op stubs.

Three layers: a native listener that forwards pushes, a JS parser that decides whether a push is a
spend and what it says, and reconciliation that stops the same charge from being booked twice when
it later arrives from a receipt scan or a bank import.

## Entry points

- `apps/mobile/android/app/src/main/java/com/budget/assistant/notifications/`
  - `BankNotificationListenerService.kt` — the `NotificationListenerService`; holds `BANK_PACKAGES`
  - `NotificationCaptureModule.kt`, `NotificationCapturePackage.kt` — the bridge, registered by hand
    in `MainApplication.kt`'s `getPackages()`
- `apps/mobile/src/services/notificationCapture/`
  - `index.android.ts` (`BANK_PACKAGES_DISPLAY`, permission/enable), `index.ios.ts`, `index.web.ts`,
    `index.ts` — the platform split; iOS/web report `isPermissionGranted() = false`
  - `captureService.ts` — `subscribeToCapture`, the parse → dedup → `addExpense` pipeline
  - `contentMatch.ts` — client-side content dedup; `dedup.ts` — the `externalRef` hash
- `apps/mobile/src/services/notificationParser/`
  - `index.ts` — the gate, then per-bank template, then generic fallback
  - `templates.pl.ts` — per-bank Polish templates; `merchants-pl.ts` — the PL brand map
  - `generic.ts` — the country-agnostic parser and the spend gate
- `apps/mobile/src/hooks/useBankNotificationCapture.ts` — subscribes on mount, called from `app/_layout.tsx`
- `apps/mobile/app/settings/auto-capture.tsx` — the opt-in screen (Android only, linked from the import hub)
- Server: `apps/api/src/modules/expenses/expense-created-hooks.service.ts`
  (`reconcileNotificationStub`), `anomaly/anomaly-detectors.service.ts` (`detectPossibleMerge`),
  `import-bank/import-bank-dedup.service.ts` (`flagPossibleMerges`), `anomaly/anomaly-helpers.util.ts`
  (`expensePayee`, `DUP_DAY_MS`)
- Merge UI: `apps/mobile/app/expense/merge.tsx`; endpoint `POST /expenses/merge`

## Key concepts

**The allow-list is per app, not per notification.** 43 bank packages across PL/DE/AT/ES/FR/NL/UA/RU/BY,
kept in sync by hand between the Kotlin `BANK_PACKAGES` set and the JS `BANK_PACKAGES_DISPLAY`
(which adds a `country` field so the opt-in screen can group banks). Being on the list says only
that a push *may* be a spend — hence the gate below.

**Parse order.** `notificationParser/index.ts` applies the spend gate, then tries the per-bank PL
template, then falls back to `generic.ts`: amount in EU comma-decimal or Anglo dot-decimal,
currency by symbol or ISO code, merchant via language-aware connectors (`bei`, `chez`, `à`, `en`,
`bij`, `at`, `в`, `у`, `w`). `normalizeMerchantWithPLOverride` layers the PL brand map over the
generic normaliser, so a Polish brand in a German bank's push still canonicalises. Category
suggestion is PL-only; other merchants land uncategorised and merchant rules learn them.

**`source: 'notification'`** marks a captured expense (a plain string column, no migration). It is
written offline-first through `expenseStore.addExpense` with an `externalRef` of
`notif:<sha256(package|amount|merchant|date).slice(0,16)>`, deduplicated server-side by
`@@unique([accountId, externalRef])` — which is what stops two devices on one account booking the
same push twice.

**Two tiers of reconciliation** against the same charge arriving by another route. Both use one
payee predicate — `expensePayee()` (merchant, else description, lowercased and trimmed) plus
`DUP_DAY_MS` — shared with the `duplicate_charge` anomaly detector.

- **Tier 1, same currency (`P`) — automatic.** On the server, when a non-notification expense is
  created, `reconcileNotificationStub` soft-deletes a matching notification stub (same amount,
  currency, payee, date ±1 day). On the client, `contentMatch.ts` checks a parsed push against local
  expenses and skips the create entirely — skipping on the client avoids a row the server would
  then have to delete. `@@index([accountId, source])` keeps the stub lookup cheap.
- **Tier 2, different currency (`Q`) — suggest only.** A card charge booked in the merchant's
  currency by the push and in the settlement currency by the import cannot be auto-matched on
  amount. `detectPossibleMerge` inserts a `possible_merge` alert; the bank-import preview marks
  such rows `possibleMerge` without changing import or skip counts. Only `POST /expenses/merge`
  mutates — gap-filling fields, unioning tags, carrying the project link, soft-deleting the loser
  and bumping `syncVersion` on both rows.

## Invariants

**A push must look like a spend, not merely contain a number and a currency.** Without the gate, a
Revolut crypto price alert ("…up 5.32% in the past 2 hours. It's now $59,123.45") was booked as
**5.32 USD** with merchant "The Past 2 Hours. It's Now" — the percentage read as the amount, `$` as
the currency, the Dutch/German `in <x>` connector as the payee. Eight such rows reached production
in one account. `looksLikeSpendNotification` requires spend wording in one of the nine languages
**or** an explicit debit sign on the amount; `isDeclined` rejects declined/rejected/insufficient-
funds outright. The keyword list deliberately includes every keyword a per-bank template anchors
on, so the gate never rejects a push a template was written for.

**The gate applies to BOTH parse paths, and percentages are masked before any amount match.** Six of
the templates (Pekao, Santander, Alior, BNP, Credit Agricole, Nest) use the bare
`AMOUNT_PATTERN_PL`, which matches any decimal — a loan ad's "RRSO 8,99%" was just as capturable.
`maskPercentages` applies to the **amount** lookup only; currency and merchant still read the
original text.

**An unsupported currency yields no expense, never a wrong-currency one.** CHF and CZK are detected
and dropped with a `console.warn`. CHF is not in the `Currency` union, so Swiss captures are skipped
until it is. `DETECTABLE_UNSUPPORTED` stays that short on purpose: ASCII codes are word-bounded now
(so `Br` no longer matches the "br" in "brutto" → BYN), but the list was kept narrow rather than
re-audited for NOK/SEK/RON.

**`SYMBOL_TO_ISO` needs the ISO codes as keys, not only the symbols.** It once had `€` but not
`EUR`, so every "12,34 EUR" push from a non-Polish bank was dropped as "no currency detected".

**Emit with `reactContext.emitDeviceEvent`.** Under RN 0.81 New Architecture,
`getJSModule(RCTDeviceEventEmitter).emit()` is silently swallowed — it was wrapped in an empty
`catch`, so events never reached JS and nothing logged. When the React context is not ready, the
service parks the event in a one-slot `pendingEvent` and `NotificationCaptureModule.init` flushes it.

**Subscribe on mount, not after auth.** `useBankNotificationCapture` runs with empty deps. Gating it
on `isAuthenticated`/`fontsLoaded`/`!isInitializing` meant a push arriving during boot was emitted
before JS had a listener and was dropped. Safe because Kotlin checks the SharedPreferences enable
flag before forwarding anything, and the handler returns early when auth is not ready.

**The native module is a legacy Old-Arch `ReactContextBaseJavaModule`, not a TurboModule.** Codegen
paths overflow Windows' 260-char MAX_PATH on the local toolchain — the same reason the keyboard
module was removed.

**PKO BP card debits say "Obciążenie kartą", not "Płatność"** — the template's `amountRegex` must
keep `Obci[ąa][żz]enie(?:\s+karty?)?`.

**Reconciliation order on the server is load-bearing.** `reconcileNotificationStub` must run before
the fire-and-forget `checkExpense`, so the stub it deletes is never a `duplicate_charge` candidate.
Only notification stubs are ever deletion candidates; two genuine non-notification expenses are
never deleted by Tier 1.

**`P` and `Q` are mutually exclusive** — same currency versus different currency — so a pair is
auto-deduplicated or suggested, never both. The `possible_merge` dedup key sorts the two ids, so it
fires once per pair regardless of which side arrived first.

**Failures are `console.warn`, never `console.error`** — the offline-first convention.

## Known gaps

- `BIND_NOTIFICATION_LISTENER_SERVICE` is a sensitive Play permission requiring justification, and
  can delay review.
- The two allow-lists are synchronised by hand; nothing checks they match.
- CHF is unsupported until added to the `Currency` union and `SUPPORTED_CURRENCIES`.
- When the push arrives *after* a receipt was scanned for the same charge, Tier 1 handles it; when a
  receipt is scanned *after* the capture, that pair is surfaced as a merge suggestion instead — see
  the ABA-568 bullet still in `CLAUDE.md`.

## History

ABA-294 (the listener and the PL templates) · ABA-295 (multi-country allow-list, generic parser) ·
ABA-296 (two-tier dedup, `POST /expenses/merge`) · ABA-297 (New-Arch emission, subscribe-on-mount,
PKO template) · ABA-387 (the spend gate, percentage masking, the `EUR` and `brutto` fixes).
