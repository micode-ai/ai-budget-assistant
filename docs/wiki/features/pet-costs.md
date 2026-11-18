# Pet costs

*Hub: [api](../api.md) · related: [vehicle-fuel-log](vehicle-fuel-log.md), [child-costs](child-costs.md), [expenses-service](expenses-service.md)*

## What this is

`Pet` rows per account (name, species, birthday, optional vaccination / parasite-treatment dates) and a `PetCost` row that
ties one expense to one pet with a `kind` (food, vet, grooming, supplies, insurance, other). `GET /pets/:id/history` answers
"what does this pet cost": cost by calendar month and kind, the period total, the monthly average and this year's total.
**API only so far** — the app screens, the reminder cron and category rules are open.

## Entry points

- `apps/api/src/modules/pets/` — `pets.service.ts`, `pets.controller.ts`, pure `pet-history.util.ts`, `dto/index.ts`
- Schema: `Pet`, `PetCost` (migration `20261118140000_pet_costs`)
- Shared types: `packages/shared-types/src/entities/pet.ts`
- Tests: `pet-history.util.spec.ts`, `pets.service.spec.ts`

## Key concepts

A deliberate third parallel implementation modelled on `vehicles` (not a generalised tracked-entity layer: that refactor
touches two live features and is a separate task). Separate tables beside `Expense`, so the encrypted, sync-hot expense row
is never altered. Costs come back in the caller's display currency (`req.user.currencyCode`, via `common/utils/fx.ts`);
an amount with no rate is listed but left out of every total and `fxApproximate` says so.

Bulk assign (`POST /pets/:id/costs/bulk`, ≤500 ids, PK or `clientId`) takes a whole transactions-list selection in one request,
so a big selection stays under the proxy rate limit.

## Invariants

- Every query filters by `accountId`; the RESOLVED expense PK is written to `PetCost`, never the raw param.
- Soft-deleted expenses are excluded from every figure; `@Delete('costs/:expenseId')` is declared before `:id`.
- Removing a cost deletes the `PetCost` row (unlike vehicles there is no category rule to re-apply, so no tombstone).
- Pets hold no encrypted fields; under E2EE the app must show the same lock note as for children and vehicles.

## Open

Mobile screens (phone + desktop), Settings → Pets, Analytics card, i18n ×11, user docs; vaccination/flea reminder cron
(the date fields are stored); per-pet category rules; generalising child/vehicle/pet into one tracked-entity layer.
