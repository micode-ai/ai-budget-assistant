# Release Notes — AI Budget Assistant

Consolidated notes for every release, newest first. The version is `versionName` in
`apps/mobile/android/app/build.gradle` (source of truth for Google Play) and `version`
in `apps/mobile/app.json`. Russian translation: [`CHANGELOG.ru.md`](./CHANGELOG.ru.md).
Detailed per-feature notes for individual dates live alongside in `docs/release-notes/`
(e.g. `2026-04-16.md`).

---

## 1.15.0 — 2026-07-23

**Personalization**
- **Make the app yours with an accent color** — on top of the light/dark theme you can now choose an accent color that recolors buttons, links, the active tab, quick actions and more. Pick from ready-made swatches or dial in any color with a built-in picker (hue, saturation/brightness, or hex). Your choice works in both light and dark mode and is saved to your account, so it follows you across devices (ABA-372).

**Inflation Shield**
- **A heads-up before prices rise** — Inflation Shield now proactively notifies you about the single product most worth stocking up on this month, so you can buy ahead before it gets pricier (ABA-371).

**Fixes & reliability**
- Existing light/dark preferences are preserved on upgrade, and semantic (success/danger) buttons keep their own color regardless of your accent.
- Polished the accent color picker on Android so its buttons clear the navigation bar and the dimmed background covers the full screen (ABA-372).
- Various stability improvements.

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
