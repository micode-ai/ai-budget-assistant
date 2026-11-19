# Pet costs

*Hub: [api](../api.md) · related: [vehicle-fuel-log](vehicle-fuel-log.md), [child-costs](child-costs.md), [expenses-service](expenses-service.md)*

## What this is

`Pet` rows per account (name, species, birthday, optional vaccination / parasite-treatment dates) and a `PetCost` row that
ties one expense to one pet with a `kind` (food, vet, grooming, supplies, insurance, other). `GET /pets/:id/history` answers
"what does this pet cost": cost by calendar month and kind, the period total, the monthly average and this year's total.
The API shipped in ABA-828; the app screens, the bulk assign from the transactions list, the Analytics card and the
care-date reminder cron in ABA-831.

## Entry points

- API: `apps/api/src/modules/pets/` — `pets.service.ts`, `pets.controller.ts`, pure `pet-history.util.ts`, `dto/index.ts`
- Reminder cron: `pets/pet-reminder.cron.ts` (daily 08:15) over pure `pets/pet-reminder.util.ts`; push copy in
  `notifications/pet-reminder-i18n.ts` (11 languages)
- Schema: `Pet`, `PetCost` (migration `20261118140000_pet_costs`)
- Shared types: `packages/shared-types/src/entities/pet.ts` (`PetHistoryPeriod`, `PetHistoryItem` added in ABA-831)
- App client: `apps/mobile/src/services/pets.api.ts` (spread into `api`)
- App data: `src/features/pets/usePets.ts` (per-account cached list), `usePetDetail.ts` (the screen's one data hook),
  `usePetEncryptionNote.ts`, pure `petDisplay.ts`
- App UI: `src/components/pets/` — `PetsSettings` (Settings → Pets pane), `PetDetailView(.web)` → `PetDetailPhone` /
  `desktop/PetDetailDesktop` over `PetDetailParts`, `BulkPetPickerSheet`, `PetsAnalyticsCard`
- Routes: `app/settings/pets.tsx`, `app/pets/[id].tsx` (headers registered in `app/_layout.tsx`)
- Wired into: `settingsRegistry.ts` (pane `pets`), `app/settings/reference.tsx`, `ExpensesMobile.tsx`,
  `desktop/ExpensesDesktop.tsx` + `ExpensesDesktopDialogs.tsx`, `useExpenseMultiSelect.ts` (`handleBulkAssignPet`),
  `AnalyticsMobile.tsx`, `desktop/AnalyticsDesktop.tsx` → `BreakdownGrid.tsx`
- i18n: the `pets` namespace, directly after `vehicles`, in all 11 locale files
- User docs: `user_docs/<lang>/46-pet-costs.md`
- Tests: API `pet-history.util.spec.ts`, `pets.service.spec.ts`, `pet-reminder.util.spec.ts`, `pet-reminder.cron.spec.ts`;
  app `src/features/pets/__tests__/petDisplay.test.ts`

## Key concepts

A deliberate third parallel implementation modelled on `vehicles` (not a generalised tracked-entity layer: that refactor
touches two live features and is a separate task). Separate tables beside `Expense`, so the encrypted, sync-hot expense row
is never altered. Costs come back in the caller's display currency (`req.user.currencyCode`, via `common/utils/fx.ts`);
an amount with no rate is listed but left out of every total and `fxApproximate` says so (the app shows a notice).

Bulk assign (`POST /pets/:id/costs/bulk`, ≤500 ids, PK or `clientId`) takes a whole transactions-list selection in one request,
so a big selection stays under the proxy rate limit. The app sends the server PK when the row has one, else the device id,
and splits a selection over 500 into consecutive requests (`chunkPetIds`), never one request per expense.

**The app is online only, like vehicles.** There is no SQLite mirror: a failed load is `loadFailed`/`error` with a retry,
never an empty list or a zero total. The screens follow the vehicle screen's shape: `usePetDetail` is called once in
`PetDetailView` (and its `.web` sibling) above the 1024 split and passed down, so a resize keeps the picked period, month
and kind. Period chips 3/6/12/24 months/all; tiles Total, Per month, This year (independent of the period) and Entries;
costs by month (tap a bar to narrow), by kind (tap to filter), every cost with a remove button for editors.

**Reminders.** `PetReminderCron` pages live pets with either date (`paginateById`, 500) and pushes to the pet's `userId`
exactly 14 and 2 days before each date (UTC calendar days of the stored `@db.Date`; past dates never fire), under the
`subscription_renewal` notification type — the same switch as the vehicle renewals. Each push is fire-and-forget through
`logFireAndForget`. The dates are not rolled forward: after the visit the user sets the next one. `CreatePetDto` accepts
both dates since ABA-831, so the form saves in one request.

## Invariants

- Every query filters by `accountId`; the RESOLVED expense PK is written to `PetCost`, never the raw param.
- Soft-deleted expenses are excluded from every figure; `@Delete('costs/:expenseId')` is declared before `:id`.
- Removing a cost deletes the `PetCost` row (unlike vehicles there is no category rule to re-apply, so no tombstone).
- Pets hold no encrypted fields; under E2EE the app shows the lock note (`usePetEncryptionNote`, `PetEncryptionNote`):
  on an encrypted account it says pet names and dates are stored unencrypted, and when this device has no unlocked key
  it says merchants are hidden until unlocked. A list row's caption never shows the server's `enc:` copy — it prefers
  the device's decrypted expense (`petItemCaption`).
- The `@Cron` method takes no argument (`run()` → `runFor(today)`): the cron library calls its tick with its own
  arguments, so a defaulted `today` parameter would receive one of them.
- Dates in the form go only through the shared `DatePicker` and `toDateInputValue`/`parsePetDay` (local calendar day),
  never `toISOString()`/`new Date(string)`.
- Viewers see pets and costs with no write affordance (`canEdit`); the API's `ViewerBlockGuard` enforces it regardless.

## Open

Per-pet category rules (vehicles have them); rolling a care date forward after a vet expense; generalising
child/vehicle/pet into one tracked-entity layer; a deep link from the reminder push to the pet screen (the push carries
`petId`, but `useNotificationDeepLink` does not route it yet — the vehicle renewal push has the same gap).
