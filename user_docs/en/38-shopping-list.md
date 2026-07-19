# Smart Shopping List

> A shared shopping list that also tells you which store is cheapest for your basket — calculated from your own receipt prices, no AI cost.

The Smart Shopping List is a shared checklist for your account. Unlike a plain list, it's connected to your **Personal Inflation Index** price history — every item you've bought and scanned has a known price at a known store, so the app can rank stores by your actual basket total, suggest what's due for a refill, and flag genuine price drops.

## Where to Find It

Open **Shopping list** from the home screen quick actions, or go to **Settings → Shopping list**. On a shared account, everyone sees and edits the same list.

## Creating and Switching Lists

Every account starts with a default list called "My List." You can keep multiple lists (e.g. "Groceries" and "Pharmacy") and switch between them.

Tap the list name pill at the top of the screen to open **Manage lists**, where you can:

- **Switch** — tap any list to make it active.
- **Create** — tap **New list** and give it a name. Any account member can create a list.
- **Rename** — tap the pencil icon on a list row. Any account member can rename a list.
- **Archive** — hides the list without deleting it (its items are preserved). Editors and the account owner only. If you archive your last remaining list, you'll see an empty "create a list" screen — the archived list stays archived and won't reappear.
- **Delete** — permanently removes the list and all its items. Editors and the account owner only.

Viewers can view, switch between, add to, and check off items on any list, but cannot archive or delete one.

## Adding Items

Tap **Add item** to open the add sheet. You can add an item three ways:

- **Search your tracked products** — start typing and matching products from your Personal Inflation Index history appear below the search box.
- **Frequently bought** — when the search box is empty, a horizontal row shows your most-purchased products for one-tap adding.
- **Free text** — if what you typed doesn't match a tracked product, tap **Add "…"** to add it as a plain text item. Free-text items aren't linked to price history, so they won't appear in price comparisons.

You can also **ask the AI assistant** to add items: open the **Chat** tab and say something like "add milk and bread to my shopping list." The items are added to your active list right away — no confirmation needed.

Each item on the list has a checkbox, an editable quantity stepper, and a delete icon. Checked items sink to the bottom of the list. Use **Clear checked** (top-right of the screen) to remove everything you've ticked off in one tap.

## Managing the List by Chat

Besides adding items, you can ask the assistant to:

- **Remove an item** — "remove milk from my list" or "take eggs off, I already bought them." This takes the item off your list immediately, same as adding — no confirmation needed. It only removes items that aren't already checked off; to mark something as bought without deleting it, use the checkbox on the list itself.
- **Ask what's running low or on sale** — "what am I running low on?" or "any deals right now?" The assistant answers with the same restock and deal information shown in the **Time to restock** and **Deals for you** rows below.

## Compare Prices ("Where's cheapest")

Tap **Compare prices** at the bottom of the list to see which store is cheapest for everything currently unchecked on your list.

The app looks at the latest price you've paid for each list item at every store in your price history, and for each store shows:

- The **estimated total** for your basket at that store.
- A **coverage badge** ("5/7 items") showing how many of your list items have a known price there.
- A **Cheapest** badge on the best-value store. A store only wins the badge if it covers all your items, or at least 80% of them when no store covers everything.
- A **stale prices** warning if some of the prices used are more than 90 days old.
- A count of items **not priced** at that store.

Below the store cards, **Cheapest per item** breaks the comparison down item by item, showing the cheapest store and price for each — useful if no single store covers your whole basket.

Only items with a matched product (added from your tracked products, not free text) are included in the comparison.

> **Note:** Comparing prices across stores is a **Pro** feature. Free plan users see an upgrade prompt when they tap **Compare prices**.

If you haven't scanned enough receipts yet, you'll see a prompt to scan a few first — the comparison needs price history to work from.

## Store Map

From the price comparison screen, tap the map icon (top-right) to open the **Store map**. It plots every store from your comparison that has a known location (captured automatically when you scan a receipt with an address, or add one manually).

- **Cheapest / Nearby** toggle — sort the store list below the map either by estimated basket total or by distance from you.
- Tap **Find nearby** to get your current location and show distances. This requires location permission; without it, stores still appear on the map but without distance labels.
- Stores without a known address aren't shown on the map, and a banner tells you how many were skipped.

## Time to Restock

The app watches how often you buy each tracked product. Once it has seen at least 3 purchases of a product, it learns your typical repurchase gap (e.g. "you buy milk roughly every 6 days"). When a product is overdue based on that pattern — and isn't already on one of your lists — it appears as a chip in the **Time to restock** row at the top of the shopping list. Tap a chip to add that item straight to your list.

You also get a push notification when something is due for restocking. A given item is only reminded once per shopping cycle, not every day — once you buy it again, the reminder resets and only comes back the next time it's due. The app sends at most one restock reminder every couple of days, summarizing the first overdue item ("Time to restock? Milk and 2 more").

## Deal Alerts

The app compares the price you've recently paid for a tracked product against its average price over the last 90 days. If a store's latest price for a product is meaningfully below that average, it shows up as a chip in the **Deals for you** row, with the store name and the discount percentage. Tap a chip to add the item to your list.

Deals are also delivered as a push notification when a genuine drop is detected, so you don't have to open the app to catch a good price — but the same price drop won't be pushed more than once a week, so you're not nudged about it repeatedly.

## Managing Notifications

Both notifications are on by default and can be turned off independently in **Settings → Notifications**:

- **Restock reminder** — the "time to restock" push.
- **Deal alerts** — the price-drop push.

## Data Source

Restock predictions, deal detection, and store price comparisons are all built from the line-item prices captured when you scan receipts with the camera (OCR) — the same data that powers your Personal Inflation Index. Manually entered expenses and bank imports don't include per-product prices, so they don't feed into these features. The more receipts you scan, the better the suggestions and comparisons get.
