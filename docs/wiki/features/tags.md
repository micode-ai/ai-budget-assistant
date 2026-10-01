# Tags

*Hub: [api](../api.md) · id handling: [client-id-resolution](client-id-resolution.md) · related:
[expense-bulk-operations](expense-bulk-operations.md), [reference-data-screens](reference-data-screens.md)*

## What this is

Free-form, account-scoped labels on expenses and incomes, with a usage count for ordering. The
interesting part is identity: tags are created on the device, and for a long time the server never
learned the device's id for them, so no server-side tag link ever matched.

## Entry points

- `apps/api/src/modules/tags/tags.service.ts` — `create`, `findOne`, `update`, `remove`,
  `addToExpense` / `removeFromExpense` / `addToIncome` / `removeFromIncome`, `resolveExpensePk` /
  `resolveIncomePk`
- Schema: `Tag.clientId` (migration `20260530000000_add_tag_client_id`),
  `@@unique([accountId, name])`, `@@unique([accountId, clientId])`
- `apps/mobile/src/stores/tagStore.ts` — `createTag`, `syncFromServer`, `loadTags`
- Tests: `apps/api/src/modules/tags/tags.service.spec.ts`

## Key concepts

**The device's id is the tag's `clientId`.** `tagStore.createTag` sends `clientId = local id`.
`tags.service.create` is an `upsert` on `(accountId, name)` — re-creating a same-named tag returns
the existing row instead of throwing — and adopts the caller's `clientId` only when the row has
none yet. `findOne` and the four link/unlink
methods resolve the tag AND the expense/income by `OR: [{ id }, { clientId }]` and write the
resolved server PKs into the junction, adjusting `usageCount` as they go.

**The pull converges on the device's id.** `syncFromServer` upserts each server tag under
`clientId ?? id`, so a tag created on this device keeps its local id, and then drops legacy
`pending` local duplicates whose name already exists as a synced tag.

**The Expenses tab loads tags on mount** (`useExpensesScreenData` → `loadTags()`); without it the
bulk tag picker was empty.

## Invariants

**After resolving a tag by id-or-clientId, use `existing.id` in the write, never the raw param.**
`update()` and `remove()` once called `findOne(accountId, id)` and then put the raw — possibly
clientId — `id` into the Prisma `where`, so editing or deleting a tag before its first round-trip
hit the wrong key (ABA-419). The same rule holds for every `resolve*Pk` helper in the codebase.

**The idempotent create never overwrites an existing `clientId`.** The upsert's `update` branch is
empty; `create` writes the incoming `clientId` only onto a row that has none. Overwriting it let a
second device creating the same name take over the tag: the first device's id stopped resolving and
its references were orphaned until it pulled. The second device's own `pending` duplicate is dropped
by `tagStore.syncFromServer` on its next pull, since a synced tag of that name now exists (ABA-626).

## History

ABA-167 (clientId reconciliation, idempotent create, local tag links on bulk) · ABA-419
(`tags.service.spec.ts`, and the `update`/`remove` raw-param fix it caught).
