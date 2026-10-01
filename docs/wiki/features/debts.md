# Debts and loans

*Hub: [mobile-app](../mobile-app.md) · [api](../api.md) · related:
[debt-reminders](debt-reminders.md), [chat-undo-last-action](chat-undo-last-action.md)*

## What this is

Tracks money the user lent to someone or borrowed from someone, with repayments and an optional
due date. A debt is not its own table: it is an expense (lent) or an income (borrowed) flagged
`isDebt`, so it moves the wallet balance like any other transaction. The due-date pushes are on
[debt-reminders](debt-reminders.md).

## Entry points

- `apps/api/src/modules/debts/debts.service.ts` — list and summary
- AI chat: `create_debt`, `record_debt_repayment`, `get_debt_summary` (the AI functions list in
  `CLAUDE.md`), handlers in `ai-debt-goal-tools.service.ts`
- Mobile: `app/debts/index.tsx`, `src/components/debts/`, `src/features/debts/debtDisplay.ts`,
  `src/stores/debtStore.ts`; the toggles in `DebtExpenseFields.tsx` / `IncomeCreateForm.tsx`
- User docs: `user_docs/<lang>/17-debts-and-loans.md`

## Key concepts

**Lent = expense, borrowed = income.** A repayment is the opposite kind of transaction linked to
the original (repaying a lent debt is an income; repaying a borrowed one is an expense). Status is
derived: active while a balance remains, paid at zero, overdue past the due date.

**The other party is a name, not a user.** The contact is free text with no account behind it, so
nothing in the product ever reaches them.

## Invariants

- **User-facing copy uses the app's own labels.** The Polish help once documented buttons that do
  not exist ("Zarejestruj spłatę", "Przeterminowany" — the app says `Zapisz spłatę`, `Zaległy`) and
  had lost its diacritics (ABA-628). Check `debt.*` in the locale files before writing about it.

## History

ABA-424 (debts screen decomposition) · ABA-628 (Polish help rewrite; page created).
