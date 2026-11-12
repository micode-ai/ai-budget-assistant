# Long-receipt fixtures

Six SYNTHETIC receipts for measuring the "long receipt in several photos" scan. The shops do not
exist and every item, price, date and number is made up — no real receipt, store or user data.

- `*.json` — the expected result of each receipt (shop, line list, line count, total) and how it is
  cut: `partsCount` overlapping crops, `overlapLines` lines repeated at each cut, and
  `repeatAcrossBoundary` for the case where the same product is GENUINELY bought twice in a row next to
  a cut (the model must keep both).
- `build-fixtures.py` — regenerates the JSON and renders the crops to `out/` (gitignored). Needs Pillow.
- Run the measurement with `scripts/long-receipt-eval.mjs` (manual, costs AI usage, never in CI).
