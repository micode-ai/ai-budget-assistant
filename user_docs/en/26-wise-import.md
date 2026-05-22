# Wise Import

> Bring your full Wise transaction history into the app in one go. Upload a CSV statement and the app will create the matching expenses, incomes, and currency conversions for you.

## Overview

If you bank with Wise, **Wise Import** lets you pull a whole statement into your account in a single step. No more typing transactions one by one — just download a CSV from Wise, hand it to the app, and review what gets created before you confirm.

The import covers three kinds of records:

- **Expenses** — money that left your Wise balance (debits)
- **Incomes** — money that came in (credits)
- **Currency conversions** — when you swapped between balances inside Wise (e.g. USD → EUR)

Each imported transaction is tagged so the app knows it came from Wise — if you upload the same statement twice, the duplicates are detected and skipped automatically.

## Step 1 — Export a CSV from Wise

1. Open Wise (web app at **wise.com** or the Wise mobile app).
2. Go to **Transactions → Statements and Reports**.
3. Choose your **date range** (up to 469 days per file).
4. Choose **CSV** as the format and pick which currency / balance you want.
5. Download the file to your phone.

> **Tip:** Wise produces one CSV per currency. If you want to import multiple currencies, repeat the export for each one and import them one after another.

## Step 2 — Import in the app

1. Open the app and go to **Settings → Wise import**.
2. Tap **Pick CSV file** and choose the file you just downloaded.
3. The app parses the file (usually under a second) and shows you a preview.

## Step 3 — Review and confirm

The preview lists every transaction in the CSV with a checkbox.

- **Expenses** are shown with a red downward icon; **incomes** with a green upward icon; **currency conversions** with a swap icon and both sides of the exchange (e.g. `120.00 USD → 109.50 EUR`).
- A small **suggested category** chip appears next to common merchants (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix, etc.). If a category with the same name already exists in the active account, it is attached automatically.
- Rows you have already imported in a previous upload are **dimmed and marked "Already imported"** — you can't pick them again, which is what protects you from duplicates.
- Uncheck anything you don't want to import (e.g. personal transfers between your own accounts).

Once you're happy with the selection, tap **Import N rows**. The app writes everything to your account in a single transaction — either every selected row is created, or none of them are.

## What gets attached

| Field | Where it comes from |
|---|---|
| Date | `Date` column |
| Amount | `Amount` (absolute) + `Total fees` folded in |
| Currency | `Currency` column |
| Description | `Description`, falling back to `Merchant` or `Payment Reference` |
| Category | Suggested from merchant if recognized; otherwise none |
| Source | Marked as `import` so you can filter these in analytics |

## Currency conversions

When the same Wise transfer touches two currencies (e.g. you convert 100 USD into euros), Wise emits two rows — one debit in USD, one credit in EUR. The app recognizes these pairs by their shared `Payment Reference` and creates a single **Currency Exchange** record instead of two unrelated transactions. The exchange shows up under **Wallet → Exchanges** with the correct rate.

## Re-importing

Re-uploading the same CSV is safe. Every row carries its Wise `TransferWise ID`, and the app refuses to create a second record for an ID it has already imported. This means:

- You can re-export a longer date range and upload it — only the new rows are created.
- You can pause halfway through a preview and start over later — the rows you already committed are remembered.

## FAQ

- **Q: Does this work with other banks?**
  **A:** Right now only Wise CSV exports are supported. Other banks may use different column layouts. Open a feature request if you'd like another bank added.

- **Q: Can I import a PDF or XLSX statement?**
  **A:** Not yet. Export Wise statements in CSV format.

- **Q: Is the file uploaded anywhere I should worry about?**
  **A:** The CSV is sent to the AI Budget Assistant server, parsed in memory, and discarded as soon as the preview is generated. Only the structured rows you confirm are stored — not the original file.

- **Q: What happens to fees Wise charged me?**
  **A:** Wise reports fees in a separate `Total fees` column. The app folds the fee into the same expense so the total matches what actually left your balance.

- **Q: I imported the wrong rows — can I undo?**
  **A:** Yes. The imported rows are normal expenses/incomes — open each one and delete it as you would any other transaction. Once deleted, you can re-import the same row later.

- **Q: My CSV has no header row / a different format. What now?**
  **A:** Make sure you exported a statement from **Transactions → Statements and Reports → CSV**. The legacy "Activity Export" format is different and not supported.

- **Q: Will my categories from Wise carry over?**
  **A:** Wise's own categorization is partially used to suggest categories for common merchants. The app does not auto-create new categories — if no match is found, the row is imported without a category and you can categorize it later.

---

*See also: [Expenses and Income](./03-expenses-and-income.md) | [Wallet and Exchange](./10-wallet-and-exchange.md) | [Accounts](./09-accounts.md) | [Settings](./11-settings.md)*
