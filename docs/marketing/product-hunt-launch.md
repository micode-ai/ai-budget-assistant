# Product Hunt — Launch Kit (AI Budget Assistant)

Everything to run a real PH launch. The bare listing card is in `backlinks.md`; this is the
full launch playbook. PH links are nofollow, but a launch drives a traffic spike, reviews, a
permanent high-DA page, and often follow-on coverage. Do it as a *coordinated day*, not a drop.

## Core fields

- **Name:** AI Budget Assistant
- **Tagline (≤60 chars) — pick one (A/B test in comments first):**
  - `Budget by voice, receipt photo or chat — with your family` (56)
  - `The budgeting app you log in 3 seconds, not 30` (47)
  - `AI budgeting: talk, snap a receipt, or just chat` (49)
- **Links:** Website `https://ai-budget.pl` · Web app `https://app.ai-budget.pl` · Google Play `https://play.google.com/store/apps/details?id=com.budget.assistant`
- **Topics (4-5):** Fintech, Personal Finance, Android, Artificial Intelligence, SaaS
- **Pricing:** Free + paid (Freemium)
- **Description (≤260 chars):**
  > Track expenses by voice or a photo of a receipt, set budgets and savings goals, manage subscriptions, and share one budget with your family — all powered by an AI assistant. Free, multi-currency, 9 languages, on Android and the web.

## Gallery (first image is the most important — it sells the scroll)

PH gallery images: 1270×760 px (min), first slide doubles as the social card. Thumbnail: 240×240.
Shot list (sources in `feature_graphics/by-language/` EN set + `creatives/`):

1. **Hero / value:** "Log an expense in 3 seconds" — the voice + receipt + chat capture trio. (Make a short GIF if possible; GIFs lift PH conversion.)
2. **Shared family budget:** the shared account view + roles (owner/editor/viewer).
3. **AI chat answer:** "What did I spend the most on this month?" → the breakdown card (use the new `chat-7` style screen).
4. **Bank import:** the import preview with auto-categorized rows + duplicate flagging.
5. **All-in-one:** dashboard with budgets, subscriptions, savings goals, anomaly alerts.
6. **Proof / breadth:** "9 languages · Android + web · free to start" closing slide.

## Maker's first comment (post immediately at launch — write in your own voice)

> Hi PH 👋 I'm [name], maker of AI Budget Assistant.
>
> I built it because logging expenses is the reason most budgets die — typing every transaction is tedious, so people quit by week two. So we made capture effortless: **say it** ("twelve for coffee"), **snap the receipt** (OCR reads amount/date/merchant), or **just type a sentence** to the AI. Then you can ask "how much did we spend on groceries this month?" and get an answer instead of building a report.
>
> It also does the stuff that actually keeps a budget alive: **shared family accounts** (everyone logs from their own phone into one live view, with roles), **bank-statement import** (Polish banks + Wise + Revolut, CSV/PDF, with duplicate detection), a subscription manager, savings goals, multi-currency, and proactive anomaly alerts for duplicate charges or price hikes.
>
> Honest caveats: we're newer than the big names, and the native app is Android-first today — iPhone users run the full web app at app.ai-budget.pl, but there's no native iOS app yet.
>
> Free to start, 9 languages. I'd love your feedback on what would actually make you stick with a budget — and I'm here all day to answer.

## Pre-written answers to likely questions

- **"How is this different from [YNAB/Mint replacement]?"** YNAB is strict zero-based budgeting you maintain by hand; we optimize for *capture friction* (voice/receipt/chat) and *shared family budgets*. Different failure modes — pick by yours.
- **"iOS?"** Full web app today at app.ai-budget.pl (same account/data). Native iOS is on the roadmap; not shipped yet — being upfront about it.
- **"Is my financial data safe?"** Offline-first (saved locally, synced later), transaction fields encrypted, clear privacy policy. We minimize what sits in the cloud.
- **"Does the AI cost extra / send my data anywhere?"** Free tier includes AI capture with monthly limits; heavy use is a paid tier. We only send what's needed to process a request.
- **"Which banks for import?"** mBank, PKO, Revolut, Wise (CSV) and Erste/Alior (PDF) today, plus a universal column mapper for others. More on request.
- **"Pricing?"** Free tier is genuinely usable (no card to start). Pro/Business unlock higher AI limits and advanced insights.

## Launch-day checklist

- [ ] Launch **12:01 AM PST** (PH resets daily; a full day on the board matters). Tue–Thu usually best.
- [ ] Post the maker's first comment within minutes of going live.
- [ ] Notify your lists (Telegram channels, email, friends) — ask them to **comment**, not just upvote (PH weights engagement; bulk upvotes from new accounts get filtered).
- [ ] Reply to every comment within the first few hours.
- [ ] Have a **promo**: e.g., an extended trial or bonus AI requests for PH users, mentioned in the first comment.
- [ ] Cross-post to your Telegram channels + LinkedIn + relevant subreddits' "what are you working on" threads (not as spam).
- [ ] After the day: add the PH badge to the site footer, record the live PH URL in `backlinks-tracker.csv`, and follow up with anyone who asked for features.

## Hunter / timing notes

- Self-launching is fine now; a well-known hunter only helps if they genuinely use it. Don't pay for "hunts."
- Create the product page early (even before launch day) so it can accrue followers; schedule the actual launch from the dashboard.
- One launch per product is the norm — make the assets count. A future major-version launch is a valid second shot.
