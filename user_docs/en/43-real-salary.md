# Real Salary — is your raise keeping up with your own prices?

> Compares how your pay has changed over the last 12 months against your own personal inflation rate — not the national headline number, but one built from what you actually spend on — so you can see whether a raise is a real gain or just keeping up with rising prices.

## What it is

Real Salary answers one question: is your paycheck actually buying more, or only growing on paper? It weighs the change in your own confirmed salary over the last 12 months against your **personal inflation rate** — a rate built from your own spending categories and official price statistics for your country, not a national news headline.

For example: your pay rose **+5%**, but your personal inflation came out at **+8.3%** — your *real* pay actually **fell by about −3.0%**, even though the number on your payslip went up.

It's **free for everyone**. Only the one-page "raise brief" PDF you can download and keep is a **Pro** feature.

## Where to find it

Open the **Analytics** tab and tap the **Real salary** banner ("Your pay vs your own inflation"). The first time you open it, you'll be asked to confirm your salary before it can calculate anything.

## Setting up your salary

The app looks through your recent income entries for something that repeats — roughly once a month, at least twice in the last 90 days — and offers it as a candidate. Pick the one that's your salary.

If the app doesn't have a full year of that salary yet, it also asks for **what you earned a year ago**, typed in the salary's own currency (not your display currency). You can type it the way you'd normally write it — `8400`, `8.400`, `8 400`, and `8,400.50` are all understood, comma or dot as the decimal point, dot/comma/space as thousands separators.

If nothing repeating is found, add your pay as income a couple of times first — voice, receipt, or manual entry, any source counts — then come back.

## Settings

Tap the gear icon on the Real Salary screen to open **Real salary settings**:

- **Country for official prices** — guessed from your device's time zone the first time you open the screen (shown as e.g. "Poland (from your time zone)"). Tap it to pick any EU/EEA/Switzerland country by hand, or to go back to the guessed one.
- **What each category counts as** — each of your expense categories can be mapped to a price group (Food and drinks, Housing and utilities, Transport, Health, and so on). Left on **Automatic**, the app assigns one for you; you only need to touch this if you disagree with a category's guess. The list starts with the categories that have no price group yet (or count as “everything else”), biggest spend first, with each category's spending over the last 12 months shown next to it — the top of the list is where a choice moves your result the most.

## How it's calculated

- **Pay change** compares the average salary per pay period over the last 12 months against the 12 months before that — using pay *periods*, not calendar months, so a payday that shifts around a weekend doesn't look like a raise or a cut.
- **Your personal inflation** is a weighted average across your own spending: each price group's official rate for your country, weighted by how much of your spending falls into it. **Food and drinks** is priced from your own scanned-receipt history instead, once you have at least 10 tracked products — your actual grocery prices, not a national average. If your receipt prices point to a food inflation far away (more than 10 percentage points) from the official food rate for your country, the official rate is used instead — a gap that large almost always means a product changed pack size or unit under the same name, not that your groceries really got that much dearer.
- **Real pay change** adjusts your pay change for that inflation rate, so it answers "did my money buy more or less", not just "did my number go up".
- **Raise needed to keep up** is how much bigger a raise, on your *current* pay, would have kept you exactly even with your own inflation.

## What you'll see

- A headline number — your real pay change, in green (ahead), red (behind), or neutral.
- Your pay change and your personal inflation, side by side.
- A breakdown of where prices rose for you, one row per price group, each tagged **your receipts** or **official data** depending on where its rate came from.
- A note naming which month the official data is from, or that the answer is based on receipts only when your country has no official coverage.
- A reminder that this is **an estimate, not financial advice**.

## What each message means

- **"Confirm your salary"** — no repeating income was found yet, or you haven't picked one. Opens the setup screen.
- **"Tell us last year's salary"** — the app doesn't have a full year of your confirmed salary. Enter last year's monthly figure.
- **"Keep tracking a little longer"** — the app needs at least 3 months of expenses to know what you spend on.
- **"No price data for your country"** — no official price statistics are published for your country, and you don't yet have enough scanned receipts to stand in for them. Set your country by hand, or scan a few more receipts.
- **"Not available with full encryption"** — accounts with full end-to-end encryption keep amounts unreadable on the server, so this can't be calculated for them.

## Sharing

Tap **Share** to post your result. The share card shows **percentages only** — your pay change, your inflation, your real change — never your actual salary or spending amounts, so you can share a win (or a rant) without revealing what you earn.

## The raise brief (Pro)

Tap **Raise brief** to download a one-page PDF summarising your result — useful to bring to a salary conversation. It's built entirely from the number already on your screen (no extra AI cost), available in all app languages, and only downloadable once your result is fully calculated (not while any of the messages above is showing).

## Good to know

- Free for every subscription tier — only the brief PDF is Pro.
- Needs a connection — it's calculated on the server, with no offline fallback.
- Country coverage is currently the EU, EEA, and Switzerland (wherever Eurostat publishes official price statistics); outside that, the app can still answer from your receipts alone once you have enough of them.
- Not available on accounts with full end-to-end encryption.
- Everything shown is an **estimate** built from your spending categories and public price statistics — not financial or tax advice.

## FAQ

- **Q: Why is my inflation different from what's in the news?**
  **A:** News headlines report one national average shopping basket. Yours is weighted by what *you* actually spend money on — if you spend more on transport and less on restaurants than the average person, your rate reflects that instead.

- **Q: Why is my country guessed, and can I change it?**
  **A:** It's guessed from your device's time zone so there's nothing to set up on day one. Change it any time in **Real salary settings → Country for official prices**.

- **Q: Does this work with full encryption turned on?**
  **A:** No — a fully encrypted account keeps your amounts unreadable on the server, and this calculation needs to read them. You'll see "Not available with full encryption" instead of a result.

- **Q: Which countries have official price data?**
  **A:** The EU, EEA, and Switzerland — the countries Eurostat publishes harmonised price statistics for. Elsewhere, the app relies entirely on your own scanned receipts once you have enough of them.

---

*See also: [Personal Inflation Index](./36-personal-inflation-index.md) | [Inflation Shield](./40-inflation-shield.md) | [Budgets](./05-budgets.md)*
