# Planning ahead — Safe to Spend, Affordability & Auto-Capture

> Three tools that work together to help you spend confidently: a live daily budget number, an "can I afford this?" chat question, and automatic expense capture from bank notifications (Android only).

## Safe to Spend today

The home screen hero shows a **Safe to Spend** number — the amount you can spend today and still cover all your known obligations before the end of the month.

### What it includes

The number is calculated from:
- **Wallet balance** — your current balances across all currencies, converted to your display currency.
- **Upcoming subscriptions** — active subscriptions renewing before the end of the month (from Subscription Manager).
- **Upcoming recurring expenses** — expenses on a weekly, monthly, or yearly repeat schedule due before the end of the month.
- **Goal contributions** — the daily amount needed to keep your savings goals on track.
- **Expected income** — if the app detects a regular monthly income (same amount, ~30-day gap, at least twice in the last 90 days), it adds that as expected income and uses the next payday as the horizon instead of month end.

### Formula

```
Safe to Spend = (Wallet balance + Expected income − Obligations) ÷ Days remaining
```

The result is clamped to zero — you'll never see a negative number. If projected obligations exceed your balance, the number shows 0 with an explanatory note.

### Breakdown sheet

Tap the number to open a breakdown sheet that shows each component: wallet balance, expected income, upcoming subscriptions, recurring expenses, and goal contributions. All amounts are in your display currency; a note appears if any conversion used an approximate rate.

### Widget

Safe to Spend is available as a home screen widget. You can show or hide it in **Settings → Widgets**.

## Can I afford this? (Affordability Oracle)

Ask the AI chat any question like "Can I afford a 200 € flight?" or "Can I buy a new laptop for 3500 zł?". The chat uses the same Safe to Spend engine to give a deterministic yes or no answer — the AI only narrates the verdict, it never guesses.

Possible answers:
- **Yes** — the amount is within today's safe-to-spend budget.
- **Yes, but tight** — it fits within your available balance but uses most of it.
- **No** — it exceeds your available funds.
- **Yes, but delays a goal** — affordable, but your savings goal "X" slips by approximately N days.
- **Wait until payday** — affordable after your next expected income arrives (the suggested date is shown).

## Android auto-capture

On Android, the app can automatically create an expense from your bank's push notifications — so you never miss a transaction even when you're away from the app.

### How to enable it

1. Go to **Settings → Import transactions → Auto-capture (Android)**.
2. Read the privacy note and tap **Enable**.
3. The app opens the system Notification Access settings. Find **AI Budget Assistant** in the list and toggle it on.
4. Return to the app — the status shows **Permission granted**.

### Privacy

Notification text is parsed **on your device only**. The merchant name, amount, and currency are extracted locally; only the resulting expense is synced to the server — the raw notification text is never sent anywhere.

### Supported banks (Europe)

The auto-capture works with notifications from major retail banks across Europe. Supported countries include Poland (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), Germany/Austria (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), France (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Spain (BBVA, Santander, CaixaBank, Bankinter), Netherlands (ING, Rabobank, ABN AMRO, bunq), Ukraine (PrivatBank, monobank, Oschadbank), and Russia (Sberbank, Tinkoff, Alfa-Bank). The cross-border neobanks Revolut and N26 are also supported. The complete list of supported apps is shown on the Auto-capture screen.

**Note on merchant categories:** for banks outside Poland, the app may not automatically suggest a category. The expense will be recorded without a category and you can correct it manually — the app learns from your corrections and applies them automatically in the future.

### Deduplication

If a notification is delivered more than once, or if you also import the same transaction from a bank CSV, the app deduplicates automatically. Each captured notification gets a unique fingerprint; duplicates are silently discarded.

### Reviewing captures

Tap the capture toast ("Captured 54 zł · Żabka — tap to review") to open the expense detail and verify or correct the amount, merchant, and category before it syncs.

### Android only

Auto-capture is an Android feature. On iOS and web, this section does not appear. An alternative for iOS is to scan a receipt photo through the existing receipt capture feature.
