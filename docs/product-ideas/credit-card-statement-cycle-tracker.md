---
id: credit-card-statement-cycle-tracker
title: 'Credit card statement cycle: spend so far, statement day and payment due date'
status: building
priority: P2
created_at: 2026-11-26
jira_ticket:
orchestration_run: b75b4874-9012-4460-bb41-188c16ef5770
---

# Credit card statement cycle: spend so far, statement day and payment due date

## User story
As a credit card user, I want to see how much I have put on the card in the current billing cycle and be reminded before the payment is due, so that I never pay interest by accident or get surprised by the statement.

## Value hypothesis
Calendar-month totals do not match how a card bills: a purchase on the 28th lands on next month's statement. Users who pay a card in full each month want one number, "what will this statement be", and one reminder. Debts cover loans between people and Safe-to-Spend counts card spending as already gone, but nothing models the card's own cycle.

## Sketch
- Mark a wallet account as a card and set its statement day and payment due day, plus an optional credit limit.
- The wallet card shows "This cycle: 1 840 zł, statement on the 12th, due on the 27th" and, with a limit, a thin utilisation bar.
- A push 3 days before the due date with the expected statement amount; the payment itself is logged as an account transfer from the paying account, which already exists.
- Safe-to-Spend can subtract the unpaid statement from available money, behind a switch.

## Open questions
- Does the current wallet model have an account-level type that can carry this, or is it a new field on the wallet balance row (and so a migration plus the SQLite mirror)?
- Different banks use different cut-off rules (posting date vs. transaction date). Use the transaction date and say so.
- Interest and minimum-payment advice are out of scope here, because the data to compute them honestly is not there.

## Cost estimate
About 1.5 to 2 weeks: a migration, cycle maths shared in a util (mirrored per the repo's duplicated-pair rule), a wallet card section, one push.
