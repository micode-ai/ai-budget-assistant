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

**Three automatic readers, in priority order over static hints.** Both import commits
(`import-wise`/`import-bank`) and the categorize pass call `getRulesMap(accountId)` and treat a
matching rule as a **higher-priority override** over the static `MERCHANT_CATEGORY_HINTS` /
`suggestCategoryFromMerchantPL` heuristics — a learned rule always wins over a guess. The categorize
pass additionally treats a rule hit as free: an expense resolved by rule never reaches the model and
never counts against that feature's daily ceiling.

**A 4th reader, but not automatic: Reapply (ABA-596).** The three readers above only ever apply a
rule going forward — to a future import row or a future categorize pass — never to an expense from
that merchant already sitting in some other category from before the rule was learned. "Reapply"
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
- A rule is applied by both bank/Wise imports and the categorize-uncategorized pass, and always
  **before** any model call for the same batch — a rule hit must never be second-guessed by the
  model afterward.
- Rules are cascade-deleted when their category is deleted.
- No rule migration on merchant rename/merge — a renamed merchant simply stops matching its old
  rule and needs a fresh one; import CSVs reproduce the same raw merchant names regardless, so this
  has not needed fixing in practice.

## History

ABA-261 — the feature (learning from a single manual edit; applying at import time). ABA-589 —
added learning from bulk recategorization, and reading rules as the first, free step of a
categorize-uncategorized pass. ABA-596 — Reapply: a per-rule, user-triggered, retroactive pass
that moves already-(mis)categorized expenses into a learned rule's target category, the one gap
`categorize-uncategorized` explicitly left open (it only ever looks at `categoryId: null`).
