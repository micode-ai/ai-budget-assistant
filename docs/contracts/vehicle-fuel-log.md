# Contract: vehicle fuel log

Module: `apps/api/src/modules/vehicles/`

## Data
- `Vehicle { id, accountId, userId, name, fuelType, isDeleted, createdAt, updatedAt }`
- `FuelLog { id, accountId, vehicleId, expenseId (unique), liters Decimal(8,3), odometerKm Int, isFullTank Boolean=true, createdAt }`
  cascade on account / vehicle / expense delete. `fuelType`: `petrol | diesel | lpg | electric | hybrid | other`.

## `computeFuelStats(entries): VehicleStats` (pure, `fuel-stats.util.ts`)
Input: `{ date, odometerKm, liters, amount, isFullTank }[]` (any order; sorted by odometer, then date).
- Full-tank method: a fill's litres count for the interval ending at it; the FIRST full fill only anchors the baseline.
  Partial fills inside an interval add their litres/cost to the next full fill's interval.
- `consumptionLPer100Km = litres / km * 100`, `costPerKm = cost / km`, `costPer100Km`, both over all closed intervals.
- Intervals with `km <= 0` are skipped. Fewer than two full fills -> all metrics `null`.
- `lastPricePerLiter` = amount/liters of the latest entry. `series` = per closed interval `{date, lPer100Km, costPer100Km}`.

## HTTP (`/vehicles`, JwtAuthGuard + AccountContextGuard; writes ViewerBlock)
- `GET /vehicles`; `POST /vehicles {name, fuelType}`; `PATCH /vehicles/:id`; `DELETE /vehicles/:id` (soft)
- `GET /vehicles/:id/stats` -> `VehicleStats`
- `GET /vehicles/:id/fuel-logs`; `PUT /vehicles/:id/fuel-logs/:expenseId {liters, odometerKm, isFullTank?}` (upsert)
- `DELETE /vehicles/fuel-logs/:expenseId`

## Invariants
- Every query filters by `accountId`; vehicle and expense must both belong to the caller's account.
- Expenses with `isDeleted` are excluded from stats. Amount is the expense's `amount` (never converted; one vehicle = one currency in practice).
- Expense id accepted as server PK or `clientId`; the RESOLVED PK is what is written.
