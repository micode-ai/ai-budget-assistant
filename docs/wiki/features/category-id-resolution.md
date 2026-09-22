# Category id resolution

*Hub: [offline-sync](../offline-sync.md) · [api](../api.md)*

## What this is

How a category id is resolved between the phone and the server, and why it keeps going wrong.
The client addresses a category by its own local id for the row's whole life; the server holds
a different primary key. Almost every category bug in this repo is one of the two sides using
an id the other cannot resolve.

This page exists because the same root cause has produced five separate user-visible bugs
(ABA-564, 565, 566, 567, 575), each of which looked like a different feature failing.

## Entry points

- `apps/api/src/modules/expenses/expense-category-resolver.util.ts` — `resolveExpenseCategoryId`,
  `resolveCategoryIdForUpdate`; the shared server-side resolver
- `apps/api/src/modules/categories/categories.service.ts` — `create` / `update` / `remove`
- `apps/api/src/modules/budgets/budgets.service.ts` — `resolveCategoryId` (same clientId fallback)
- `apps/mobile/src/stores/categoryStore.ts` — `loadCategories`, `syncFromServer`, `createCategory`
- `apps/mobile/src/db/categoryRepository.ts` — `mergeCategoryInto`, `getCategoryByNameExcludingId`,
  `countCategoryReferences`
- `apps/mobile/src/stores/categoryFilter.ts` — `UNCATEGORIZED_CATEGORY_FILTER`, `countsAsUncategorized`

## Key concepts

**Two id spaces.** A category created in the app gets a device-generated id locally
(`default-exp-*` for seeds, a UUID otherwise). `createCategory` posts it fire-and-forget and
**discards the response**, so before `clientId` support there was nothing linking the local row
to the server's primary key. `Category` has no `clientId` column in older data: every category
in production created before ABA-564 carries `client_id = NULL` on both sides.

**Expenses carry whichever id wrote them.** A bank import is a server-side write, so its
expenses carry the server's category id from birth. An expense categorized in the app carries
the local id until a pull overwrites it — `expenseSync.ts`'s merge writes
`categoryId: serverCategoryId || localExpense?.categoryId`, so the server's value wins whenever
it has one.

**Convergence.** `syncFromServer` repairs a diverged device two ways: `upsertCategory` inserts
the server's row under its server id (so an imported expense's id resolves again), and the
`!cat.clientId` branch finds the stale device-id twin by `(name, type)` — the only thing both
sides still share — and calls `mergeCategoryInto`, which re-points expenses, incomes, budget
allocations and category splits, then deletes the twin. Re-pointed rows are marked `pending` on
purpose: that push is the only thing that repairs already-broken server rows, because only the
device knows which category they belong to.

**The label is ambiguous.** `ExpenseDetailsCard` renders `common.uncategorized` both for a row
with no category and for a `categoryId` it cannot resolve. That ambiguity is what turned a
silent id divergence into a visible, reported bug.

## Invariants

**An unresolvable id must never be written as `null`.** `resolveExpenseCategoryId` used to
return `null` both for "the caller cleared it" and for "I could not resolve this", and the
update paths passed that into `data.categoryId` — so Prisma **erased** the category the row
already had. On one production account that stripped the category from 31 imported expenses
(7 182,13 zł, >60% of the month). Use `resolveCategoryIdForUpdate` on any PATCH path: it returns
the id, `null` only for an explicit clear, or `undefined` meaning leave the stored value alone.
A categorisation that fails to arrive can be retried; one that is erased cannot. `ExpenseBulkService`
omits the field for the same reason rather than writing `null` across up to 500 rows.

**Resolve the value as a `clientId` before giving up.** The mobile sends its own local id as
`clientId` on create, so the resolver falls back to matching it that way. `BudgetsService.resolveCategoryId`
needs the same fallback — without it an allocation is silently dropped and a category budget
quietly becomes one that counts everything.

**A 404 from a category route is not proof the server lacks that category.** It is equally the
signature of a diverged id. `deleteCategory` swallowed the 404 and deleted locally regardless,
so the server's "category still has expenses" 409 never ran and a category with a year of
spending behind it could go with one accidental tap — and the server's row stayed alive, so the
next pull handed it straight back. Look for the server's twin by name+type and delete THAT; only
a genuine no-twin answer falls back to a local-only delete.

**The delete guard runs locally first.** `countCategoryReferences` mirrors the server's five
checks against SQLite and raises the same `{status: 409, details}` shape, so one message covers
both paths and the rule holds offline and for a never-synced category. Consequences: a stale
local copy can refuse a delete the server would allow (deliberate — the action is irreversible),
and on web all five counts are 0 because there is no local SQLite.

**`CategoriesService.update` must probe before writing.** `@@unique([accountId, name, type])`
covers both columns the DTO can change, so a rename or a type switch onto another category
escapes as an unhandled P2002 — a 500 on a path the UI offers with no duplicate-name validation.
The probe excludes the row being edited (a colour-only save re-sends `name` unchanged and would
conflict with itself) and is skipped for system categories, whose `accountId: null` cannot trip
the unique at all since Postgres treats NULLs in a unique as distinct.

**`loadCategories` pulls the server list once per account per session, not only when the local
table is empty.** That gate was `if (categories.length === 0)` — true exactly once in a device's
life — so on an already-diverged device the convergence code above could never run. The
`_seededAccounts` fast path is what bounds the pull to one request; a failure leaves the local
rows untouched, so an offline launch is unchanged.

**If the UI calls a row uncategorized, the uncategorized filter must find it.**
`countsAsUncategorized` matches an empty id OR one that resolves to nothing — but only once the
category store is `isInitialized` AND holds a non-empty list. Without both guards a mid-load
render, or the ABA-519 empty-list shape on web, would report a fully categorized ledger as
entirely uncategorized. A test mock for `useCategoryStore` must expose `isInitialized` and
`categories`, not just `getCategoryById`.

## Known gaps

- `ExpenseDetailsCard` still renders one string for "no category" and "cannot resolve this
  category". The filter now agrees with it, but the two states remain indistinguishable to the user.
- No backfill. A device converges only once it runs a session on a build carrying the ABA-575 fix.
- When a live server category shares a name with an app default, the merge deletes the local
  `default-*` row and the seeding loop immediately recreates it — a per-session delete/recreate
  with no data change. The duplicate itself predates the fix; a fresh install already ends with
  both rows.
- The divergence is invisible from the API. A server-side check for orphaned `category_id`
  references comes back clean while the device is broken, so a clean server query is not evidence
  that a reported category bug is not happening.

## History

- **ABA-560 / ABA-564** — offline-first categories with `clientId`; `mergeCategoryInto` +
  `getCategoryByNameExcludingId` convergence.
- **ABA-565** — `CategoriesService.update` probe, 409 instead of an unhandled P2002.
- **ABA-566** — an unresolvable id must not be written as `null`; `resolveCategoryIdForUpdate`.
- **ABA-567** — the delete guard: a 404 is not proof; local `countCategoryReferences`;
  the without-category filter extended to the income tab.
- **ABA-575** — the convergence was unreachable on a populated device; the uncategorized filter
  and the uncategorized label made to agree. Reported with a screen recording: every imported
  expense read "Bez kategorii" while the filter named after that label returned nothing.
