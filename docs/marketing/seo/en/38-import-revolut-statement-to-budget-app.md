---
title: "Import a Revolut Statement into a Budget App (CSV)"
meta_description: "How to import a Revolut CSV statement into a budget app: export from Revolut, preview, currency exchanges merged into one, and no duplicates on re-import."
target_keyword: "import revolut statement"
slug: "import-revolut-statement-to-budget-app"
pair: "import-revolut"
lang: "en"
date: "2026-10-07"
---

# Import a Revolut Statement into Your Budget in a Few Minutes

To import a Revolut statement, generate a CSV statement in the Revolut app, then in AI Budget Assistant open Settings → Import transactions → Revolut and pick the file. You get a preview with suggested categories, duplicates unticked and currency exchanges merged into one entry. The whole thing takes a few minutes.

Revolut is one of the easier banks to import: its CSV has a fixed column layout and carries the currency of every single row. Here is exactly what the app reads from the file and what to watch for.

## How do I export a statement from Revolut?

In the Revolut app, open your account statements (the section is called Statements in the English interface), choose the date range and the CSV format, then download the file to your phone or computer. Revolut renames buttons from time to time, so if the screen looks different, look for the option that generates a statement and lets you pick CSV.

A good habit: on the first run, download a longer period, say three to six months. Re-importing overlapping ranges is safe because the app recognises transactions it already has.

## How do I import the file, step by step?

1. **Download the CSV from Revolut** to the device where the app runs.
2. In AI Budget Assistant, go to **Settings → Import transactions**.
3. Choose **Revolut** from the list (or **Detect automatically (any bank)**, which recognises the Revolut layout from its headers).
4. Pick the file. The app shows a preview: each row as an expense, an income or a currency exchange, with a suggested category.
5. Untick rows you do not want, fix categories and tap **Import**.

In the preview you will see counters for what is selected and what is already imported. Rows the app already knows are unticked by default.

## What does the app read from a Revolut file?

| Item | How it is handled |
|---|---|
| Format | Comma-separated CSV, headers on the first row |
| Columns | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Date | From Started Date (the date only, no time) |
| Amount | Signed: negative is an expense, positive is an income |
| Currency | Per row, so a multi-currency account never mixes currencies |
| State | Only COMPLETED rows are imported; declined and pending ones are skipped |
| Currency exchange | Two EXCHANGE rows with the same date and opposite signs are merged into one currency exchange |
| Merchant | From Description, with a cleaned-up name for well-known chains |

## What happens to exchanges and multi-currency accounts?

A Revolut account often holds several currencies. When you swap zloty for euro, the file contains two rows: money out in one currency and money in another. Counted separately, they would create a fake expense and a fake income. So the app pairs them and stores one **currency exchange**, visible in the Wallet rather than in your spending.

Purchases in foreign currencies stay in their own currency. For how to read a budget when part of your life happens in euro, see our guide on budgeting in two currencies.

## How do I avoid duplicates, and what if something goes wrong?

The app protects you twice. First, every row gets a unique ID built from the date, amount and description, so importing the same file again adds nothing. Second, it compares date, amount and currency against the transactions already in your account, including manual ones, and unticks likely repeats.

Two identical purchases on the same day, such as two coffees at the same price, are kept as two separate transactions. If you do not like the result, the import history at the bottom of the screen lets you undo it with one tap within 30 days, and you can then import the same file again.

For the general mechanics, read [How to import a bank statement](/blog/en/import-bank-statement/). If your bank is not on the list, see [What to do when your bank is not on the list](/blog/en/ai-import-any-bank-statement/).

## Is it safe?

You never enter your Revolut login or password. You import a static file that you downloaded yourself, so the app only sees the transaction history in that file. You can try AI Budget Assistant for free at [ai-budget.pl](https://ai-budget.pl) or on [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: Importing a Revolut statement

**Which Revolut statement format do I need?**

CSV. It is the file with the columns Type, Started Date, Description, Amount, Currency, State and Balance, which Revolut generates in the statements section of your account. A PDF can only be read through AI reading, which is a Pro feature, so choose CSV for regular imports.

**Are declined or pending transactions imported?**

No. Only rows with the state COMPLETED are taken. A declined card payment will not reduce your balance in the budget, and a pending one appears in a later statement once it settles.

**Will a Revolut currency exchange count as an expense?**

No. Two exchange rows with the same date and opposite signs are merged into a single currency exchange in the Wallet. It inflates neither your spending nor your income.

**Can I import the same statement twice?**

You can, and nothing will be duplicated. Repeated rows are recognised and unticked in the preview as already imported.

**Can I undo a Revolut import?**

Yes. In the import history at the bottom of the import screen, tap the undo arrow next to the import. It works for 30 days, and afterwards you can import the same file again.
