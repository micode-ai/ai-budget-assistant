# Pet costs

*Hub: [api](../api.md) · related: [vehicle-fuel-log](vehicle-fuel-log.md), [child-costs](child-costs.md), [expenses-service](expenses-service.md)*

## What this is

`Pet` rows per account (name, species, birthday, optional vaccination / parasite-treatment dates) and a `PetCost` row that
ties one expense to one pet with a `kind` (food, vet, grooming, supplies, insurance, other). `GET /pets/:id/history` answers
"what does this pet cost": cost by calendar month and kind, the period total, the monthly average and this year's total.
The API shipped in ABA-828; the app screens, the bulk assign from the transactions list, the Analytics card and the
care-date reminder cron in ABA-831; per-pet category rules and the expense screen's Pet section in ABA-833, which makes
pets work like vehicles and children: **categories decide the pet**, a person can still decide per expense.

## Entry points

- API: `apps/api/src/modules/pets/` — `pets.service.ts`, `pets.controller.ts`, pure `pet-history.util.ts`, `dto/index.ts`
- Category rules (ABA-833): `pets/pet-cost-rules.util.ts` (`applyPetCategoryRules`, `parsePetCategoryRules`,
  `PET_COST_NONE`), daily catch-up `pets/pet-cost-rules.cron.ts` (04:45); applied fire-and-forget beside the vehicle and
  child rules in `expenses/expenses.service.ts` (create, update), `expenses/expense-bulk.service.ts` and
  `sync/sync.service.ts`
- Reminder cron: `pets/pet-reminder.cron.ts` (daily 08:15) over pure `pets/pet-reminder.util.ts`; push copy in
  `notifications/pet-reminder-i18n.ts` (11 languages)
- Schema: `Pet`, `PetCost` (migration `20261118140000_pet_costs`); `Pet.categoryRules` and `PetCost.source`
  (migration `20261119140000_pet_category_rules`)
- Shared types: `packages/shared-types/src/entities/pet.ts` (`PetHistoryPeriod`, `PetHistoryItem` added in ABA-831)
- App client: `apps/mobile/src/services/pets.api.ts` (spread into `api`)
- App data: `src/features/pets/usePets.ts` over `petsCache.ts` (an `AccountListCache` from `src/utils/accountListCache.ts`,
  read through `src/hooks/useAccountList.ts`; `useVehicles` uses the same pair since ABA-833), `usePetDetail.ts` (the
  screen's one data hook), `usePetEncryptionNote.ts`, pure `petDisplay.ts` (incl. the rule-form helpers `mapPetRules`,
  `togglePetRule`, `petRulesChanged`, `petRulesPayload`)
- App UI: `src/components/expenses/detail/PetSection.tsx` (the expense screen's Pet section, hosted by
  `app/expense/[id].tsx` and the desktop `ExpenseDialog.tsx`); `src/components/pets/` — `PetsSettings` (Settings → Pets
  pane, with the Categories block), `PetDetailView(.web)` → `PetDetailPhone` /
  `desktop/PetDetailDesktop` over `PetDetailParts`, `BulkPetPickerSheet`, `PetsAnalyticsCard`
- Routes: `app/settings/pets.tsx`, `app/pets/[id].tsx` (headers registered in `app/_layout.tsx`)
- Wired into: `settingsRegistry.ts` (pane `pets`), `app/settings/reference.tsx`, `ExpensesMobile.tsx`,
  `desktop/ExpensesDesktop.tsx` + `ExpensesDesktopDialogs.tsx`, `useExpenseMultiSelect.ts` (`handleBulkAssignPet`),
  `AnalyticsMobile.tsx`, `desktop/AnalyticsDesktop.tsx` → `BreakdownGrid.tsx`
- i18n: the `pets` namespace, directly after `vehicles`, in all 11 locale files
- User docs: `user_docs/<lang>/46-pet-costs.md`
- Tests: API `pet-history.util.spec.ts`, `pets.service.spec.ts`, `pet-reminder.util.spec.ts`, `pet-reminder.cron.spec.ts`,
  `pet-cost-rules.util.spec.ts`; app `src/features/pets/__tests__/petDisplay.test.ts`,
  `src/utils/__tests__/accountListCache.test.ts`

## Key concepts

A deliberate third parallel implementation modelled on `vehicles` (not a generalised tracked-entity layer: that refactor
touches two live features and is a separate task). Separate tables beside `Expense`, so the encrypted, sync-hot expense row
is never altered. Costs come back in the caller's display currency (`req.user.currencyCode`, via `common/utils/fx.ts`);
an amount with no rate is listed but left out of every total and `fxApproximate` says so (the app shows a notice).

Bulk assign (`POST /pets/:id/costs/bulk`, ≤500 ids, PK or `clientId`) takes a whole transactions-list selection in one request,
so a big selection stays under the proxy rate limit. The app sends the server PK when the row has one, else the device id,
and splits a selection over 500 into consecutive requests (`chunkPetIds`), never one request per expense.

**Category rules** (ABA-833, the vehicles' ABA-803 mechanism). `Pet.categoryRules` is `[{ categoryId, kind }]`;
`applyPetCategoryRules` materialises it as `PetCost` rows with `source = 'category'`, releases rule rows whose expense
left the category, was deleted or became planned (or whose pet no longer claims it), and skips split receivables. Two
pets claiming one category: the oldest pet wins. Rules are set through `PATCH /pets/:id` (or `POST /pets`) with
`categoryRules` — each category resolved as PK or `clientId`, live, `type: 'expense'`, visible to the account
(own or global), stored as the PK — and applied at once; the response carries `rulesApplied {attributed, released}`.
`GET /pets/:id/category-rules` returns each rule with `ids` (PK + clientId) so the phone matches its local category ids.
Deleting a pet re-applies, releasing its rule rows.

**Per-expense field.** `GET /pets/costs/:expenseId` → `{ cost: {petId, kind, source} | null }` (never a tombstone);
`PUT /pets/:id/costs/:expenseId` sets it by hand; `DELETE /pets/costs/:expenseId` takes it off. The expense screen's
**Pet** section (phone and desktop dialog, only when the account has a pet or the expense has a pet cost) uses these and
says "From the pet's categories" for a rule row.

**The pet-list cache is subscribable and revalidating** (ABA-833). The transactions tab stays mounted and shows "Assign
to pet" only when the cached list is non-empty; the first cache kept an early empty answer until a page reload. Now
`AccountListCache` notifies every mounted reader on each write, an entry older than 30 s is refetched on mount and on
screen focus (`useFocusEffect`), concurrent fetches share one request, `PetsSettings` writes the server's answer into
the cache at once (`putPet`/`dropPet`) before a background refetch, and sign-out clears it
(`authSessionActions.logout`). Vehicles got the same cache.

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
- **Never touch a person's decision.** Every manual write (`setCost`, `setCostsBulk`) stores `source: null`, and the
  rule only matches expenses with no `PetCost` or a `source = 'category'` one — a manual row, including the tombstone,
  is never overwritten or released by the rule.
- **Removal tombstone.** Removing a cost (pet screen or the expense's "Not a pet cost") leaves a `kind = 'none'`,
  `source = null` row when a live pet's rule claims the expense's category, so the rule does not put it back; otherwise
  the row is deleted. `none` is never a rule kind (`parsePetCategoryRules` drops it), and the history, totals, the cost
  list and the per-expense lookup all filter `kind != 'none'`. Removing a tombstone again is a 404.
- Rule categories are validated server-side (account's or global, live, expense type) and stored as the resolved PK.
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

Rolling a care date forward after a vet expense; generalising
child/vehicle/pet into one tracked-entity layer; a deep link from the reminder push to the pet screen (the push carries
`petId`, but `useNotificationDeepLink` does not route it yet — the vehicle renewal push has the same gap).

## History

- ABA-828 — API: pets, cost history, bulk assign.
- ABA-831 — app screens, bulk assign from the transactions list, Analytics card, care-date reminders.
- ABA-833 — per-pet category rules (`Pet.categoryRules`, `PetCost.source`, `none` tombstone, daily catch-up cron), the
  expense screen's Pet section on phone and desktop, the Categories block in the pet form, and the subscribable,
  revalidating pet/vehicle list cache (the bulk bar's "Assign to pet" no longer stays hidden until a reload).
