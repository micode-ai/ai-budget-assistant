---
id: shopping-list-receipt-reconciliation
title: 'Auto-check off shopping list items when a matching receipt is scanned'
status: building
priority: P2
created_at: 2026-09-11
jira_ticket:
orchestration_run: f10d1d67-d9b3-4b8d-8547-5faa5b0dbe4a
---

# Auto-check off shopping list items when a matching receipt is scanned

## User story
As a user who keeps a shopping list and then scans the store receipt afterward, I want the app to automatically check off list items that show up on the receipt, so I don't have to manually tick things off twice — once mentally while shopping and again by hand in the app.

## Value hypothesis
The app already has both halves of this: a shared, offline-first shopping list (`modules/shopping-list/`) with items keyed by product name, and a receipt scanner that extracts a canonical, normalized name per line item (`ExpenseItem.canonicalName`, plus the alias/rule machinery in `PriceHistoryService`/`ProductRulesService` that already resolves "MLEKO 3,2% ŁACIATE 1L" to a stable canonical form for price-history matching). Today those two features never talk to each other — checking off a list is entirely manual, even right after scanning the receipt for the same shopping trip. Since the matching/normalization logic already exists for a different purpose (price history), reusing it to reconcile a receipt against the active shopping list is mostly wiring, not new matching logic, and it closes a real everyday friction point for the app's most habitual users.

## Sketch
- After a receipt is saved (the same post-create hook chain `ExpenseCreatedHooksService` already runs for anomaly/family-feed/community-prices/shield-tracking), fire an additional fire-and-forget check: for each unchecked item on the account's active shopping list(s), see if any receipt line's canonical name matches (reuse the existing `normalizeProductName`/alias-COALESCE resolution already used by `ProductRulesService`).
- On a match, check the item off automatically and (optionally) show a small toast/summary on the receipt confirm screen: "3 items from your shopping list were on this receipt — checked off."
- Make it easy to undo — a single "Undo" affordance right after the toast, since an auto-action a user didn't ask for should always be trivially reversible (mirrors the existing `undo-delete-snackbar` pattern already proposed elsewhere in this backlog).
- Skip archived lists; only match against the account's currently active list(s), same scope `getRestockSuggestions`/`detectDeals` already use.

## Open questions
- Match by exact canonical-name equality only, or allow a looser fuzzy match (risk: false-positive auto-checks are more annoying than a missed one, so exact-or-alias-resolved match is probably the right conservative bar)?
- Should this run inline at scan time (so the confirm screen can show it immediately) or async after save (simpler, but the user won't see the effect until they revisit the list)?
- Does this want its own opt-out toggle, given some users may deliberately keep list items unchecked as a running "still need to buy" record even after buying them once (e.g. a recurring staple)?

## Cost estimate
2–3 days: the matching itself reuses existing normalization/alias logic; most of the work is the fire-and-forget hook, the undo affordance, and deciding the right toast/summary UX on the receipt confirm screen.
