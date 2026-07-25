# Receipt Price Check — is this more than you usually pay?

> Right after you scan a receipt, each item is compared against the median price you've paid for that same product at that same store before — so you can catch a missed discount while you're still standing at the register.

## What it is

Every receipt you scan is quietly checked against your own buying history: the median price you've paid for that exact product, at that exact store, over the last 12 weeks. When a line costs noticeably more than that, it's surfaced immediately — while you can still ask at the till or look in your bag, not buried in a report you'll never open.

It's plain arithmetic on your own past receipts. No AI is involved, and there's nothing to turn on or set up.

## What it never says

This never claims you were overcharged, cheated, or that a discount was withheld — a receipt can't prove any of that. If no discount line is printed, nothing shows one was ever supposed to apply, so the app never accuses. The frame is always the same, honest one: **this costs more than usual — worth checking the receipt**. A promotion that silently failed to apply is the most common real cause, and this wording surfaces it without pointing a finger at the store.

Anything the app shows you is what it has **found** above your usual prices — never what you **saved**, because there's no way to know whether you actually acted on any of it.

## Where you'll see it

- **Right after scanning a receipt** — a card like "2 items cost more than usual", with "About 6.20 zł more than you usually pay here — worth checking the receipt" underneath. Tap it open to see each flagged product with what you usually pay, what you paid this time, and the difference. It never blocks you from saving the receipt, and it never changes any amount for you — it's information, not an edit.
- **In the chat bots** (Telegram, WhatsApp, Slack) — scanning a receipt through a bot adds one extra line to the confirmation message when something was found, since bot scans go through the exact same check as the app.
- **In the Analytics tab** — a line reading "Found X above your usual prices this year", shown only once something has actually turned up.
- **In your alerts** — each scanned receipt with a finding can also appear as one alert in your alerts bell, so you don't have to remember to check.

## How much to trust a finding

A product needs at least **two** earlier purchases at the same store before the check says anything about it, so it stays quiet for a while on a brand-new account — and gets sharper the more you scan. A finding based on exactly two earlier purchases is labelled **"based on only two earlier purchases"**, so you can weigh it accordingly; three or more prior purchases is a firmer signal.

## What it compares — and what it deliberately won't

- Only the **same product at the same store**. A price at one shop is never compared against the same product bought somewhere else.
- Only **the same currency** — nothing is ever converted for this comparison.
- Different pack sizes count as different products: the scanner keeps the size in the product name (for example "Mleko Łaciate 3,2% 1L"), so a 1 L and a 0.5 L bottle are tracked separately, exactly as they should be.
- An enormous jump in price is deliberately ignored rather than reported — it's far more likely to be a different product (or a misread line) than a genuine price change.

## The yearly total

If anything has ever been found in more than one currency, the Analytics tab shows just one total — your own currency, if something turned up there, otherwise the largest single amount. Amounts are never added across currencies, since that would mean converting money this feature is careful never to convert.

## Good to know

- Works automatically on every scanned receipt — camera, gallery, PDF, and receipts scanned through Telegram, WhatsApp, or Slack.
- A finding never blocks saving the receipt and never edits an amount for you.
- Prices and differences are shown in the receipt's own currency.
