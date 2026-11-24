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
- Bots (ABA-830): `apps/api/src/common/bot-receipt-fuel.ts` (+ spec), `modules/{telegram,whatsapp,slack}/handlers/photo.handler.ts`
  (`offerFuelLog`, `handleFuelLogCallback`, `handleFuelSkipCallback`, `handleFuelOdometerInput`; specs `photo.handler.fuel.spec.ts`)
- Mobile: `src/components/vehicles/VehiclesSettings.tsx` (route `app/settings/vehicles.tsx`, registry key `vehicles`),
  `src/components/vehicles/VehiclesAnalyticsCard.tsx` (Analytics tab, ABA-806),
  `src/components/expenses/detail/FuelSection.tsx`, `src/features/vehicles/` (`useVehicles`, `vehicleDisplay`), `src/services/vehicles.api.ts`
- Vehicle screen (ABA-811): API `vehicle-history.util.ts` (+ spec) behind `GET /vehicles/:id/history`; app route `app/vehicles/[id].tsx` →
  `src/components/vehicles/VehicleDetailView(.web).tsx` → `VehicleDetailPhone.tsx` / `desktop/VehicleDetailDesktop.tsx`, shared pieces in
  `VehicleDetailParts.tsx`, data in `src/features/vehicles/useVehicleDetail.ts`, pure helpers in `vehicleDetailDisplay.ts`
- Renewals in the app (ABA-829): `src/components/vehicles/VehicleRenewals.tsx`, `VehicleRenewalFields.tsx`, `src/features/vehicles/vehicleRenewals.ts`

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
a switch never reads another account's list) and `reloadVehicles` refetches after a write. Since ABA-833 the cache
is `vehiclesCache` (an `AccountListCache`, see [pet-costs](pet-costs.md)): every mounted reader re-renders on a write,
a stale entry (30 s) is refetched on mount and screen focus, and sign-out clears it. The Fill-up section is
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

**Receipt prefill** (`fuel-receipt-litres-ocr-prefill`): the receipt scan carries an optional `fuel {litres, pricePerLitre, fuelType}` read from the fuel line; `extractReceiptFuel` (`ai/utils/receipt-fuel.ts`) keeps it only when litres x price matches a line within 2%. The confirm card (`ReceiptFuelCard`) asks only for the odometer and, on save, writes the `FuelLog` (full tank). Vehicle: only one, else last used, else unique fuel-type match, else no card.

**From the bots** (ABA-830): Telegram, WhatsApp and Slack offer **⛽ Add to fuel log (vehicle)** right after a scanned receipt
with a `fuel` block is saved as an expense. One shared core, `apps/api/src/common/bot-receipt-fuel.ts` (`BotReceiptFuelService` +
pure `pickFuelVehicle`/`parseOdometer` and the message builders; copy in `common/bot-i18n/shared-messages.ts`, keys `fuelLog*`), is
provided in each bot module; each `handlers/photo.handler.ts` only renders buttons. The vehicle rule is the app's, with "last
used" read on the server as the vehicle of the account's most recent fill-up (`VehiclesService.lastFuelVehicleId`); no vehicle
resolves → no button. The button arms a typed odometer prompt; a valid whole-km reading (`123456`, `123 456`, `123456 km`) writes
through `VehiclesService.upsertFuelLog` — the same method the app's save path calls — as a full tank with the receipt's litres.
**Skip** drops the offer. Callbacks: `fuel_log:{offerId}` / `fuel_skip:{offerId}` (WhatsApp `fuel_log--{offerId}`, whose button
title is the 20-character-safe `fuelLogButtonShort`, the vehicle named in the body). Redis keys, per platform prefix
(`telegram`/`wa`/`slack`): `{prefix}:fuel_offer:{offerId}` (1800 s) and `{prefix}:awaiting_fuel_odo:{userKey}` (600 s). `FuelLog`
has no price-per-litre or fuel-type column, so those two values are shown in the offer but not stored (price per litre is
the expense amount over the litres, as in the app).

## Invariants

- Every query filters by `accountId`; the expense id is accepted as PK or `clientId` and the RESOLVED PK is written.
- Soft-deleted expenses are excluded from stats.
- A scanned `fuel` block is read, never computed, and dropped whole (not half-filled) when litres x price misses every line; no odometer typed means no fuel-log write.
- Fuel-log reads also filter on the EXPENSE's current `accountId`, not only `FuelLog.accountId`: moving an expense to another account does not touch its fuel log, and without that filter the source account's stats would keep counting it.
- The 12-month window is CALENDAR months ending with the current one (`windowStart` in `vehicle-history.util.ts`), shared by
  `getStats().ownership` and the history endpoint — the Analytics card and the vehicle screen must show the same 12 months.
- A list row's caption never shows the server's copy of an encrypted field (`enc:` prefix); it prefers the device's decrypted expense.
- `declared before :id`: `DELETE /vehicles/fuel-logs/:expenseId` must stay above `DELETE /vehicles/:id`.
- Bot odometer prompt (ABA-830): it is the THIRD typed-input mode beside item-edit and date-edit ([bot-receipt-editing](bot-receipt-editing.md)).
  Arming any one clears the other two; save, cancel, skip, a written or failed fuel log and an expired offer all clear it; and a
  message with no digit at all leaves the mode and goes on to the AI chat — otherwise the next chat message is swallowed. A number
  that is not a valid reading keeps the mode for a retry.
- Bot fuel log permissions: the offer remembers its `userId`, so another member tapping it in a group or channel is ignored, and
  the writer role (`AccountMember.role !== 'viewer'`) is re-checked both when the button is tapped and when the reading is
  written — the role may have changed since the receipt was saved.
- A failure to build the offer never reads as a failed save: the expense is already written, so the offer path logs and shows no button.

## Renewal reminders (ABA-827)

A vehicle carries optional `nextInsuranceDate`, `nextInspectionDate`, `nextServiceDate` and `nextServiceOdometer`, set through `PATCH /vehicles/:id`.
`VehicleRenewalCron` (08:00 UTC, `paginateById`) pushes 14 and 2 days before each date and once when the latest fill-up odometer is within 500 km of
the target. Pure rules: `vehicle-renewal.util.ts`; copy: `notifications/vehicle-renewal-i18n.ts` (11 locales). The odometer nudge is deduped by
`serviceOdometerNudgedFor`, stamped before the push.

In the app (ABA-829): the vehicle sheet in Settings → Vehicles (phone, and the desktop settings pane — same component) has the four fields
(`VehicleRenewalFields.tsx`, dates through `DatePicker`, calendar days via `toDateInputValue`; the cross clears a date and the save sends `null`).
A "due soon" chip (a date within 30 days or past, or the latest odometer within 500 km of the target) shows on each vehicle card and under the
vehicle screen's heading on phone and desktop, and the screen has a **Renewals** card listing every set date (`VehicleRenewals.tsx`; in the
desktop rail at >= 1440, under the breakdown below it). Pure rules: `src/features/vehicles/vehicleRenewals.ts` (+ jest spec). The latest odometer
is `latestOdometerKm` on `GET /vehicles/:id/stats` and `/history` (max over ALL fill-ups, the same reading the cron uses), falling back to the
period's items for an older API. Marking an expense as an insurance or service cost in its Car section (`FuelSection.tsx`) offers to roll that
date a year forward (`proposedRenewal`, Feb 29 -> Feb 28): only while the date is set and due within 60 days or past, or from the expense's own
day when none is set; nothing is written unless the user confirms.

- The PATCH carries only the CHANGED renewal fields: re-sending an unchanged `nextServiceOdometer` would reset `serviceOdometerNudgedFor` on the
  server and re-arm a nudge already sent.
- Inspection has no `VehicleCostKind`, so no cost offers to roll it forward; bulk assignment (`BulkVehiclePickerSheet`) offers nothing either.


## Service interval by km (vehicle-odometer-service-interval)

`Vehicle.serviceIntervalKm` + `lastServiceKm` (migration `20261124090000_vehicle_service_interval`) give "service every N km". The target is
`lastServiceKm + serviceIntervalKm` and wins over the manual `nextServiceOdometer` (ABA-827), which stays the fallback. Pure rules:
`service-interval.util.ts` (+ spec). `GET /vehicles/:id/stats` and `/history` carry
`serviceForecast` (`targetKm`, `estimatedKm`, `remainingKm`, `daysLeft`, `kmPerDay`).

- Estimated mileage = latest reading + km/day over the last 60 days x days since it. The rate needs >= 2 readings spanning >= 7 days; with sparse
  readings it is `null` and the forecast is km left from the latest reading only, never "about N weeks" — the answer to users who skip the odometer.
- Marking an expense as a `service` cost (`setCost`) resets the counter: `lastServiceKm` = latest reading (never lowered), nudge re-armed. The bulk
  path and category rules do not reset it. Setting an interval with no `lastServiceKm` prefills it from the reading at the newest service expense.
- `VehicleRenewalCron` nudges interval vehicles on the ESTIMATED mileage (<= 500 km left), same `serviceOdometerNudgedFor` dedup.
- Not built yet: the vehicle screen row ("Service in ~900 km, about 3 weeks"), the interval field in the vehicle sheet, 11 locales; per-service-type intervals.

## Known gaps

SQLite mirror; community-price comparison; a bot partial-fill option (the bot always logs a full tank); mileage in the tax export; comparing two vehicles; a yearly forecast; stacked
monthly bars by kind (the bar chart has no stacking — a picked month's kinds show in the breakdown instead).

## History

The API (Vehicle + FuelLog, the full-tank method) came first; [ABA-796](https://github.com/micode-ai/ai-budget-assistant/issues/834) added the screens and display-currency costs.
[ABA-806](https://github.com/micode-ai/ai-budget-assistant/issues/844) put the vehicles on the Analytics tab and corrected the settings hint (the expense section is "Car", litres optional).
[ABA-811](https://github.com/micode-ai/ai-budget-assistant/issues/849) added the vehicle screen (periods, by month, by kind, consumption trend, every cost) after the card was reported as too thin.
ABA-827 added the renewal dates and the reminder cron; ABA-829 the app's fields, due-soon chips, Renewals card and the roll-forward offer.
ABA-826 read litres and price per litre off a fuel receipt; ABA-830 gave the three bots the "Add to fuel log" button.
ABA-838 added the km-based service interval, the mileage estimate and the reset on a service cost (API only).
