# Store-rating prompt

*Hub: [mobile-app](../mobile-app.md)*

## What this is

The app asks for a Google Play rating at a success moment, using the system in-app review sheet. It
had never asked at all — 13 reviews against a 10+ install bucket — and rating volume is what Play
ranks on, so this is the one store-ranking lever that is pure client code. No i18n and no user
docs: the sheet is system UI.

## Entry points

- `apps/mobile/src/features/review/shouldAskForReview.ts` — the pure decision
- `apps/mobile/src/features/review/maybeAskForReview.ts` — reads state, marks, requests
- `apps/mobile/src/stores/reviewPromptStore.ts` — MMKV `review-prompt`: `lastAskedAt`, `lastAskedVersion`
- `apps/mobile/src/services/storeReview.ts` — the `expo-store-review` wrapper
- Call sites: `apps/mobile/src/hooks/useReceiptSave.ts` (the `finish` path of the save alert),
  `apps/mobile/app/wrapped/index.tsx` (after a successful share), and
  `apps/mobile/src/components/expenses/create/ExpenseCreateForm.tsx` (after a manual save,
  [ABA-733](https://github.com/micode-ai/ai-budget-assistant/issues/771))

## Key concepts

**Two throttles, neither implying the other**, plus a floor:
- never twice on the same app version — stops a second ask inside one release, such as a user
  scanning ten receipts in an evening;
- never inside `MIN_DAYS_BETWEEN_ASKS` (90) — roughly Play's own quota window, inside which a
  request is silently dropped;
- at least `MIN_TRANSACTIONS` (5) — or the call site's own `minTransactions`: the manual-save
  path passes `MIN_TRANSACTIONS_AFTER_MANUAL_SAVE` (10), since a manual save is the everyday action.

**`maybeAskForReview` is a plain function, not a hook** — every call site is an Alert callback, not
a render.

## Invariants

**Count transactions from SQLite, never from the in-memory stores.** The stores fill only after the
cold-start gate opens, so an established user reads as zero for a moment on every launch — the same
trap [first-run onboarding](first-run-onboarding.md) documents.

**Mark before requesting.** `requestStoreReview` resolves identically whether Play showed the sheet
or dropped it for quota. Marking on success would re-fire on every later save and spend the quota
repeatedly for no signal.

**Ask on "Done", never on "Scan another".** Interrupting a batch-scanning run with a system sheet is
how a prompt earns a one-star answer. (The shopping-list undo button on the same alert also leaves
through `finish`, so it counts as Done.)

**A corrupt stored timestamp resolves to `null`, not `NaN`.** `NaN` compares false against every
operand and would silently disable the interval throttle.

**Never throws; `console.warn` on failure.** A prompt not appearing is the expected outcome on
plenty of devices. Web returns early.

**Never on the same save as the faster-capture suggestion.** The manual-save ask is skipped when
`useCaptureSuggestionStore.isPending` is set — that one-time sheet ([faster-capture-suggestion](faster-capture-suggestion.md), ABA-682) appears over the same
screen, and two sheets on one save is how a prompt earns a one-star answer.

**Keep it off the invite nudge's path.** The [referral invite card](referral-program.md) fires on a
settled bill split precisely so the two asks never stack on one success.

## Known gaps

- Play never reports whether the sheet was shown; the only verification is the review count moving
  after a release. Takes effect only with a native rebuild.
- Wrapped's text-share fallback asks once `Share.share` resolves, and on Android that promise does not
  distinguish a completed share from a dismissed sheet — so that path can ask after a non-share.
- Nothing coordinates this prompt with the invite nudge and the What's New spotlight beyond their
  being on different paths.
- **The trigger was too narrow to move the review count (checked 2026-11-09; manual saves added in
  [ABA-733](https://github.com/micode-ai/ai-budget-assistant/issues/771)).** Shipped in 1.24.0
  (2026-09-03); no new Play review since 2026-08-25. Only a receipt-scan "Done" (or a Wrapped share)
  can ask, and from 1.24.0 to 2026-11-09 only 10 users saved a scanned receipt (7 of them with 5+
  transactions, the team's own accounts included) against 40 who logged anything — so at most a
  handful of asks, each of which Play may drop for quota or for a user who already rated. Most
  users never reach the path: manual entry is the most common way in (see the admin Activation page).
- Until ABA-733 `requestStoreReview` called the async `StoreReview.hasAction()` without `await`, so
  the check read a Promise and never blocked; it is awaited now.

## History

ABA-485 (the prompt) · [ABA-733](https://github.com/micode-ai/ai-budget-assistant/issues/771) (manual-save trigger, awaited `hasAction`). `CLAUDE.md` had cited it as ABA-492, which is the `utm_*` fallback.
