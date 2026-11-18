# Contract: vehicle renewal reminders

Module: `apps/api/src/modules/vehicles/`

## Data (`Vehicle`)
`nextInsuranceDate`, `nextInspectionDate`, `nextServiceDate` (`DATE`, nullable), `nextServiceOdometer` (Int, nullable),
`serviceOdometerNudgedFor` (Int, nullable; the target the odometer nudge already fired for).

## Pure rules (`vehicle-renewal.util.ts`)
- `dueRenewals(vehicle, today)` -> `{kind, days}[]` for dates exactly 14 or 2 calendar days (UTC) away; past dates never fire.
- `odometerNudgeDue(target, latestKm, nudgedFor)` -> true when `target - latestKm <= 500`, not yet nudged for this target.
- `rollForwardYear(date)` -> same day next year, Feb 29 clamps to Feb 28.

## HTTP
`PATCH /vehicles/:id {nextInsuranceDate?, nextInspectionDate?, nextServiceDate?: 'YYYY-MM-DD'|null, nextServiceOdometer?: int>=0|null}`.
Writes stay behind ViewerBlock; the existing account scoping applies. A new odometer target resets `serviceOdometerNudgedFor`.

## Cron (`VehicleRenewalCron`, daily 08:00 UTC)
Pages vehicles with any reminder field by `paginateById`; pushes to `Vehicle.userId` through `NotificationsService.sendToUser`
with type `subscription_renewal` (honours that preference); copy from `notifications/vehicle-renewal-i18n.ts`.

## Invariants
- Fire-and-forget pushes go through `logFireAndForget`; the odometer stamp is written BEFORE the push (a lost push beats a daily repeat).
- Latest odometer = max `FuelLog.odometerKm` over non-deleted expenses.
