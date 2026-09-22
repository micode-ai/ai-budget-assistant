# Client id resolution

*Hub: [offline-sync](../offline-sync.md) · category-specific story: [category-id-resolution](category-id-resolution.md)*

## What this is

The client creates rows locally and addresses them by its own generated id for the row's whole
life. The server stores that value as `clientId` and keeps its own primary key. Every endpoint that
takes an id from a client therefore has to resolve which of the two it was given — and every bug in
this family is an id used unresolved.

## Entry points

- Most services: an `OR: [{ id }, { clientId }]` lookup, often behind a private `resolve*Pk` helper
- `apps/api/src/modules/tags/tags.service.ts` — `resolveExpensePk` / `resolveIncomePk`, the model
- `apps/api/src/modules/expenses/expenses.service.ts` — `resolveExpensePk`
- `apps/api/src/modules/categories/categories.service.ts` — `create`'s duplicate handling

## Key concepts

**Two id spaces, one column.** A locally created row carries its device-generated id as `clientId`
on the server. Which value an endpoint receives depends on whether that row has ever been pulled
back, so both must resolve.

**Idempotent creates.** The mobile queue resends a create whose response was lost (retry,
double-tap, dropped connection) with the same `localId`. `expenses`, `incomes`, `projects` and
`tags` are idempotent by construction (`upsert` on their `clientId` unique); `budgets` and
`account-transfers` pre-check and catch `P2002`.

## Invariants

**Use the RESOLVED server PK in the write that follows, never the raw route param.** An endpoint
that resolves `OR:[{id},{clientId}]` for a parent and then reuses the raw `:id` for a child table
keyed by the parent's PK silently matches nothing. That is what broke expense line items —
`getItems`/`createItem`/`updateItem`/`removeItem` passed the raw id into `expense_items.expenseId`,
an FK to `expenses.id` — so items vanished on read, `createItem` would have thrown FK `P2003`, and
update/remove 404'd. The same class was open in four more modules (`InvestmentsService`,
`ProjectsService`, `DebtsService.recordRepayment`, `BudgetsService.findOne`). It also applies within
one method: `tags.service`'s `update`/`remove` called `findOne` to resolve the tag and then used the
raw param in the Prisma `where`.

**This class of bug is native-invisible.** `db/client.web.ts` is a no-op mock, so web has no local
fallback and the API is the only source — a wrong-key server read shows up as missing data on web
while native happily reads its local copy. **When a bug reproduces only on web, suspect an
id-resolution mismatch on the server before suspecting the web bundle.**

**Catch a concurrent-race `P2002` OUTSIDE the `$transaction`.** Postgres poisons a transaction on
the first constraint violation, so a catch-and-continue inside one crashes everything after it.

**A duplicate lookup must not filter `isDeleted`.** The unique covers soft-deleted rows too, so one
`findFirst` has to find both cases — then either return a **live** row untouched (copying the
incoming icon/colour over would silently restyle something the user customised) or revive the
soft-deleted one. Checking only `isDeleted: true` let a live duplicate fall through to `create()`
and throw P2002 as an unhandled **500**, reachable from the app, from AI `create_category` and from
all three bots.

**Default a `type` explicitly when non-controller callers exist.** `CategoriesService.create` is
called with bare objects that skip DTO validation, and an `undefined` type drops the filter from the
Prisma `where`, matching a same-named row of the *other* type.

**A create endpoint writing `clientId` under a `@@unique([accountId, clientId])` must be
idempotent** — pre-check `findUnique`, return the existing row, and catch the racing P2002. Without
it a retry 500s forever and the row can never leave the client's queue.

## Known gaps

- `CategoriesService` has no `clientId` column in older data, which is its own long story — see
  [category-id-resolution](category-id-resolution.md).

## History

ABA-167 (tag `clientId` reconciliation) · ABA-313 (P2002 outside the transaction) · ABA-316 and
ABA-392 (create idempotency, and the audit that found `categories` was the one real gap) · ABA-374
(child-table lookups) · ABA-419 (`tags.service` used the raw param after resolving) · ABA-454 (the
audit across investments, projects, debts, budgets) · ABA-473 (account transfers).
