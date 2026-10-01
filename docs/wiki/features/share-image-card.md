# Shareable image cards

*Hub: [mobile-app](../mobile-app.md) · consumers: [financial-wrapped](financial-wrapped.md),
[inflation-shield](inflation-shield.md), [real-salary](real-salary.md)*

## What this is

The one mechanism that turns a few lines of text into a 1080×1920 story-format PNG and opens the
system share sheet with it — used by Financial Wrapped, Inflation Shield and Real Salary. It needs
no native image module: the card is drawn on a canvas inside a hidden WebView.

## Entry points

- `apps/mobile/src/components/share/ShareImageCard.tsx` — the mechanism
- `apps/mobile/src/components/share/ShareImageCard.web.tsx` — the web no-op
- Thin wrappers: `apps/mobile/src/components/wrapped/WrappedShareCard.tsx`,
  `apps/mobile/src/components/insights/InflationShieldShareCard.tsx`,
  `apps/mobile/src/components/real-salary/RealSalaryShareCard.tsx`

## Key concepts

**The pipeline.** Hidden `react-native-webview` → HTML/canvas drawing the gradient and lines →
`canvas.toDataURL('image/png')` posted back → written with `expo-file-system` → `expo-sharing`
`shareAsync`. `share(payload)` is exposed through `forwardRef`; it resolves `true` or `false` and
never throws. One share is in flight at a time (a new call finishes the stale one with `false`),
and an 8-second timeout resolves `false` if the WebView never answers.

**Props vs payload.** The wrapper fixes `renderFnName` (the `window.<name>` function the injected
JS calls — each card mounts its own WebView, so the name lives in that card's own JS context),
`gradientFrom` / `gradientTo`, and `fileNamePrefix`. Each share passes a `ShareCardPayload { fileTag, title, lines, footer }`; the file is named
`<fileNamePrefix>-<fileTag>.png`. A wrapper owns only its gradient, its prefix and the mapping from
its own data to that payload.

**On web** `ShareImageCard.web.tsx` returns `null` and `share()` resolves `false`, so callers fall
back to a plain-text `Share.share`. It keeps `react-native-webview` and `expo-file-system` out of
the web bundle.

## Invariants

**A new shareable card is a new thin wrapper over `ShareImageCard`, never a copy of the
mechanism.** Wrapped and Inflation Shield were once a byte-faithful ~540-line duplicate of each
other, each with its own bridge, timeout, in-flight guard and error handling.

**Callers must handle `false`.** It is the normal result on web, on a device without a share
target, and on a timeout.

## Known gaps

- No component test: nothing in this repo renders a component (no `react-test-renderer` or
  testing-library), so the WebView bridge is verified only on a device.
- The wrappers' own `.web.tsx` no-ops (Wrapped, Inflation Shield) are not strictly needed —
  `RealSalaryShareCard` has none and resolves to `ShareImageCard.web.tsx` through its import.

## History

ABA-336 (Financial Wrapped, the first image share) · ABA-346 (Inflation Shield's copy) · ABA-353
(both extracted onto `ShareImageCard`).
