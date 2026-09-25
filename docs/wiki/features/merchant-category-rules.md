# Merchant-to-category auto-learning

*Hub: [api](../api.md) · [ai-features](../ai-features.md)*

## What this is

Learns, per account, that a given merchant belongs to a given category — from a user correcting an
expense's category by hand, or from a bulk recategorization — and then applies that memory
automatically at bank/Wise import time and at the start of a
[categorize-uncategorized](categorize-uncategorized.md) pass, so the user never has to teach the
same merchant twice.

## Entry points

- `apps/api/src/modules/merchant-rules/merchant-rules.service.ts` — `MerchantRulesService`:
  `upsertRule`, `getRulesMap`, `listRules`, `deleteRule`
- `apps/api/src/modules/merchant-rules/merchant-rules.controller.ts` — `GET /merchant-rules`,
  `DELETE /merchant-rules/:id` (`ViewerBlockGuard`)
- `apps/api/src/modules/expenses/expenses.service.ts` — `update()`'s single-edit learning call
- `apps/api/src/modules/expenses/expense-bulk.service.ts` — `bulkUpdate()`'s bulk learning call
- `apps/api/src/modules/import-wise/import-wise.service.ts`,
  `apps/api/src/modules/import-bank/import-bank.service.ts` — `getRulesMap(accountId)` read before
  each commit `$transaction`
- `apps/api/src/modules/ai/services/categorize-suggestions.service.ts` — reads the rules map before
  ever calling the model
- `apps/api/src/modules/ai/services/receipt-finalizer.service.ts` — `ReceiptFinalizerService
  .buildReceiptExpense()` reads the rules map at receipt-scan time, for every scan path (mobile app
  + all three bots — see Key concepts)
- `apps/mobile/src/services/notificationCapture/captureService.ts` — `handleBankNotification()`
  reads the rules client-side, before the auto-captured expense is even written
- `apps/mobile/src/stores/merchantRulesStore.ts`, `apps/mobile/app/settings/merchants.tsx`
  ("Category rules" section)
- Table `merchant_category_rules`, migration `20260615000000_add_merchant_category_rules`
- **Reapply (ABA-596)**: `MerchantRulesService.previewReapply`/`.reapply` — `GET
  /merchant-rules/:id/reapply-preview`, `POST /merchant-rules/:id/reapply` (`ViewerBlockGuard`) —
  and `apps/mobile/src/components/settings/merchants/MerchantsSettings.tsx`'s per-rule "Reapply"
  action

## Key concepts

**The key is always `merchant.trim().toLowerCase()`.** Every writer and every reader normalizes a
merchant the same way before touching the table; `@@unique([accountId, merchantNormalized])` is
what makes `upsertRule` idempotent per account.

**Three writers today, all fire-and-forget.**

1. `ExpensesService.update()` — after a successful manual category change on an expense that has a
   non-empty merchant.
2. `ExpenseBulkService.bulkUpdate()` — when a bulk patch sets `categoryId`, one rule per distinct
   non-empty merchant among the rows actually updated. Added for
   [categorize-uncategorized](categorize-uncategorized.md): applying a reviewed categorization is a
   bulk update, and it should teach exactly as well as editing one expense at a time would have.
3. Nothing else writes a rule — a bot-confirmed receipt, a notification capture, or a scan-time
   category suggestion never does, by design (see Known gaps on the categorize-uncategorized page).
   This is deliberately unchanged by ABA-597 below: that change added two more *readers*, not a
   third writer — a receipt scan or an auto-captured notification still never teaches a rule, only
   consumes one.

**Five automatic readers, in priority order over static hints.** Import commits
(`import-wise`/`import-bank`), the categorize pass, receipt scanning, and bank-notification capture
all call `getRulesMap(accountId)` (or, for notification capture, its client-side mirror
`merchantRulesStore.getRuleForMerchant()`) and treat a matching rule as a **higher-priority
override** over the static `MERCHANT_CATEGORY_HINTS` / `suggestCategoryFromMerchantPL` heuristics —
a learned rule always wins over a guess. The categorize pass additionally treats a rule hit as free:
an expense resolved by rule never reaches the model and never counts against that feature's daily
ceiling.

- **Receipt scanning (ABA-597)**: `ReceiptFinalizerService.finalizeReceipt()` fetches the rules map
  once per scan (mirrors the one-fetch-per-batch pattern of import/categorize) and
  `buildReceiptExpense()` prefers a rule hit over the OCR model's own `suggestedCategory` guess —
  including when the model itself answered `null` ("no category genuinely fits", the ABA-589
  behavior). Since `ReceiptFinalizerService` is the single funnel `OcrService.parseReceipt`/
  `parseReceiptPdf` always go through, this covers every scan path at once: the mobile app's
  `POST /ai/scan-receipt` and all three bots' photo handlers (Telegram/WhatsApp/Slack). Applied
  silently — `categoryId` changes, `categorySuggestion` (the model's own raw answer, shown to the
  user) does not, matching the existing "no special UI treatment for a rule-sourced category"
  precedent from import.
- **Bank-notification capture**: was already reading rules before ABA-597 — `captureService.ts`'s
  `handleBankNotification()` checks `merchantRulesStore.getRuleForMerchant(merchant)` first and only
  falls back to the PL-only static `suggestedCategory` heuristic when there is no rule, entirely
  client-side, before the auto-captured expense is even written to SQLite. See
  [bank-notification-capture](bank-notification-capture.md) — this page previously understated that.

**A 6th reader, but not automatic: Reapply (ABA-596).** The readers above only ever apply a
rule going forward — to a future import row, a future scan, or a future categorize pass — never to
an expense from that merchant already sitting in some other category from before the rule was
learned. "Reapply"
closes that gap on demand: from the merchant's row in "Category rules", `previewReapply` finds every
expense of that merchant currently filed under a category *other than* the rule's target (same
spend-eligibility filter as [categorize-uncategorized](categorize-uncategorized.md):
`isDeleted:false`, `isPlanned:false`, `isSplitReceivable:false`, `isDebt:false`, plus
`encryptedPayload: null` — a tier-1-encrypted expense's `merchant` column holds no server-readable
plaintext to match against, the identical reason that page excludes E2EE rows), groups them by
their *current* category, and the user picks which groups to move by unchecking any they know they
moved on purpose. `reapply` then does one plain `updateMany` over the selected groups' expense ids
— not through `ExpenseBulkService` (that would need `MerchantRulesModule` to import
`ExpensesModule`, which already imports `MerchantRulesModule`) — and busts the chat cache the same
way any other expense-category write does. No model call, so it shares no daily counter with
`categorize-uncategorized`. There is no schema flag for "the user deliberately overrode this" — the
per-group checkbox is the entire mitigation.

## Invariants

- Rules key on `merchant.trim().toLowerCase()` everywhere — never the raw merchant string, never a
  fuzzy match.
- A rule is learned from a single manual edit **and** from bulk recategorization; a new write path
  that changes an expense's category should call `upsertRule` too, mirroring one of these two sites,
  or the win from teaching once quietly stops applying to that path.
- A rule is applied by bank/Wise imports, the categorize-uncategorized pass, receipt scanning, and
  bank-notification capture, and always wins over a model/heuristic guess for the same
  item/batch/scan — a rule hit must never be second-guessed afterward. For receipt scanning
  specifically, "before any model call" is not literal (the category guess is one field inside the
  single OCR extraction call, which cannot be split out) — the rule instead overrides that field's
  answer when the response is built.
- Rules are cascade-deleted when their category is deleted.
- No rule migration on merchant rename/merge — a renamed merchant simply stops matching its old
  rule and needs a fresh one; import CSVs reproduce the same raw merchant names regardless, so this
  has not needed fixing in practice.

## History

ABA-261 — the feature (learning from a single manual edit; applying at import time). ABA-589 —
added learning from bulk recategorization, and reading rules as the first, free step of a
categorize-uncategorized pass. ABA-596 — Reapply: a per-rule, user-triggered, retroactive pass
that moves already-(mis)categorized expenses into a learned rule's target category, the one gap
`categorize-uncategorized` explicitly left open (it only ever looks at `categoryId: null`). ABA-597
— receipt scanning became a reader too (`ReceiptFinalizerService`), closing the other gap
`categorize-uncategorized`'s Known gaps section called out; bank-notification capture turned out to
already be a reader (shipped with ABA-294/295) and needed no code change, only a documentation
correction on this page and on [bank-notification-capture](bank-notification-capture.md).
