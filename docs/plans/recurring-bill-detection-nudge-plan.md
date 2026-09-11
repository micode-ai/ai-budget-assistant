# Plan: Nudge to mark a big one-off charge as recurring

Product idea: `docs/product-ideas/recurring-bill-detection-nudge.md`
Contract: `docs/contracts/recurring-bill-detection-nudge.md`

## Decisions (resolving open questions, FINAL — revised after codebase research)

Research into `AnomalyService.detectRecurringSuggestion` (already in
production) found it already does exactly what the idea's "sketch" section
asked for: it fires a `recurring_suggestion` alert for 3+ same-amount,
same-payee charges at a 25–35 day (or 6–8 day) cadence, on BOTH manual/voice/
OCR/bot expense creation AND import commits. The only real gap was that the
alert offered a single action ("Track this subscription" → `UserSubscription`)
with no way to flag the expense itself `isRecurring`. This changed the plan
significantly from the original sketch:

1. **No new detector, no new alert type, no new server endpoint, no
   migration.** A second detector matching the identical signal would fire a
   SECOND alert for the same pattern — two cards for one rent payment. Instead,
   the EXISTING `recurring_suggestion` alert gained a second action.
2. **"Mark as recurring" writes through the EXISTING `PATCH /expenses/:id`**
   (`UpdateExpenseDto` already accepts `isRecurring`/`recurringId`/
   `recurringPeriod` — confirmed in `expenses.service.ts`'s `update()`). No
   backend code changed.
3. **Confidence bar**: unchanged from the existing detector — 3 occurrences,
   monthly (25–35d) or weekly (6–8d) cadence. No new bar was invented.
4. **Only the triggering expense is tagged**, never prior occurrences —
   matches the original plan decision; the recurring cron clones forward from
   the latest dated row in a series regardless of history.
5. **Dedup**: the existing `recur:{merchantNorm}` dedup key on
   `anomaly_alerts` already fires the alert once ever per merchant — no new
   dedup-ledger store was needed (the idea's sketch speculated one might be).
6. **recurringId is generated CLIENT-SIDE** (mirrors `ExpenseCreateForm.tsx`'s
   own Repeat-toggle flow) and sent as-is on the PATCH — no server round trip
   needed before the optimistic local write.
7. **v2 deferred**: teaching `budget-projection.ts` to treat a known
   `isRecurring` amount as a fixed obligation. Out of scope here — this pass
   only makes marking bills recurring possible and one tap away; the value
   delivered today is the recurring cron + Safe-to-Spend + no re-detection
   (see contract doc for detail), independent of the projection formula.

## Task checklist

- [x] Survey existing anomaly module, recurring fields, alert card rendering, dedup ledger pattern
- [x] Write module contract in `docs/contracts/recurring-bill-detection-nudge.md`
- [x] Confirm `PATCH /expenses/:id` already supports isRecurring/recurringId/recurringPeriod (no backend change needed)
- [x] Mobile: `buildMarkRecurringUpdate` pure function in `attentionActions.ts`
- [x] Mobile: wire `onMarkRecurring` into `useAlertTapThrough.ts` (desktop) + `AttentionPanel.tsx` secondary action button
- [x] Mobile: wire inline "Mark as recurring" button into native `app/alerts/index.tsx`
- [x] Mobile: add `recurring_id` write support to `updateExpenseInDb` (local SQLite) — was silently missing
- [x] i18n: `alerts.markAsRecurring` in all 9 locales
- [x] Tests: `attentionActions.test.ts` — `buildMarkRecurringUpdate` unit tests
- [ ] Update CLAUDE.md with feature entry
- [ ] Update product-idea frontmatter status → building
- [ ] Create ABA-{N} GitHub issue + update user_docs (finish-aba-task)
