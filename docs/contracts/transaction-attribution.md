# Module Contract: Transaction Attribution

Feature: show who created an expense/income in shared accounts.

## Data contract

### Expense / Income API response (shared-types `Expense` and `Income`)

New optional field added to both interfaces:

```ts
createdByUserName?: string | null;
```

- Populated by the API via `User.name` joined on `userId`.
- `null` when the creating user no longer exists (cascaded delete).
- `undefined` is never returned by the API — the field is always present.

### API endpoints affected

All expense and income endpoints that return expense/income objects now include `createdByUserName`:

| Method | Path | Change |
|--------|------|--------|
| GET | `/expenses` | `createdByUserName` added to each item |
| GET | `/expenses/:id` | `createdByUserName` added |
| POST | `/expenses` | `createdByUserName` added in response |
| PUT | `/expenses/:id` | `createdByUserName` added in response |
| GET | `/incomes` | `createdByUserName` added to each item |
| GET | `/incomes/:id` | `createdByUserName` added |
| POST | `/incomes` | `createdByUserName` added in response |
| PUT | `/incomes/:id` | `createdByUserName` added in response |

No new endpoints. No request body changes.

## Service contract

### `ExpensesService` (apps/api/src/modules/expenses/expenses.service.ts)

New private helper:
```ts
private toExpenseResponse(expense: any & { user?: { name: string } | null }) {
  const { user, ...rest } = expense;
  return { ...rest, createdByUserName: user?.name ?? null };
}
```

Applied in: `findAll` (map over array), `findOne`, `create` inner query result, `update` inner query result, `setSplits` inner query result.

### `IncomesService` (apps/api/src/modules/incomes/incomes.service.ts)

Same pattern — `toIncomeResponse` helper applied in findAll, findOne, create, update.

## Mobile display contract

### `app/expense/[id].tsx`
- If `expense.createdByUserName` is truthy: render a row with label `t('common.addedBy', { name: expense.createdByUserName })` below the date row.
- Style: `fontSize: 13`, `color: theme.textSecondary`, subtle.

### `app/income/[id].tsx`
- Same as expense detail.

## i18n contract

Key added to all 8 locale files under `common`:

```ts
addedBy: 'Added by {{name}}'   // en
addedBy: 'Hinzugefügt von {{name}}'  // de
addedBy: 'Agregado por {{name}}'  // es
addedBy: 'Ajouté par {{name}}'  // fr
addedBy: 'Dodane przez {{name}}'  // pl
addedBy: 'Добавил(а) {{name}}'   // ru
addedBy: 'Додав(ла) {{name}}'    // ua
addedBy: 'Дадаў(ла) {{name}}'    // be
```
