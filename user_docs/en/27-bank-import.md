# Importing transactions from your bank

> Import transactions directly from CSV exports of major Polish banks or any bank using the universal column mapper.

## Supported banks

You can import transactions directly from CSV exports of major Polish banks: **mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA**. For any other bank, the universal column mapper lets you describe the format manually.

## How to import

1. Go to **Settings → Import transactions**
2. Pick your bank from the list (or "Other (custom CSV)" for unsupported banks)
3. Select the CSV file you exported from your bank's online banking
4. The app shows you a preview with every row marked as an expense, income, or currency exchange
5. Uncheck any rows you don't want, then tap **Import**

The app remembers which rows you've already imported by their date, amount, and description — uploading the same CSV twice won't create duplicates.

## Where to find the CSV in your bank

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Lista operacji → Pobierz → CSV
- **ING Bank Śląski**: Moje ING → Historia → Eksportuj → CSV
- **Bank Millennium**: Web → Historia rachunku → Eksport → CSV
- **Pekao SA**: Pekao24 → Historia → Eksport → CSV

## What's imported

Each row becomes either an Expense, an Income, or a Currency Exchange (when the app detects a paired FX transaction on the same date with different currencies). Categories are suggested automatically for popular merchants (Biedronka, Żabka, Orlen, Lidl, etc.) — you can change them later.

## "Other" — universal CSV mapper

If your bank isn't in the list, pick "Other (custom CSV)". The app shows a preview of your file and asks you to point at which column holds the date, amount, and description. You can save this mapping with a name, and the next CSV with the same column layout will be imported automatically.

## Encoding

The app auto-detects UTF-8 and Windows-1250 (the most common Polish bank encoding). If the preview shows garbled Polish characters, manually pick the encoding in the mapper.

---

*See also: [Wise Import](./26-wise-import.md) | [Expenses and Income](./03-expenses-and-income.md) | [Settings](./11-settings.md)*
