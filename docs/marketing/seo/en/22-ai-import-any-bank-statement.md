---
title: "What Happens When Your Bank Isn't on the List"
meta_description: "Your bank not on the supported list? See how AI Budget Assistant safely maps CSV columns or reads PDF statements so you can still import almost any bank."
target_keyword: "import bank statement from any bank"
slug: "ai-import-any-bank-statement"
pair: "ai-bank-import"
lang: "en"
date: "2026-08-20"
---

# What Happens When Your Bank Isn't on the List

You upload your file expecting the app to line up the columns automatically, and instead you get a mapping screen - or worse, an empty transaction list. Your bank just doesn't happen to be one of the ones the app recognizes on sight. It's a familiar letdown, especially the moment you finally decide to catch up months of spending in one import and the file from a smaller bank, a currency exchange service, or a local building society won't fall into place.

The good news: "not on the list" doesn't mean "can't be imported." This article walks through exactly what happens behind the scenes when AI Budget Assistant doesn't recognize a file's format, and why the fallback that kicks in is safer than it might sound at first.

## Why No Bank List Is Ever Complete

Any budgeting app that supports statement import has to decide up front which banks it will recognize directly. AI Budget Assistant automatically detects mBank, PKO, Revolut, ING, Millennium, and Pekao, plus Wise, and PDF statements from Erste and Alior. That covers most of the accounts people actually use in Poland, but bank accounts aren't limited to the big names. There are smaller banks, business accounts with a nonstandard export, foreign accounts, and exports from other finance apps that someone is trying to bring over while switching tools.

Maintaining a dedicated parser for every one of those formats forever isn't realistic, and any new format that shows up would still be "unsupported" for a while before anyone noticed and wrote a rule for it. So instead of waiting for the list to grow to match your bank, the app has a mechanism that tries to work out the structure of a file it has never seen before.

## What Happens When a File Isn't Recognized

When you upload a CSV or an XLSX spreadsheet and none of the built-in parsers recognize its layout, an AI model steps in. Its job is narrow and specific: it doesn't read amounts or dates itself. It only points out **which column is which** - which one holds the transaction date, which one the amount, which one the description or merchant name. Those column names are then checked, word for word, against the headers that actually exist in your file. If the model "invented" a column that isn't in the file, the whole response is rejected, not quietly accepted. Only after that check do the same, deterministic rules that handle manual column mapping actually read the numbers and dates out of the file.

For PDF statements, which is a Pro-tier feature, the mechanism works differently, because you can't just pull column names out of a PDF - the model has to extract the transaction rows themselves from the text that's been pulled off the page. It's the same kind of task hand-written parsers for Erste or Alior already do, except instead of writing dedicated code for each bank, the model handles a layout no one has described yet.

## What This Mechanism Never Does

This distinction matters, because it's easy to assume "AI imports the statement" means the model just guesses the numbers. It doesn't. On the CSV and XLSX side, the model never returns an amount or a date - it only returns column names, and those are always checked against the real headers in your file. The actual numbers and dates are read by the same predictable code that's handled manual column mapping for years. That makes the mechanism a helper for recognizing structure, not something eyeballing your spending.

It's still not a guarantee of perfect accuracy on the first try - no format-recognition mechanism is. That's why, before anything reaches your budget, you get a preview to check, covered below.

## What You See and Consent To Before Anything Leaves Your Phone

Before any part of the file reaches the AI model, the app asks for consent, once per account, and shows you exactly what will be sent. For a CSV or XLSX file, that's the header row plus up to ten sample data rows - not the whole file and not your full transaction history. For a PDF statement, it's the first twenty extracted lines of text. You see this on the consent screen before anything happens, so the decision is informed, not a default.

If your account has full end-to-end encryption (the app's full-privacy mode), this mechanism doesn't run at all. Data the app itself can't decrypt can't be sent to any AI model either, so those accounts only get manual column mapping - safer, though it takes one extra tap.

## You Review and Fix Before Anything Saves

After the model proposes a mapping, you don't see a raw result with no context. You see a row of editable "chips" showing what it recognized, something like "Date → Data operacji" or "Amount → Suma transakcji." If one of them is wrong, a "Wrong? Fix it" option opens the same manual column mapper, already pre-filled with the model's guess, so you're correcting one column instead of starting from scratch.

This is the same preview stage that comes with every import in AI Budget Assistant, whether the bank was recognized instantly or only with AI's help: a full list of transactions to review before anything reaches your budget, with categories already suggested automatically based on the merchant.

## The Second Time Is Faster

Once a column mapping for a given format turns out to be correct, its shape - the column names themselves and how dates are written, with none of your personal or transaction data - gets saved to a global dictionary of formats. The next person who uploads a statement from that same bank doesn't need the AI step at all; the format is already recognized on sight, the same as mBank or PKO. In a sense, you're the first user who "unlocks" your format for everyone who comes after you.

## How to Try It

If you have a file from a bank you gave up on importing before because the app didn't recognize it, it's worth trying again. Upload the CSV, XLSX, or PDF into [AI Budget Assistant](https://ai-budget.pl), and if none of the built-in parsers recognize it, you'll see the consent screen described above instead of an empty transaction list. After you accept, you get a preview with a suggested mapping to check, just like any other import.

The overall flow of importing a statement, from getting the file from your bank to avoiding duplicates on a re-import, is covered in our guide on [how to import a bank statement into a budget app](/blog/en/import-bank-statement/). If you'd rather skip files altogether and have the app log expenses straight from your bank's card notifications, see how [automatic expense tracking](/blog/en/automatic-expense-tracking/) works. The app is free to use in the browser at [ai-budget.pl](https://ai-budget.pl), no card required, and available for Android on [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## FAQ: Importing a statement from an unsupported bank

**What happens if my bank isn't supported directly?**

If you upload a CSV or XLSX that none of the built-in parsers recognize, AI Budget Assistant tries to work out on its own which column is the date, which is the amount, and which is the description, and shows you the result to review and fix. For PDF statements (a Pro feature), the mechanism extracts the transaction rows directly from the document's text. In both cases, you get a full preview before anything is saved.

**Can the AI get it wrong and enter the wrong amount?**

On the CSV and XLSX side, the AI model never reads amounts or dates itself - it only points out which column is which, and those names are checked against the real headers in your file, so an invented column is rejected. The numbers themselves are read by the same mechanism used for manual mapping. Either way, you get a preview of every transaction before anything saves, so you can check and fix anything that looks wrong.

**Is my statement's content sent anywhere?**

Before any part of the file reaches the AI model, you see a consent screen, once per account, that shows exactly what will be sent: the header row plus up to ten sample rows for a CSV or XLSX file, or the first twenty lines of text for a PDF statement. Accounts with full end-to-end encryption don't use this mechanism at all, because the app has no access to their data to send it to the model.

**Does AI-assisted import work as well as it does for mBank or PKO?**

It depends on the file format, but the mechanism is built to get better over time: once a column mapping for a new bank turns out correct, the file's shape (without your data) is saved to a global dictionary, so a future import of that same bank format no longer needs the AI step at all. It's still worth checking the preview before confirming an import, the same as with any other bank.

---

*Related articles: [How to import a bank statement into a budget app](/blog/en/import-bank-statement/) | [Automatic expense tracking: stop typing every purchase](/blog/en/automatic-expense-tracking/)*
