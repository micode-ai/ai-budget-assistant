# Vehicle fuel log

*Hub: [api](../api.md) · related: [expenses-service](expenses-service.md), [tags](tags.md)*

## What this is

Optional `Vehicle` rows per account, and a `FuelLog` (litres, odometer, full-tank flag) attached 1:1 to an
existing expense. `GET /vehicles/:id/stats` answers "what does the car cost me": l/100 km, cost per km and per
100 km, last price per litre, and a per-interval series for a trend chart. Since [ABA-796](https://github.com/micode-ai/ai-budget-assistant/issues/834) the app shows it: Settings → Vehicles
(phone and the desktop settings pane) and a Fill-up section on the expense screen and the desktop expense dialog.

## Entry points

- `apps/api/src/modules/vehicles/` — `vehicles.service.ts`, `vehicles.controller.ts`, pure `fuel-stats.util.ts`
- Schema: `Vehicle`, `FuelLog` (migration `20261109020000_vehicle_fuel_log`)
- Shared types: `packages/shared-types/src/entities/vehicle.ts`
- Tests: `apps/api/src/modules/vehicles/fuel-stats.util.spec.ts`, `vehicles.service.spec.ts`
- Mobile: `src/components/vehicles/VehiclesSettings.tsx` (route `app/settings/vehicles.tsx`, registry key `vehicles`),
  `src/components/expenses/detail/FuelSection.tsx`, `src/features/vehicles/` (`useVehicles`, `vehicleDisplay`), `src/services/vehicles.api.ts`

## Key concepts

Separate tables, not `Expense` columns: the expense row is encrypted under E2EE and on the sync hot path, so a
fuel log sits beside it and cannot break the transactions list. Consumption uses the full-tank method — the first
full fill is only a baseline, partial fills fold into the next full interval, and non-positive distances are skipped.

**Costs are in the display currency** (ABA-796): `getStats` takes `req.user.currencyCode` from the controller,
converts each fill-up's expense amount with `common/utils/fx.ts`, and a fill-up with no known rate adds no cost
and sets `fxApproximate` — never summed unconverted. `GET /vehicles/fuel-logs/:expenseId` answers `{ fuelLog: null }`
rather than 404, because the expense screen asks it for every expense with a vehicle on the account.

**Per account, and the screen says so** ([ABA-800](https://github.com/micode-ai/ai-budget-assistant/issues/838)): Settings → Vehicles names the current account.
`POST /vehicles/:id/move` ([ABA-801](https://github.com/micode-ai/ai-budget-assistant/issues/839)) moves a vehicle with no fill-ups on live expenses to an account the caller
can edit — fill-ups hang on expenses that stay in the source account. The app drops the target's cached list
(`forgetVehicles`) instead of refetching it under the current account's header.

**The app is online-only here.** `useVehicles` caches the list per account in module scope (keyed by account id, so
a switch never reads another account's list) and `reloadVehicles` refetches after a write. The Fill-up section is
drawn only when the account has a vehicle or the expense already has a fill-up, and sends `serverId ?? id`.

## Invariants

- Every query filters by `accountId`; the expense id is accepted as PK or `clientId` and the RESOLVED PK is written.
- Soft-deleted expenses are excluded from stats.
- Fuel-log reads also filter on the EXPENSE's current `accountId`, not only `FuelLog.accountId`: moving an expense to another account does not touch its fuel log, and without that filter the source account's stats would keep counting it.
- `declared before :id`: `DELETE /vehicles/fuel-logs/:expenseId` must stay above `DELETE /vehicles/:id`.

## Known gaps

Non-fuel car costs (service, insurance) — needs a link from any expense to a vehicle; SQLite mirror; OCR litres
prefill; a trend chart from `series`; community-price comparison; mileage in the tax export.

## History

The API (Vehicle + FuelLog, the full-tank method) came first; [ABA-796](https://github.com/micode-ai/ai-budget-assistant/issues/834) added the screens and display-currency costs.
