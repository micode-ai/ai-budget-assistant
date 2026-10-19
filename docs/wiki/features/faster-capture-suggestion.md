# Faster-capture suggestion

*Hub: [mobile-app](../mobile-app.md)*

## What this is
A one-time suggestion of faster ways to add expenses, shown after the user has typed about ten
expenses in by hand. Manual entry is where people burn out: the most engaged external web user in
the telemetry typed dozens of expenses on day one, came back twice and left, never having met the
receipt scan, voice, the bots or the import. Client-only, no endpoint, no migration.

## Entry points
- `apps/mobile/src/features/captureSuggestion/captureSuggestion.ts` — the pure decision, the
  faster-source set, the per-platform option list
- `apps/mobile/src/stores/captureSuggestionStore.ts` — MMKV: `manualSaves`, `shown`; memory: `isPending`
- `apps/mobile/src/hooks/useFasterCaptureSuggestion.ts` — state, handlers, telemetry
- `apps/mobile/src/components/captureSuggestion/` — `FasterCaptureSuggestion.tsx` (native → sheet),
  `.web.tsx` (decides by width), `FasterCaptureSheet.tsx`, `desktop/FasterCaptureDialog.tsx`,
  `FasterCaptureOptions.tsx` (the rows, one definition)
- Counted in `ExpenseCreateForm.tsx` right after `expense_manual` `completed`; mounted in
  `app/_layout.tsx` beside the What's New spotlight

## Key concepts
**Due at `MANUAL_SAVES_THRESHOLD` (10) manual saves through the create form**, counted per device.
Every path that hosts `ExpenseCreateForm` counts (the phone route and the desktop `CreateDialog`).
On the save that crosses it, `isPending` turns true and the root-mounted component appears over
whatever screen `onDone` returned to.

**Never to someone already using a faster way.** `hasUsedFasterCapture` checks the loaded expenses
for a `voice`, `ocr`, `import`, bot (`telegram`/`whatsapp`/`slack`) or `notification` source.

**Options per platform:** receipt scan, voice, the bots screen, bank import everywhere; bank
notification capture on Android only. Each destination gates itself (tier limits included), as the
spotlight's destinations do.

**Telemetry flow `capture_suggestion`:** `started` when it appears, `completed` when an option is
chosen; a dismissal reports nothing and reads as derived `abandoned`.

## Invariants
**Shown once, ever, per device.** Any outcome — an option, "Not now", the scrim, Esc — calls
`markShown`, and `recordManualSave` stops counting after that. A suggestion that became due but was
never drawn (the app closed first) is re-evaluated on the next save, because `shown` was never set.

**Phone sheet, desktop dialog, one hook.** Both frames read `useFasterCaptureSuggestion`, so a
resize across 1024 px swaps the frame and keeps the state. The sheet adds `insets.bottom` (ABA-483).

**Copy lives in all nine locales** under `captureSuggestion.*`; a test asserts every key is present
and non-empty, because i18next renders the key string for a missing one.

## Known gaps
- The count is per device and starts at zero for existing users when this shipped, so a heavy
  manual user sees it after ten more saves, not immediately.
- Nothing coordinates it with the What's New spotlight or the store-rating prompt; they fire on
  different moments (cold start, receipt `Done`) rather than on a manual save.

## History
[ABA-682](https://github.com/micode-ai/ai-budget-assistant/issues/712)
