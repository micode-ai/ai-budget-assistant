# Release Notes — AI Budget Assistant

Consolidated notes for every release, newest first. The version is `versionName` in
`apps/mobile/android/app/build.gradle` (source of truth for Google Play) and `version`
in `apps/mobile/app.json`. Russian translation: [`CHANGELOG.ru.md`](./CHANGELOG.ru.md).
Detailed per-feature notes for individual dates live alongside in `docs/release-notes/`
(e.g. `2026-04-16.md`).

---

## 1.23.0 - 2026-09-03

**Fixing what the receipt scanner got wrong**

- **Scanned lines are editable before you save.** Correct a price the scanner
  misread, rename a line, delete one it invented, or add one it missed — every
  line is now shown (no more "+N more items" cut-off), each row opens in place,
  and the category split is recalculated from your corrections. Until now the
  only way to fix a wrong line was to save the expense and re-enter it by hand
  (ABA-481).
- **The same corrections work in the bots.** In Telegram, WhatsApp and Slack tap
  **Items** and send corrections as text, one per message — the price of a line,
  a rename, a deletion, a new line, or the receipt total. Before this, a
  bot-scanned receipt saved whatever the model read and only the date could be
  changed (ABA-482).
- **Scanning a stack of receipts.** A counter shows how many you have scanned in
  this session, with a brief note every fifteen. It never blocks anything
  (ABA-480).

**Currency rate alerts**

- **"Tell me when EUR/PLN hits 4.35".** Set a target for a currency pair on the
  Exchange screen and get a notification when the live rate reaches it. The rate
  is checked hourly on the server, so it works with the app closed; each alert
  fires once and then stops, you can keep up to twenty, and they are personal to
  you — nobody else in a shared account sees them (ABA-474). Triggered alerts are
  cleaned out of the history automatically (ABA-476).

**Transfers between accounts**

- **Correcting which account the money went to now works.** Opening a transfer
  from the receiving account and pointing it somewhere else used to be refused by
  the server, and the app said nothing — the edit looked saved and then quietly
  reverted on the next refresh, with the money never arriving. It now applies,
  and the linked income moves with it (ABA-472).
- **Shared accounts see each other's transfers.** A transfer touching a shared
  account is now listed for every member, whoever recorded it — the account's
  balance always counted it, so the list and the balance no longer disagree. Any
  member who could have made the transfer can also correct or delete it (ABA-473).
- **Recording, editing and deleting a transfer works offline** and is sent when
  you are back online. A change the server refuses is reported instead of being
  silently rolled back on the next refresh (ABA-473).

**Under the hood**

Work with no visible change, listed for completeness: documentation for the rate
alerts plus corrections to the account-transfer API reference (ABA-475), three
oversized screens split into focused modules — the new-expense form (ABA-477),
the products screen (ABA-478) and the transfer-detail screen (ABA-479) — and two
new articles on the marketing site.

---

## 1.22.0 - 2026-09-01

**Splitting a bill with the people standing next to you**

- **One QR code instead of five separate links.** Split a receipt and the app now
  shows a single QR code everyone at the table can scan. Each person picks their
  own name from a list, confirms it is them, and lands on their own share with
  the payment link already there — no messaging anyone, no copying links one at a
  time. The QR shows names only, never an amount or who has paid, and sending
  individual links still works for anyone who is not in the room (ABA-471).

**Finding what the app already does**

- **A one-time note about a feature you probably have not found.** The app has
  quietly gained a lot — Safe-to-Spend, the Inflation Shield, your personal
  inflation index, Financial Wrapped, the receipt price check — and nothing ever
  told you. You will now see a single dismissible card about one of them: one at
  a time, never a digest of everything you missed, and never before you have
  added your first transaction. The full list is in Settings whenever you want to
  browse it (ABA-470).

**Under the hood**

Work with no visible change, listed for completeness: the currency-conversion
helper that had been copied into five separate services is now one (ABA-466), and
four oversized files were split into focused modules — the sign-in store
(ABA-467), the sync service (ABA-468), the transfer screen (ABA-469) and the
home-screen widget switch.

---

## 1.21.0 - 2026-08-31

**A new phone signs you in by itself**

- **Move to a new Android phone and the app is already signed in.** Set the new
  device up from a backup of the old one and the app restores your session on
  first launch, with nothing to type. It works on Android only, only for a
  device genuinely restored from a backup rather than set up fresh, and if you
  use end-to-end encryption you still enter your passphrase — that protects
  your data, and signing in does not unlock it (ABA-464, ABA-465).

**Scanning and receipts**

- **Scanning a receipt uses a fraction of the memory it used to.** The app was
  sending the camera's full-resolution photo, several megabytes of it, and
  holding two more copies in memory while it did — enough to make the whole app
  sluggish on a modest phone mid-scan. It now shrinks the photo first, which
  also makes the scan start faster (ABA-463).
- **Bacon is no longer filed under "deposit".** Once a receipt had taught the
  app a bottle-deposit category, that category was offered for ordinary
  groceries too, and the app then learned the mistake and repeated it on every
  later receipt from the same shop (ABA-451).

**Things that were only working on your phone**

- **Investments, projects, debts and budgets now load on the web app.** They
  were addressed by the wrong identifier, so the server quietly found nothing.
  Your phone hid the problem by answering from its own copy; the web app, which
  has no local copy, showed you an empty screen (ABA-454).
- **A chat-bot conversation survives a server restart.** A half-finished
  confirmation in the Telegram bot — a receipt waiting to be saved, a date
  being edited — was being held in memory and thrown away on every deploy
  (ABA-460).

**Under the hood**

Work with no visible change, listed for completeness: the admin gained an
acquisition dashboard for signup attribution (ABA-452); the daily reminder jobs
now page through their tables instead of loading them whole (ABA-457); the
Telegram bot's handlers are registered properly with the framework (ABA-453);
duplicated logic was merged in three places (ABA-455, ABA-456, ABA-462); a
duplicated geocoding service that silently split its own rate limit was made
one (ABA-458); background failures are now logged instead of swallowed
(ABA-461); and the cost of a corrective receipt re-read is tracked as its own
line (ABA-459).

---

## 1.20.0 - 2026-08-28

**Receipts that add up**

- **The category split on a scanned receipt now actually appears.** It was refusing far more often than it should have, for four separate reasons, all of them fixed: a bottle-and-can deposit printed below the goods total was never accounted for; a discount the receipt's line prices had *already* had taken off was subtracted a second time (on one receipt the app had read the VAT line as a discount); the learned product rules were keyed on a name the model reinvents on every scan, so the same shop taught contradictory rules and never got cheaper; and a single bad reading of the line column killed the whole split (ABA-440, ABA-441, ABA-442, ABA-449).
- **Bottle and can deposits get their own category.** Polish `kaucja` is printed in its own block below the goods total and is never a line item, yet you pay it — on one receipt 4.50 of deposits was 1.9% of the total. It is now tracked separately, named in the account owner's language, and the figure is saved even when the rest of the receipt does not reconcile (ABA-440, ABA-444).
- **A receipt that does not add up is read a second time.** Extraction is not reproducible: the same receipt, the same request, three different answers. When the arithmetic says a reading is wrong, the app asks once more and keeps whichever reading matches the receipt's own printed totals — so a scan can only be rescued, never made worse (ABA-442).
- **The assistant can answer about a category that only exists inside a split.** Ask what you spent on alcohol and it now counts the alcohol line of a supermarket receipt, instead of answering "nothing" while the Analytics tab shows a figure (ABA-446).
- Category splits show up on the web app and on a freshly reinstalled phone, not only on the device that scanned the receipt (ABA-445).

**Buttons you can see**

- **The actions in the top bar were invisible.** Orange icons were being drawn on the orange header — a contrast ratio of 1.0:1. This affected nine actions across eight screens: add a goal, edit or delete a project, delete a goal, exchange and transfer history, the shopping-list map, and "mark all read" in alerts. On the shopping list it hid a button that deletes every ticked item (ABA-450).
- **The shopping list's bottom bar no longer overlaps itself.** In Polish the "compare prices" icon spilled across the neighbouring button's border and its label wrapped onto two lines. The bar now moves the compare and map buttons onto their own row when the language needs the space (ABA-450).
- The shopping list's screen title is no longer cut to `Lista zaku...`, and the list name is no longer printed twice (ABA-450).

---

## 1.19.0 - 2026-08-27

**1.18.0 never reached the stores.** Its submit was rejected by Google Play over a
foreground-service declaration, so if you are updating from 1.17.x this release
carries 1.18.0's work as well - automatic receipt category splits, one-tap import
from other budgeting apps, and the first-run start screen. The store-arrival card
and shopping mode announced in 1.18.0's notes are **held back** and are not part of
this release (ABA-438).

**Reports work the way the dates say they do**

- **The period you pick is the period you get.** Every boundary was built through UTC, so on our timezone "this month" started on the last day of the previous one and "this year" on 31 December. "Last quarter" meant roughly three and a half months rather than a quarter. Both are fixed, and the resolved range is now printed under the chips so a label can never quietly disagree with the file (ABA-409).
- **Pick a specific month or an arbitrary range.** A 24-month picker sits beside the presets, plus a free date pair (ABA-409).
- **Exporting from Analytics keeps the period you were looking at.** Paging back to June and exporting used to produce the current month (ABA-411).
- **Report export works on the web app.** It threw an error and produced nothing - which also meant backup creation was broken on the web by the same line. Generate now saves the file rather than opening a "Share with..." sheet; sharing stays on the report's own row (ABA-412).
- **The PDF stopped overlapping itself and blending currencies.** A long merchant name printed its second line on top of the next row. Amounts in different currencies were added together as if they were the same money; every figure is now converted to your display currency, with transaction rows keeping their own currency and a note saying so (ABA-413).
- Reports in all three formats, and backup export and restore, are free. Only scheduled e-mail delivery is paid - the in-app monthly digest is not.

**Money you hold, shown**

- **The wallet shows every currency your account actually holds.** It used to show only currencies someone had explicitly set a starting balance for, so an account with real income in a second currency simply did not display it. A currency you have hidden stays hidden (ABA-431).
- **An income's currency can be corrected.** The amount is relabelled, never converted - the same rule expenses already followed (ABA-428).

**Fixes**

- Renaming or deleting a tag you had just created, before it had synced, updated the wrong row or nothing at all (ABA-419).
- Budget and category changes queued for sync were silently reported as saved while being discarded. They now fail loudly instead (ABA-423).

**Admin**

- **Tiers granted by hand no longer count as revenue.** Every MRR figure counted admin-granted Pro and Business subscriptions as paying customers, reporting revenue that does not exist. Grants are now identified and excluded everywhere, they are labelled in the users table, and both legacy calculations were corrected while fixing it - a stale hardcoded Pro price and an ignored yearly interval (ABA-433).

---

## 1.18.0 - 2026-08-14

**A scanned receipt no longer lands as one lump**

- **A supermarket trip is split across categories automatically.** A 240 zl shop used to arrive as a single "Groceries" expense. Now the lines of the receipt itself are read and the amount is divided the way you actually spent it - 180 groceries, 35 household, 25 alcohol. The split shows on the scan screen before you save, and tapping any line lets you move it to a different category (ABA-398).
- **It learns as you correct it.** Every line you reassign teaches your account, so the same product on your next receipt is sorted without asking anyone. That is also why it costs nothing to run once you have shopped a few times.
- **If your categories don't fit, it says so and offers new ones.** A receipt full of whisky, tulips and shower gel has nowhere to go in an account that only has "Food & Dining" - so alongside the split you now get up to three suggested new categories, named in your language. Nothing is created until you press Save; a scan you abandon leaves your categories exactly as it found them (ABA-402).
- **When the lines don't add up to the total, no split is made.** Refusing is the honest answer - spreading an unexplained difference across your categories would be worse than leaving the receipt whole.
- Category spending in Analytics counts these splits, including the three-month average it compares against, so a split month isn't measured against unsplit history. Budgets deliberately keep reading the expense's own single category, exactly as they already do for splits you make by hand.
- The Telegram, WhatsApp and Slack bots report the split in their reply to a scanned photo.

**Moving in from another budgeting app**

- **Exports from Monefy, Wallet by BudgetBakers and Money Manager (1Money) import in one tap.** Settings -> Import transactions -> "Moving from another app?". These files could already be read, but now each format is understood properly: no guessing, and the categories you built up in your old app come across as your categories here rather than being re-derived from shop names (ABA-401).
- Categories from the export are created for you, and a name that differs only in capitalisation won't produce a duplicate.

**A first screen instead of an empty dashboard**

- **A new account now opens on "Where would you like to start?"** - scan a receipt, say it out loud, type it in, or import a statement - instead of a dashboard with nothing on it. It appears once, and never for an account that already has transactions (ABA-403).

**Knowing where you are**

- **A card appears on your home screen when you're in a shop you've bought from before**, listing what's still unticked on your shopping list and what you can safely spend today. It needs "Attach location to new expenses" turned on in Settings -> Data, and it recognises a shop from your own scanned receipts - two visits are enough (ABA-404).
- **Shopping mode tells you even with the app closed.** Press "I'm going shopping" on your shopping list and you'll get a notification when you reach a known shop, and one more on the way out if something is still unticked - then it switches itself off. Android only. It runs only while you have switched it on, and shows a notification for the whole time it does (ABA-408).
- Your shops are learned only from receipts you scanned, bank notifications and bot photos - never from expenses you typed or dictated, whose location is wherever you happened to be sitting.

**Fixes**

- Creating a category that already existed returned an error instead of simply using the one you had. It could be hit from the app, from AI chat and from all three bots (ABA-392).
- On the web app, choosing a PDF receipt could hide the file you wanted in the picker.

---

## 1.17.2 — 2026-08-10

**Fixes**
- **Fixed: choosing a file left the import screen looking dead.** Reading a statement we don't recognise takes a while — around half a minute the first time, because the format has to be worked out and then checked against what you already have. Nothing on screen said so, so the obvious conclusion was that the tap hadn't registered. The bank list is now replaced by "Reading your statement…" while it works, which also stops a second tap starting a second read.
- **Fixed: undoing an import made the same file un-importable.** Rows from an undone import were still counted as transactions you already had, so re-importing that file came back with almost every row ticked off as a duplicate and nothing left to import. Undo and re-import now work as a pair. *Shipped server-side — it took effect for everyone without an app update.*

---

## 1.17.1 — 2026-08-10

**Fixes**
- **Fixed: the new import-from-any-bank could not be reached.** Every row under Settings -> Import transactions named a specific bank, and choosing one told the server to use that bank's parser — so a statement from a bank we have no parser for was still routed into one, and the AI path introduced in 1.17.0 never ran. Import now leads with **Detect automatically (any bank)**, which is the row to use when your bank isn't listed. It is also the better default for a listed bank: a recognised format still uses its own parser (ABA-390, ABA-391).
- The same gap had made the older "pick your bank from a list" fallback screen unreachable as well; it works again.

1.17.0 shipped the feature itself but not a way to open it, so if you never saw the new import, this is why.

---

## 1.17.0 — 2026-08-10

**Import from any bank**
- **A statement we don't recognise can now be imported anyway.** Until now, import worked only for the handful of banks we had written a parser for; everyone else landed in a column mapper most people never finished. Now, when the format is unfamiliar, AI works out which column holds the date, the amount and the description, and your device does the rest (ABA-390, ABA-391).
- **You are asked once per account before anything is sent**, and the screen states exactly what goes: the header row plus a few example rows from your file, or the first lines of text from a PDF. You can always map the columns yourself instead.
- **You can see and fix what it matched.** The preview shows which column it used for each field — tap to correct one without re-mapping the whole file. It can get a column wrong, which is exactly why it is shown.
- **Spreadsheet (XLSX) statements are now accepted**, not just CSV and PDF.
- **If the statement has no currency column**, every row is read in your own currency and the preview says so — and lets you change it before importing.
- **Reading PDF statements with AI requires Pro.** CSV and spreadsheet import is free.
- After a PDF, the preview says whether it could confirm that every transaction was found. Most statements print no closing balance to check against, so this note is normal rather than a problem — it is a prompt to glance over the list.
- **Fixed: Revolut CSV exports were never detected automatically.** You had to pick Revolut from the list by hand; the format is now recognised on its own (ABA-390).
- **Fixed: after picking your bank from the list, nothing was ticked** and the Import button stayed disabled until you tapped every row (ABA-391).

**Transfers between accounts**
- **Both balances are now shown while you set up a transfer**, along with an `Available` line and a `Max` button for the currency you are typing in (ABA-388).
- **Frequent routes appear as chips** — the account pairs you move money between most often, each with its balance.
- **A date field**, so a transfer made yesterday is not recorded as today.
- **An existing transfer's accounts can be changed**, not only its amount.
- Going over the balance shows a warning but never blocks you: an account whose starting balance was never set looks emptier than it is.

**Internal**
- Fixed the admin dashboard showing "Never" under Last Login for users who were clearly active (ABA-389).

---

## 1.16.1 — 2026-08-03

**Fixes**
- **Fixed: the spending audit and the spending story could be shown in the wrong currency.** Both picked the currency of a single transaction — the most recent one for the audit, the largest one for the story — so one small charge in another currency could make a whole zloty account read in dollars, with amounts of different currencies added together. Both now use your display currency (the pill on the home screen) and convert every amount into it first, so the totals actually add up. A report that was already generated in the wrong currency is rebuilt the next time you open it (ABA-386, ABA-387).
- **Fixed: bank notification auto-capture invented expenses.** Any push from a connected bank app that merely contained a number and a currency became an expense — a crypto price alert like "up 5.32% in the past 2 hours, it's now $59,123.45" was booked as a 5.32 USD expense with the merchant "The Past 2 Hours. It's Now". Auto-capture now requires the notification to actually be about money leaving your account, ignores percentages, and skips declined payments, balance updates and rate alerts (ABA-387).
- **Auto-capture now recognises "EUR"** written as a code and not as the € symbol, so card payments from banks outside Poland are captured instead of being silently ignored (ABA-387).

---

## 1.16.0 — 2026-08-02

**Financial month**
- **Your month can now start on payday** — if your salary arrives on the 10th, set your account's financial month to start on the 10th and budgets run from the 10th to the 9th instead of the calendar month. Set it in Settings -> Accounts -> pick an account -> Financial Month. Account owners only, and each account has its own (ABA-383).
- Budgets, their history, their alerts and the AI chat's budget answers all follow the same window, so they agree with each other.
- The change is retroactive and purely a lens: past budget periods regroup to match, but none of your expense or income data is altered. Pick a day that some months don't have, like the 31st, and those months simply start on their last day.
- **Fixed: budget history could skip a month.** Opening a budget's history on the 29th-31st dropped one month and showed the next one twice. This affected everyone, not just people using the new setting (ABA-383).

**Adding transactions**
- **Set the date while adding** — the new expense and new income forms now have a date field. Before, everything was saved as today and you had to open the transaction afterwards to correct the date (ABA-380).
- **Change an expense's currency** — the amount row on an expense is now a value plus a currency chip, so you can relabel a transaction that was recorded in the wrong currency. It relabels; it never converts the amount (ABA-379).
- **Fixed: every date picker was dead in the web app.** Tapping a date field did nothing at all on the web — new expense, new income, goal deadline, trip dates. All of them work now (ABA-381).

**Fixes & reliability**
- **Fixed: saving an account setting on the web emptied your account list** and left you on "Account not found". The same flaw affected creating, deleting and leaving accounts (ABA-385).
- **Accounts are now in Settings.** The accounts screen was reachable only through the account name in the header, which made account settings hard to find at all (ABA-385).
- The home budget card now shows which dates it covers, but only if your account uses a financial month other than the calendar one (ABA-385).
- Product names read from scanned receipts now reach the server intact, so price history and the inflation index group the same product correctly instead of splitting it.
- The AI backfill that tidies up product names now also sees items that never got a name, and matches its answers by product rather than by position in the list — which could previously attach the wrong name to a product.

---

## 1.15.0 — 2026-07-27

**Receipt splitting**
- **Split a bill with friends who don't have the app** — assign each line item on a scanned receipt to whoever had it, or just split the whole thing evenly, and the app creates one private link per friend. They open it, see only their own share and a payment button, and tap "I paid"; you confirm once the money actually arrives, which closes the debt (ABA-376).
- **Get paid back on the spot** — add up to 5 payment methods to your profile. Revolut and PayPal show a ready-to-tap button with the amount already filled in; BLIK shows your number with instructions (it has no cross-bank link); cash and other show whatever details you typed, like an IBAN. Payment details are read the moment a friend opens the link, so updating them later also fixes links you already sent (ABA-376).
- **Split with the same people again in a tap** — names of friends you've split a bill with before are suggested as chips, so you don't have to retype them (ABA-376).

**Receipt price check**
- **Flagged before you leave the register** — after you scan a receipt (in the app, or via the Telegram, WhatsApp, or Slack bot), any line that's more expensive than what you usually pay for that product at that store is called out as worth double-checking — right on the scan screen and in the bot's reply (ABA-373).

**Personalization**
- **Make the app yours with an accent color** — on top of the light/dark theme you can now choose an accent color that recolors buttons, links, the active tab, quick actions and more. Pick from ready-made swatches or dial in any color with a built-in picker (hue, saturation/brightness, or hex). Your choice works in both light and dark mode and is saved to your account, so it follows you across devices (ABA-372).

**Inflation Shield**
- **A heads-up before prices rise** — Inflation Shield now proactively notifies you about the single product most worth stocking up on this month, so you can buy ahead before it gets pricier (ABA-371).

**Fixes & reliability**
- Receipt line items (the individual products on a scanned receipt) now show up correctly in the web app; they could previously appear empty even though the receipt scanned fine (ABA-374).
- The archive-trip screen's confirmation text is now translated in all 8 non-English languages, instead of showing raw English on a destructive, irreversible action (ABA-375).
- Bank-notification auto-capture now correctly reads amounts written with a thousands separator (e.g. "1,234.56"), and tells you when it hit a currency it can't handle instead of silently doing nothing.
- Existing light/dark preferences are preserved on upgrade, and semantic (success/danger) buttons keep their own color regardless of your accent.
- Polished the accent color picker on Android so its buttons clear the navigation bar and the dimmed background covers the full screen (ABA-372).
- Various stability improvements.

**Behind the scenes**
- The mobile app's automated test suite now runs on every change (previously only lint and typecheck did), and several suites that had silently stopped running — or never ran at all — were repaired, along with a stale TypeScript conflict in the admin dashboard.

---

## 1.14.0 — 2026-07-21

**AI chat**
- **Manage your shopping list by chat** — you can now ask the assistant to take things off your shopping list ("I already bought milk, remove it") and to suggest what to restock or what's on a good deal right now (ABA-360).

**Shopping reminders**
- **No more "buy bread" every single morning** — restock reminders now fire once per purchase cycle (and again only after you actually rebuy), and deal alerts once per product per week, instead of repeating daily. A minimum gap between notifications keeps things calm (ABA-350).

**Fixes & reliability**
- Tapping a budget alert notification now reliably opens the right budget, even for a budget you just created (#364).
- Your expenses total now shows your account's own currency instead of always displaying USD (#363).
- The Net Profit chart now shows its below-zero region correctly instead of clipping negative months (ABA-352).
- Fixed a crash that could happen when moving an expense to another account if it collided with an existing item there (ABA-351).

**Behind the scenes**
- Large internal refactors for maintainability: split the oversized expenses service and shopping-list screen into focused pieces, decomposed the app's root layout into small hooks, and extracted a shared share-image component (ABA-368, ABA-352, ABA-351, ABA-353).
- Consolidated the subscription pricing table into a single source of truth so displayed prices can never drift (ABA-350).
- Expanded automated test coverage across wallet, incomes, categories, debts, and the sync engine (ABA-370, ABA-359, ABA-358, ABA-356).
- Marketing-site improvements: PageSpeed/accessibility fixes, spec-compliant `llms.txt`, and a Startup Fame badge (ABA-366, ABA-367).

---

## 1.13.0 — 2026-07-16

**Inflation Shield**
- **Know what's about to get pricier — and stock up first** — the app forecasts prices for the products you buy regularly, straight from your scanned receipts (no AI cost), and tells you what to stock up on now: how many to buy, at which store, and roughly how much you'd save. It also tracks how much it's saved you so far. New home widget, a full screen, and a shareable summary image. You can also just ask the AI chat "what should I stock up on?" (ABA-346).

**Financial Wrapped**
- **Your year in review** — a Spotify-Wrapped-style swipeable card deck built entirely from your own data: total tracked, top merchant, biggest month, top category, receipts scanned, savings, your personal inflation rate, and your tracking streak. Hide amounts before sharing, and share as text or as an image. Free — find it via a banner on the Analytics tab (ABA-336).

**Community Price Map**
- **See where it's cheapest, crowdsourced (Pro)** — search a product to see the cheapest nearby stores and their median prices, built from everyone's anonymized receipts. A store only shows up once enough independent shoppers have confirmed the price, to protect everyone's privacy. Includes a store map (ABA-335).

**AI chat**
- **Search your actual receipts, not just descriptions** — ask "how much did I spend on beer?" and the AI now searches the individual line items on your scanned receipts, tolerant of typos and any language, across your full history (ABA-343).
- Discount lines on receipts (like "Lidl Plus coupon -6.87") are now folded into the receipt's total discount instead of showing up as an odd separate negative item (ABA-343).
- Fix: the assistant no longer wrongly claims "you have no budget" when you only use category-level budgets — it now always checks your real budget status (ABA-344).
- You can now ask the AI chat to add items to your shopping list (ABA-348).

**Expenses**
- **Move an expense to another account** — reassign an expense you added to the wrong account. Its category is matched by name in the new account (or cleared if there's no match); account-specific tags and project links don't carry over since they don't exist in the new account.

**Accounts**
- The account switcher now cleanly groups your accounts into Active, Archived, and Deleted, with one consistent filter on both mobile and web. Archived trips always show up under "Past trips," even if their internal status hadn't caught up yet.

**Shopping list**
- The "add item" button moved to a bottom bar for easier one-handed use (ABA-348).
- Archiving your last shopping list now leaves a clean "create a list" screen instead of the list quietly reappearing later (ABA-348).

**Fixes & reliability**
- Unusual-activity alerts (duplicate charges, price jumps, etc.) now reliably open the expense they're about, even right after you create it; a duplicate/merge alert is automatically cleared once you delete or merge the expense (ABA-339).
- Fixed the net-profit chart clipping and overflowing on the web app.

**Behind the scenes**
- New admin dashboard for investor metrics (cohort retention, activation, honest MRR, churn) with explanatory tooltips (ABA-340, ABA-341); marketing-site SEO improvements and better linking between the blog and help center (ABA-342); expanded technical and in-app help documentation.

---

## 1.12.0 — 2026-07-09

**Smart Shopping List**
- **Shared shopping lists** — create shopping lists that sync across everyone on a shared account, fully offline-first (add items with no signal; they sync when you're back online). Keep several named lists and switch between them; archiving a list on one device no longer risks deleting it on another (ABA-330).
- **Where's it cheapest? (Pro)** — compare your whole basket across the stores you actually shop at, using the prices from your own scanned receipts. See the cheapest store overall (coverage-aware, so a store that's missing half your items can't "win"), the cheapest store per item, and how fresh each price is. With location enabled you also get distance and a "nearby" filter (ABA-330).
- **Store map** — see the stores from a basket comparison on a map, toggling between "cheapest" and "nearby" (ABA-330).
- **Time to restock** — the app learns how often you rebuy staples and suggests adding them back before you run out (ABA-330).
- **Deal alerts** — get notified when a store's recent price for something you buy drops well below its 90-day average (ABA-330).
- Reachable from a home quick action, the Settings hub, a "Plan a shop" button in Analytics, and push deep-links. New notification toggles for restock reminders and deals.

**Home screen**
- **One shopping button** — the near-identical "Shopping" and "Purchase Request" quick actions are merged into a single button that opens a small menu with both, to declutter the strip (ABA-332).

**Maps & location**
- **Search near you** — the location picker's address search now prioritises places near you, and the map opens centred on your current position when you add a location (an existing location still opens on its own pin) (ABA-333).
- **Recent places** — addresses you picked before are remembered and offered first, both in an empty search box and above fresh search results (ABA-333).
- **Now works on the web** — near-me centring and proximity search work in the web app too (your browser asks for location permission once) (ABA-333).
- **Bot-scanned receipts on the map** — receipts you scan through the Telegram / WhatsApp / Slack bots now appear on the expense map, placed from the store address printed on the receipt (ABA-321).

**AI chat**
- **Anyone can share a chat** — any member of a shared account can now make their own conversation shared for the group, not just the account owner (ABA-334).
- Fix: your own sent message no longer occasionally shows up twice on your screen (it always looked correct to the other members) (ABA-334).

**Subscription pricing**
- **Lower Pro pricing** — Pro is now $4.99/month or $29.99/year (down from $9.99 / $95.88), matched across every supported currency, to make upgrading easier. Business is unchanged (ABA-320).

**Fixes & reliability**
- Fixed several crashes and glitches: bank-statement import when a row had already been imported (ABA-313); a rare startup race that could fail the subscription-status check for brand-new users (ABA-314); the AI "re-analyze product names" backfill (ABA-315); and budget creation when the app retried the same offline create (ABA-316).
- Paid users are no longer briefly shown the upgrade paywall right after login while the subscription tier loads.
- An account you've just been invited to now appears immediately after you accept (ABA-309).

**Behind the scenes**
- Operational alerts (new registrations, subscriptions, downtime) now go through a separate ops Telegram bot (ABA-319); the marketing blog gained feature-led articles on the Personal Inflation Index and expense map across all 9 languages (ABA-318); a pre-deploy guard blocks a class of production crash caused by runtime imports of shared utilities (ABA-317).

---

## 1.11.0 — 2026-07-05

**Group Trip Wallet**
- **Split costs on a trip** — a new "Trip" account type for travel groups. Add shared expenses, choose who actually paid and how to split each one (equally, exact amounts, percentages, or shares), and the app tracks who owes whom. When the trip ends, a Settle Up screen shows the minimum set of payments to square up, with one-tap Revolut / PayPal / BLIK payment links; the person who receives a payment confirms it. Invite friends with a link, then archive the trip when everyone is settled (ABA-305).

**Personal Inflation Index**
- **Track your own inflation** — the Analytics tab now shows how the prices you actually pay have changed over time, computed from your scanned receipts (no AI cost). See per-product price history, compare stores cheapest-first, and rename or merge products. Pick a 3 / 6 / 12-month or all-time period (ABA-307).
- **Cleaner product names & accuracy** — an optional "Re-analyze with AI" button regenerates tidy product names from messy receipt text; you can also ignore a product or delete individual price points to keep one-off discounts out of the index (ABA-307, ABA-308).

**Budgets**
- **Per-category budget alerts** — budgets with category limits now warn you when an individual category crosses 50%, 80% or 100% of its allocation, not just when the overall budget does (ABA-306).

**Shared accounts**
- **Invite existing users by search** — invite someone to a shared account by searching their name or email instead of typing the exact address; they get a "My Invitations" tab and a push notification to accept or decline (ABA-309).

**Expense map & location**
- **See where you spent** — expenses can now appear on a map. Scanned receipts are placed automatically from the store address printed on the receipt; you can also attach your current location to expenses you add on the spot (optional, off by default — enable in Settings → Data & Reports), or drop and adjust the pin by hand. The Expenses tab has a new List / Map toggle that respects your current period, category and merchant filters, and each pin opens the expense (ABA-310).
- **Trip map** — trip accounts get a map of where the group's money went (ABA-310).
- **Reliable store lookup** — receipt store addresses now resolve correctly even on receipts that print both the store address and the seller company's head office (common in Poland); the app geocodes the store address only (ABA-311).
- Fix: map pins now show their marker icon (previously a pin could appear without an image).

---

## 1.10.0 — 2026-06-30

**Purchase Requests**
- **Agree on group purchases together** — any member of a shared account can propose a purchase for the group to vote on. All other members get a push notification, tap it to open the request directly, and vote Approve or Reject — including from the Telegram and WhatsApp bots. When the group decides (majority, unanimous, or owner-only — configurable per account), everyone is notified. An approved request can be converted into a planned expense in one tap and marked as purchased once the item arrives (ABA-298).
- **Edit and delete your proposals** — the creator (or account owner) can now edit the title, amount, currency, merchant, and description of a pending request, or delete it entirely before voting is complete (ABA-302).

**Family Feed**
- **See what everyone is spending** — shared accounts now have an activity feed (like Instagram Stories) showing expenses and incomes added by all members, grouped by person and day. Tap any card to open the transaction. React with an emoji (👍 😮 💸 ❤️ 😂 🎉) to comment without words (ABA-299).
- **Family Feed widget** — a compact version of the feed appears on the home screen; tap "View all" for the full feed. Hidden automatically for personal accounts (ABA-299).
- Feed automatically clears events older than the configured retention period (default 5 days, adjustable in the admin panel); rejected purchase requests disappear from the feed immediately; the widget now shows the purchase amount on request cards rather than repeating the status label (ABA-303).

**Bank notification fixes (Android)**
- Five fixes for the notification auto-capture feature: PKO BP card-debit messages ("Obciążenie kartą") now parse correctly; captured events from the Kotlin service now reliably reach JavaScript under React Native's New Architecture; startup race conditions that silently dropped the first notification after app launch are resolved (ABA-297).

---

## 1.9.0 — 2026-06-29

**Safe-to-Spend**
- **"Can I afford this?"** — a new card on the home screen shows how much you can safely spend for the rest of the month, based on your income, recurring expenses, active budgets, and saving goals. Ask the AI "can I buy X for Y?" and get an instant yes/no with reasoning (ABA-293, ABA-294).

**Bank notification capture (Android)**
- **Expenses from bank notifications** — the app can now read your bank's push notifications (e.g. "Card charged: 45.00 PLN at Biedronka") and suggest adding the expense automatically. Works with Polish banks (mBank, PKO, ING, Millennium, Pekao, Santander, Alior) and a generic fallback for other countries. Enable in Settings → Auto-capture (ABA-295).
- **Smart dedup** — if a captured notification matches a transaction you already imported via bank CSV, the app detects the duplicate and suggests merging instead of creating a double entry (ABA-296).

**Web — Desktop layout**
- **The web app now has a laptop-friendly layout** — at 1024 px and wider you get a left sidebar for navigation, a full-width top bar (account, currency, alerts, settings), and a two-column widget grid on the Dashboard. Mobile and narrow browser windows are unchanged (ABA-289, ABA-290).

**Notifications**
- **Tracking gap reminder** — if you haven't logged any expenses for 3 or more days, the app sends a gentle nudge to keep your streak going. Reminds every 3 days (day 3, 6, 9…). Toggle it off in Settings → Notifications (ABA-292).

**Fixes**
- Sign in with Google now works correctly on the web app — the nonce required by Google's OpenID flow is now generated and sent, eliminating the "invalid_request" error (ABA-291).

---

## 1.8.0 — 2026-06-22

**Sign in with Google**
- **"Continue with Google"** is now available on the login and registration screens — no password needed. Existing accounts are automatically linked if the email matches your Google account (ABA-282).

**AI chat**
- **Amounts now appear in your display currency** — when you ask the AI about expenses, budgets, or category breakdowns, it converts every figure to your selected currency on the fly (ABA-263).
- **Better language detection** — the AI no longer confuses French for Spanish when your message contains accented characters that both languages share (ABA-264).

**Savings goals**
- **Contribution history** — the goal detail screen now shows a log of every deposit: how much, when, and whether it was added manually or by the AI (ABA-262).

**Pro plan**
- **AI features are now Pro** — Fat Finder, Spending Story, and AI Insights require a Pro subscription. A prominent 7-day free trial invite appears when you hit the limit (ABA-265, ABA-266).

**Web**
- Marketing landing at [ai-budget.pl](https://ai-budget.pl) in 9 languages, with an SEO blog, Privacy Policy, Cookie Policy, and About page (ABA-267–ABA-281).

---

## 1.7.0 — 2026-06-15

**Wallet**
- **See how your balance changes over time** — the wallet now shows a monthly balance-change chart, with a green/red bar for each month, a 6-month / 12-month toggle, and a currency switch to view totals in any supported currency (ABA-257, ABA-258).

**Subscriptions**
- **Renewal calendar** — switch the Subscriptions screen between List and Calendar views to see, at a glance, which days your subscriptions renew (ABA-259).

**Merchants**
- **Cleaner merchant names from bank imports** — Polish bank brands now import under one tidy name (e.g. every "BIEDRONKA 1234 WARSZAWA" becomes "Biedronka") (ABA-254).
- **Merge merchants in bulk** — on the Merchants screen, select several variants and merge them into one; the app also suggests likely groupings, and dismissed suggestions stay dismissed across sessions (ABA-254).
- **The app learns your categories** — when you change an expense's category, the app remembers the merchant → category mapping and automatically applies it to future bank and Wise imports. Manage the learned rules at the bottom of the Merchants screen; they sync across your devices (ABA-260).

**Email**
- Summary report emails were **restyled to match the app's look and feel** (ABA-250).

**Fixes**
- Slack bot: receipt photos, voice messages, and PDF statements work again — uploaded files were being silently dropped (ABA-256).

**Under the hood**
- Moved push-notification strings into the shared types package, added test coverage for the subscription manager, and sped up the Windows dev bundler by scoping Metro's file crawl (ABA-251, ABA-252, ABA-253, ABA-255).

---

## 1.6.0 — 2026-06-11

**Anomaly alerts**
- **The app now watches your money for you** — it proactively flags unusual activity: a possible duplicate charge, a subscription or recurring payment that got more expensive, a merchant that "looks like a subscription", or a category spike well above your usual. Tap the new bell on the home screen to see every alert, and turn them on/off in Settings → Notifications (ABA-242).
- Alerts work for expenses added by hand, by voice, from receipts, via the bots, and from bank imports; the duplicate-charge check matches by merchant **or** description, so a copied expense is caught even without a merchant (ABA-245).

**Refreshed home & header**
- **New unified header** across the home screen and every tab — the account and display currency are now separate pills, the greeting was removed for a cleaner look, and a white divider tidies the layout (ABA-243).
- **Quick actions wrap to rows** — every shortcut is visible at once instead of hiding behind a horizontal scroll, with refreshed brand icons (ABA-244).

**Fixes**
- Amount fields now accept a **comma** as the decimal separator (ABA-241).
- Web: fixed logout not clearing the session, so you stay logged out after a refresh (ABA-235).
- Belarusian: added the missing encryption-screen translations (ABA-236).

---

## 1.5.1 — 2026-06-07

**Web app**
- **AI Budget Assistant is now on the web** — open it right in your browser at [ai-budget.pl](https://ai-budget.pl). Log in, manage accounts, add expenses and income, chat with the AI, and browse your dashboard — no install needed (ABA-213, ABA-214).
- Web parity polish — reference-data screens, login/chat **Enter to submit**, centered action strips, dialogs, lists, tab bar, and safe-area fixes; debts now feed the Financial Health score correctly on web (ABA-218, ABA-220).

**Subscription Manager**
- **Track your recurring charges** (Netflix, gym, SaaS…) in one place — add a subscription with its amount, billing cycle, and next renewal date, and see your monthly total at a glance. Reachable from Settings, the home quick-action strip, and the Fat Finder "Track this" button (ABA-208, ABA-209).
- Get a **reminder 3 days before** each renewal, and the app can **auto-record the expense** on the renewal date and advance to the next cycle (ABA-211).

**Home screen**
- **Customize your quick actions** — choose which shortcuts appear in the home strip and drag to reorder them, right alongside the widget settings (ABA-207).

**Languages**
- Added **Dutch (Nederlands)** across the app, bots, and help docs (ABA-204).

**Chat bots**
- **Slack: add to any workspace** — connect the Slack bot through a one-tap "Add to Slack" install flow, with each workspace's token encrypted at rest (ABA-200).

**Admin**
- Sortable **Users** table (name, email, registered, last login) and clickable **App Versions** rows that open full release details (ABA-202).

**Fixes**
- Fixed AI chat where your message bubbles could wrap one character per line (ABA-206).
- Fixed a doubled Financial Health widget and the detail breakdown collapsing on mobile (ABA-219, ABA-221).
- Fixed the Subscriptions list row where the delete button overlapped the amount (ABA-212).

---

## 1.4.1 — 2026-06-04

**Chat bots**
- New **Slack bot** — connect your account to Slack and manage money straight from a direct message: AI chat, add expenses and income by text or voice, scan receipt photos, manage budgets and categories. Full feature parity with the Telegram and WhatsApp bots; link with a 6-character code (ABA-194).
- The Slack bot shows a **💭 "thinking" indicator** while it works, and echoes the recognized transcript for voice messages, so it's always clear it's processing (ABA-196).

**Home screen**
- **Financial Health Score** — a single 0–100 gauge on the Dashboard summarizing budget adherence, savings rate, goal progress, and debt health, computed entirely on-device with no AI cost (ABA-193).
- **Reorder your Dashboard widgets** — drag the handle in Settings → Dashboard Widgets to arrange the home screen your way; "Reset to default order" restores the original layout (ABA-189).

**Income**
- Capture income by **voice** or by **scanning an invoice/receipt** — the same fast capture flow already available for expenses (ABA-190).

**Under the hood**
- Refactored the chat screen into focused hooks and components (ABA-198).

---

## 1.3.1 — 2026-06-02

**Currency**
- Switch your **display currency** straight from the account switcher — the pill now shows the base-currency symbol (e.g. `Personal · $`), and its menu has a **Display currency** chip for each supported currency. Changing it instantly reconverts every total across the app, for all roles (ABA-187).

**Stability**
- Fixed a crash on launch where the app would close right after opening (and Samsung Device Care reported it "crashing frequently"). It happened when Android restored the app after the OS had killed it in the background (ABA-188).

**Under the hood**
- Faster investment asset-price updates and transaction creation (ABA-186).
- Internal refactors and more test coverage — large screens/hooks split into focused modules, tighter API typing (ABA-180, ABA-181, ABA-182, ABA-183, ABA-184, ABA-185).

---

## 1.3.0 — 2026-05-30

**Analytics**
- New **Top merchants** breakdown on the Analytics tab — where you spend the most, by merchant (ABA-171).
- **Income breakdown by category** (donut), alongside the existing expense breakdown (ABA-175).

**Bulk expense operations** (ABA-173 + fixes)
- Multi-select: select several expenses and **set category**, **add tag**, or **delete** them at once.
- Long-press a row again opens the **Edit / Duplicate / Delete** menu; bulk mode is the **Select multiple** item (long-press regression fixed, ABA-168).
- Fixed bulk **delete** where expenses reappeared after refresh — two causes: server route ordering and local-id (`clientId`) resolution (ABA-166).
- Fixed **tag assignment**: server-side links weren't saved due to a tag-id mismatch — added reconciliation via `Tag.clientId`; tags now load in the bulk picker (ABA-167).

**Import**
- **Revolut statement import** (CSV) (ABA-176).

**Under the hood**
- Sync payload typed per entity, no `as any` casts (ABA-174).
- Docs: `PATCH /expenses/bulk` endpoint, bulk operations, tag reconciliation, Revolut — in both technical and user help (ABA-177).

> Production infrastructure (encrypted off-site DB backups, disk/container monitoring, log rotation, DR runbook, build-cache pruning on deploy) shipped in 1.2.0 (below) and continues to run.

---

## 1.2.0 — 2026-05-29

Large release: ~196 commits after 1.0.0. Main themes.

**Bank & transfer import**
- Polish bank statement import: **mBank, PKO** (CSV), **Erste, Alior** (PDF), universal column mapping; **Wise import** (CSV).
- **Import history** with rollback and deduplication; request-a-bank flow.

**Expenses & categorization**
- **Merchant** field on expenses (OCR / import / manual), **merchant management** screen (rename / merge / delete).
- Recurring expenses, category splits, project links.

**AI & bots**
- **Telegram** and **WhatsApp** bots: AI chat, voice (Whisper), receipt OCR.
- Shared AI chat for shared accounts; AI commands for debts and savings goals.

**Finance**
- **Debts & loans**, **savings goals**, **investment portfolio**, **referrals**, **gamification**.
- Wallet, currency exchange, account transfers; initial-balance editing.

**Security & privacy**
- **End-to-end encryption** of sync (E2EE) with recovery.
- **Viewer** role (read-only) with write blocking on the server, in AI chat, and in bots.

**Performance & infrastructure**
- Caching layer (Redis), restart-resilient throttling, connection pool, parallel sync.
- **Automated PostgreSQL backups**: nightly, encrypted (`age`), off-site to GitHub Releases, GFS retention, Telegram alerts, restore runbook.
- **Fault tolerance**: disk/container monitoring, Docker log rotation, full-server-rebuild DR runbook, build-cache pruning on deploy.

**Other**
- Scenario simulator, widgets, reference-data hub, unified bots screen, app-version gate, and more.

---

## 1.0.0 — 2026-04-10

First public release.

- **Expense & income** tracking, **budgets** with periods and history.
- **Analytics**: breakdowns, trends, drill-down, calendar.
- **AI assistant**: financial Q&A and actions via chat (create expenses/budgets, etc.), with automatic language detection (8 languages).
- **Multi-account** (personal / shared / business) with roles and invitations.
- **Voice input** and **receipt scanning** (OCR).
- Wallet and multi-currency, tags, projects.
- Offline-first: local SQLite + server sync.
- 8 UI languages, dark / light themes.
