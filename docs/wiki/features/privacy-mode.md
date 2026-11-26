# Privacy mode

One tap on the home-header eye masks every amount drawn through the shared `formatCurrency` as `••••`. Module contracts are kept in the (gitignored) local `docs/contracts/`.

## Invariants
- The mask lives only in `packages/shared-utils/src/formatting/amount-mask.ts`; never add a per-screen ternary (Wrapped's local `hideAmounts` is the old pattern, pending migration).
- Exports and share images must use `withAmountsRevealed`, or they ship `••••`.
- The flip remounts the root `<Stack>` (key = `epoch`) because amounts format at render time.

## Not done yet
Desktop top-bar toggle and shortcut, Security setting for `startMasked`, hold-to-reveal, audit of non-shared formatting (`toFixed`, chart tooltips, widget data).

## History
- [ABA-847](https://github.com/micode-ai/ai-budget-assistant/issues/885) — first cut: shared-formatter mask and phone toggle.
