# Importing transactions from your bank

> Import transactions from a CSV or PDF statement of your bank, or from any bank using the universal column mapper.

## Supported banks

- **mBank** — CSV export
- **PKO BP** — CSV export
- **Erste Bank** — PDF statement
- **Alior Bank** — PDF statement
- **Wise** — CSV export (see [Wise Import](./26-wise-import.md))
- **Other** — any bank, via the universal column mapper (CSV)

More banks are added over time. If yours isn't listed yet, use **Other** and map the columns yourself.

## How to import

1. Go to **Settings → Import transactions**
2. Pick your bank from the list (or **Other (custom CSV)** if it isn't listed)
3. Select the file you exported from your bank — a **CSV** for mBank/PKO, a **PDF** statement for Erste/Alior
4. The app shows a preview with every row marked as an expense, income, or currency exchange
5. Uncheck any rows you don't want, then tap **Import**

The app remembers which rows you've already imported by their date, amount, and description — uploading the same file twice won't create duplicates.

## Where to find the file in your bank

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)

## What's imported

Each row becomes an Expense, an Income, or a Currency Exchange (when the app detects a paired FX transaction on the same date in different currencies). Categories are suggested automatically for popular merchants (Biedronka, Żabka, Orlen, Lidl, Rossmann, etc.) — you can change them later.

## "Other" — universal CSV mapper

If your bank isn't in the list, pick **Other (custom CSV)**. The app shows a preview of your file and asks you to point at which column holds the date, amount, and description. You can save this mapping with a name, and the next CSV with the same column layout is imported automatically.

## Encoding

For CSV files the app auto-detects UTF-8 and Windows-1250 (the most common Polish bank encoding). If the preview shows garbled Polish characters, pick the encoding manually in the mapper. PDF statements are read directly — no encoding choice needed.

---

*See also: [Wise Import](./26-wise-import.md) | [Expenses and Income](./03-expenses-and-income.md) | [Settings](./11-settings.md)*
