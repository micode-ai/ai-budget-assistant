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
  `src/components/vehicles/VehiclesAnalyticsCard.tsx` (Analytics tab, ABA-806),
  `src/components/expenses/detail/FuelSection.tsx`, `src/features/vehicles/` (`useVehicles`, `vehicleDisplay`), `src/services/vehicles.api.ts`
- Vehicle screen (ABA-811): API `vehicle-history.util.ts` (+ spec) behind `GET /vehicles/:id/history`; app route `app/vehicles/[id].tsx` →
  `src/components/vehicles/VehicleDetailView(.web).tsx` → `VehicleDetailPhone.tsx` / `desktop/VehicleDetailDesktop.tsx`, shared pieces in
  `VehicleDetailParts.tsx`, data in `src/features/vehicles/useVehicleDetail.ts`, pure helpers in `vehicleDetailDisplay.ts`

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

**Bulk** ([ABA-805](https://github.com/micode-ai/ai-budget-assistant/issues/843)): `POST /vehicles/:id/costs/bulk` takes a whole transactions-list selection in one request
(one-by-one trips the proxy rate limit), as person-made costs, skipping fill-ups.

**On Analytics** ([ABA-806](https://github.com/micode-ai/ai-budget-assistant/issues/844)): `VehiclesAnalyticsCard` lists each vehicle
with its `ownership` total (last 12 months, never the Analytics period filter), the monthly figure and its two largest kinds; a row opens
the vehicle screen (ABA-811), the caption link Settings → Vehicles. Phone: a section after the children card; desktop: a `BreakdownGrid` secondary tile beside Children. A row still
loading reads "—", never 0.

**The vehicle screen** ([ABA-811](https://github.com/micode-ai/ai-budget-assistant/issues/849)): `GET /vehicles/:id/history?months=3|6|12|24|0`
(0 = all time, anything else 400) answers one period: every calendar month of it by kind (empty months included), the total and
`perMonth` (total over the months in the window), km and all costs per km, the consumption segments that END in the window — computed
over ALL fill-ups, so a segment whose baseline full tank predates the window still counts — with the period consumption weighted by
distance, and every fill-up and cost newest first. An amount with no rate is listed but left out of every total (`fxApproximate`).
The app's `useVehicleDetail` holds the period, a picked month (tap a bar) and a picked kind (tap a breakdown row), above the 1024 split.
Analytics rows open it; Settings → Vehicles links to it from each card.

**Fuel without litres** ([ABA-804](https://github.com/micode-ai/ai-budget-assistant/issues/842)): `VehicleCost` kind `fuel` is a purchase known only by its amount — it counts in
`ownership.byKind.fuel` and never in consumption, which needs a `FuelLog`.

**Other car costs** ([ABA-803](https://github.com/micode-ai/ai-budget-assistant/issues/841)). `VehicleCost` ties one expense to one vehicle with a `kind` (service, insurance,
parking, tax, other); fuel stays in `FuelLog`, and one expense is one or the other (each write deletes the
other row). `Vehicle.categoryRules` claims categories per kind; `applyVehicleCategoryRules` materialises them
with `source = 'category'` and never touches a person's decision (`source = null`, including the `none`
tombstone a removal leaves) or a fill-up. Stats carry `ownership`: the last 12 months by kind, monthly
average, km from the fill-ups in the window and all costs per km.

**Receipt prefill** (`fuel-receipt-litres-ocr-prefill`): the receipt scan carries an optional `fuel {litres, pricePerLitre, fuelType}` read from the fuel line; `extractReceiptFuel` (`ai/utils/receipt-fuel.ts`) keeps it only when litres x price matches a line within 2%. The confirm card (`ReceiptFuelCard`) asks only for the odometer and, on save, writes the `FuelLog` (full tank). Vehicle: only one, else last used, else unique fuel-type match, else no card. Bots get the extraction through the shared finalizer but have no button yet.

## Invariants

- Every query filters by `accountId`; the expense id is accepted as PK or `clientId` and the RESOLVED PK is written.
- Soft-deleted expenses are excluded from stats.
- A scanned `fuel` block is read, never computed, and dropped whole (not half-filled) when litres x price misses every line; no odometer typed means no fuel-log write.
- Fuel-log reads also filter on the EXPENSE's current `accountId`, not only `FuelLog.accountId`: moving an expense to another account does not touch its fuel log, and without that filter the source account's stats would keep counting it.
- The 12-month window is CALENDAR months ending with the current one (`windowStart` in `vehicle-history.util.ts`), shared by
  `getStats().ownership` and the history endpoint — the Analytics card and the vehicle screen must show the same 12 months.
- A list row's caption never shows the server's copy of an encrypted field (`enc:` prefix); it prefers the device's decrypted expense.
- `declared before :id`: `DELETE /vehicles/fuel-logs/:expenseId` must stay above `DELETE /vehicles/:id`.

## Renewal reminders (ABA-827)

A vehicle carries optional `nextInsuranceDate`, `nextInspectionDate`, `nextServiceDate` and `nextServiceOdometer`, set through `PATCH /vehicles/:id`.
`VehicleRenewalCron` (08:00 UTC, `paginateById`) pushes 14 and 2 days before each date and once when the latest fill-up odometer is within 500 km of
the target. Pure rules: `vehicle-renewal.util.ts`; copy: `notifications/vehicle-renewal-i18n.ts` (11 locales). The odometer nudge is deduped by
`serviceOdometerNudgedFor`, stamped before the push. Not yet built: the form fields and "due soon" chip in the app, the roll-forward offer on logging a cost.


## Known gaps

SQLite mirror; bot fuel-log button; community-price comparison; mileage in the tax export; comparing two vehicles; a yearly forecast; stacked
monthly bars by kind (the bar chart has no stacking — a picked month's kinds show in the breakdown instead).

## History

The API (Vehicle + FuelLog, the full-tank method) came first; [ABA-796](https://github.com/micode-ai/ai-budget-assistant/issues/834) added the screens and display-currency costs.
[ABA-806](https://github.com/micode-ai/ai-budget-assistant/issues/844) put the vehicles on the Analytics tab and corrected the settings hint (the expense section is "Car", litres optional).
[ABA-811](https://github.com/micode-ai/ai-budget-assistant/issues/849) added the vehicle screen (periods, by month, by kind, consumption trend, every cost) after the card was reported as too thin.
