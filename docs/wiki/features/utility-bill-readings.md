# Utility bill readings

*Hub: [api](../api.md) · related: [vehicle-fuel-log](vehicle-fuel-log.md), [display-currency-conversion](display-currency-conversion.md)*

## What this is

A typed side-record on an expense, like the fuel log: the consumption on a utility bill (kWh, m³, GJ) for
electricity, gas, water or heating. It answers "is the bill higher because I used more, or because the price rose".

## Entry points

- `apps/api/src/modules/utilities/` — `utilities.service.ts`, `utilities.controller.ts`, pure `utility-stats.util.ts`
- Schema: `UtilityReading` (migration `20261126110000_utility_readings`)
- Shared types: `packages/shared-types/src/entities/utility.ts`
- Tests: `utility-stats.util.spec.ts`, `utilities.service.spec.ts`
- Mobile: `app/utilities/index.tsx` (header registered in `app/_layout.tsx`), `src/services/utilities.api.ts`; reached from the Settings reference list

## Key concepts

`PUT /utilities/readings/:expenseId` stores consumption and a derived `unitPrice` (amount / consumption, in the
expense's own currency). `GET /utilities/summary` buckets by calendar month per kind, converts cost to the
caller's `currencyCode`, and returns the unit price per month, a year-over-year comparison once a kind spans
12+ months, and a `priceNudge` when the latest month's unit price is more than 10% above the mean of the
three months before it (needs two priced months). A property label is a free-text string; the summary lists them
and can filter by one.

## Invariants

- Every query filters by `accountId`; the expense id is accepted as PK or `clientId` and the RESOLVED PK is written.
- Display currency comes from the controller, never a row; an unknown-rate cost is excluded and flags `fxApproximate`.
- Planned expenses are not spend and are excluded from the summary.
- Writes sit behind `ViewerBlockGuard`.

## Known gaps

No expense-form field set yet (readings are written through the API), no OCR/PDF prefill, no desktop-web layout,
no chart library (the screen draws bars from plain views), no bot support.

## History

[ABA-849](https://github.com/micode-ai/ai-budget-assistant/issues/887) — first pass.
