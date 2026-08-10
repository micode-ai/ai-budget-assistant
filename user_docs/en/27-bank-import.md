# Importing transactions from your bank

> Import transactions from a CSV, XLSX or PDF statement of your bank. Supports mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise, and any other bank via the universal column mapper.

## Supported banks

- **mBank** — CSV export
- **PKO BP** — CSV export
- **Erste Bank** — PDF statement
- **Alior Bank** — PDF statement
- **Revolut** — CSV export
- **Wise** — CSV export (multi-currency, FX conversions detected automatically)
- **Other** — any bank, via the universal column mapper (CSV)
- **Spreadsheets** — XLSX statements work too; the app reads the first sheet

More banks are added over time. If yours isn't listed yet, use **Other** and map the columns yourself.

## How to import

1. Go to **Settings → Import transactions**
2. Pick your bank from the list (or **Other (custom CSV)** if it isn't listed)
3. Select the file you exported from your bank
4. The app shows a preview — each row is marked as an expense, income, or currency exchange
5. Uncheck any rows you don't want, then tap **Import**

The app skips rows that already exist in your account by matching on date, amount, and currency — importing the same file twice won't create duplicates. Matched rows are unchecked by default; re-check one if it's genuinely a separate transaction.

## Where to find your bank's export

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)
- **Revolut**: Revolut app → Statements → choose date range → CSV → Download
- **Wise**: wise.com → Transactions → Statements and Reports → choose date range → CSV → choose currency/balance → Download

> **Wise tip:** Wise generates one CSV per currency balance. Import each currency separately. Up to 469 days per export.

## Wise — currency conversions and fees

When you convert currencies inside Wise (e.g. 100 USD → EUR), Wise creates two rows. The app detects these pairs automatically and creates a single **Currency Exchange** record (visible under Wallet → Exchanges) instead of two unrelated transactions.

Wise also reports fees in a separate `Total fees` column — the app folds the fee into the expense amount so the total matches what actually left your balance.

## What's imported

Each row becomes an Expense, an Income, or a Currency Exchange. Categories are suggested automatically for popular merchants — you can change them later. Every imported row is tagged with its source bank and a unique ID so re-importing the same file is always safe.

**Tidier merchant names.** Well-known store chains are recognised automatically, so a statement line like `BIEDRONKA 1234 WARSZAWA` is saved simply as **Biedronka**. This keeps one shop as a single merchant in your analytics instead of dozens of separate store entries.

## "Other" — universal CSV mapper

If your bank isn't in the list, pick **Other (custom CSV)**. The app shows a preview of your file and asks you to point at which column holds the date, amount, and description. Save this mapping with a name and the next CSV with the same column layout is imported automatically.

## When nothing recognises your statement

If none of the banks above fit and the file isn't a simple column layout the app can guess on its own, it can ask an AI model to work out the columns for you — which one is the date, which is the amount, and so on.

**Before anything is sent, you're asked once.** The first time this happens for an account, you'll see a screen explaining what leaves your device: for a CSV or spreadsheet, only the header row plus up to 10 sample rows — never the whole file. For a PDF statement, it's the first 20 lines of extracted text. You decide once per account; after that, the app remembers your choice.

- **Accept**, and the file is re-read with the columns the model worked out.
- **Decline**, and you go straight to the manual mapper described above. Declining happens before anything is analysed, so there's nothing to pre-fill yet — you map the columns the same way as for any other unsupported bank.

**The result is shown, not assumed.** When the AI matching succeeds, the preview shows a row of chips above your transactions — something like `Date → Data operacji`, `Amount → Kwota` — along with its guess at which bank this is. This is a best guess, not a certainty: tap the row any time to open the mapper and correct a column it got wrong.

**A few things are flagged for you to check, not silently assumed:**
- If the file has no currency column at all, every row is read in your own account currency, and a notice tells you so — tap it to change the currency before importing, and the change applies to the whole file.
- Reading numbers out of a PDF is harder to double-check than a CSV, so the app tries to confirm that what it found adds up to the statement's closing balance. When it can't confirm that, you'll see a notice asking you to review the list. This isn't an error — it's simply the normal case whenever a statement doesn't print a running balance to check against, or when the check doesn't line up.

**PDF statements need a Pro plan.** Reading a PDF with AI takes more processing than a CSV, so it's a Pro feature — a free account sees an upgrade screen there instead of a failure message.

Banks already listed above (mBank, PKO BP, Erste, Alior, Revolut, Wise) are unaffected by any of this — they import exactly as described earlier on this page.

## Past imports & Undo

The **Past imports** section at the bottom of **Settings → Import transactions** shows the last 20 imports — source, date, and row count.

To undo a recent import, tap the **undo arrow** (↩) on the right. All transactions from that import are removed and the dedup lock is cleared so you can re-import the same file cleanly.

- Undo is available within **30 days** of the original import.
- Imports older than 30 days don't show the undo button.

## Don't see your bank?

At the bottom of **Settings → Import transactions** there's a **"Don't see your bank?"** card. Tap it, enter the bank name, and attach an example statement. Your request goes straight to our team.

## Encoding

For CSV files the app auto-detects UTF-8 and Windows-1250 (common for Polish bank exports). PDF statements are read directly — no encoding choice needed.

---

*See also: [Expenses & Income](./03-expenses-and-income.md) | [Wallet & Exchange](./10-wallet-and-exchange.md) | [Settings](./11-settings.md)*
