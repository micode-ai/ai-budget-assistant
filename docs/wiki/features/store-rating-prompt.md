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
- Call sites: `apps/mobile/src/hooks/useReceiptSave.ts` (the `finish` path of the save alert) and
  `apps/mobile/app/wrapped/index.tsx` (after a successful share)

## Key concepts

**Two throttles, neither implying the other**, plus a floor:
- never twice on the same app version — stops a second ask inside one release, such as a user
  scanning ten receipts in an evening;
- never inside `MIN_DAYS_BETWEEN_ASKS` (90) — roughly Play's own quota window, inside which a
  request is silently dropped;
- at least `MIN_TRANSACTIONS` (5).

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

**Keep it off the invite nudge's path.** The [referral invite card](referral-program.md) fires on a
settled bill split precisely so the two asks never stack on one success.

## Known gaps

- Play never reports whether the sheet was shown; the only verification is the review count moving
  after a release. Takes effect only with a native rebuild.
- Wrapped's text-share fallback asks once `Share.share` resolves, and on Android that promise does not
  distinguish a completed share from a dismissed sheet — so that path can ask after a non-share.
- Nothing coordinates this prompt with the invite nudge and the What's New spotlight beyond their
  being on different paths.

## History

ABA-485 (the prompt). `CLAUDE.md` had cited it as ABA-492, which is the `utm_*` fallback.
