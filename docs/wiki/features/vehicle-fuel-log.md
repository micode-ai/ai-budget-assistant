# Vehicle fuel log

*Hub: [api](../api.md) · related: [expenses-service](expenses-service.md), [tags](tags.md)*

## What this is

Optional `Vehicle` rows per account, and a `FuelLog` (litres, odometer, full-tank flag) attached 1:1 to an
existing expense. `GET /vehicles/:id/stats` answers "what does the car cost me": l/100 km, cost per km and per
100 km, last price per litre, and a per-interval series for a trend chart. API only so far — no mobile screen yet.

## Entry points

- `apps/api/src/modules/vehicles/` — `vehicles.service.ts`, `vehicles.controller.ts`, pure `fuel-stats.util.ts`
- Schema: `Vehicle`, `FuelLog` (migration `20261109020000_vehicle_fuel_log`)
- Shared types: `packages/shared-types/src/entities/vehicle.ts`
- Tests: `apps/api/src/modules/vehicles/fuel-stats.util.spec.ts`

## Key concepts

Separate tables, not `Expense` columns: the expense row is encrypted under E2EE and on the sync hot path, so a
fuel log sits beside it and cannot break the transactions list. Consumption uses the full-tank method — the first
full fill is only a baseline, partial fills fold into the next full interval, and non-positive distances are skipped.

## Invariants

- Every query filters by `accountId`; the expense id is accepted as PK or `clientId` and the RESOLVED PK is written.
- Soft-deleted expenses are excluded from stats.
- Fuel-log reads also filter on the EXPENSE's current `accountId`, not only `FuelLog.accountId`: moving an expense to another account does not touch its fuel log, and without that filter the source account's stats would keep counting it.
- `declared before :id`: `DELETE /vehicles/fuel-logs/:expenseId` must stay above `DELETE /vehicles/:id`.

## Known gaps

Mobile screen (phone + desktop web), SQLite mirror, i18n x9, OCR litres prefill, community-price comparison,
mileage in the tax export.
