# Personal Inflation Index

The Personal Inflation Index shows how the prices you actually pay have changed over time — calculated from your own receipt scans. Unlike official inflation figures, this reflects your real shopping basket.

## How It Works

When you scan a receipt, the app extracts individual line items (e.g. "Mleko Łaciate", "Chleb Razowy") and records the price you paid and the store name. Over time, the app builds a price history for each product and calculates your personal inflation as a weighted average across all tracked products.

The formula weights products by how much you spend on them (items you buy often and at high prices influence the index more), giving you a fair picture of how price changes affect your specific spending.

## Where to Find It

The Personal Inflation Index appears in the **Analytics** tab, below the AI Insights section. It shows:

- A headline number: **"Your inflation: +11.4%"** over the selected period
- How many products are being tracked
- A list of products with their individual price changes
- Per-product price history chart and store comparison (tap any product)

## Period Selection

Tap **3M**, **6M**, or **12M** to change the comparison period. The app compares prices from the first half of the period (the "base") to the second half (the "current"), so a 6-month period compares months 1–3 against months 4–6.

The index shows `null` until at least 3 products have been purchased in both the base and current periods.

## Store Comparison

Tap any product to see:
- A price history chart over time
- A table showing the latest price at each store you've bought that product, sorted cheapest first
- An option to rename the product (see below)

## Managing Product Names

The app assigns a short, clean name to each product automatically (e.g. "PIWO TYSKIE 0,5L 4,7%" → "Tyskie Piwo"). You can correct or customize these names.

### Rename a Single Product

Tap any product row in the inflation section, then tap the rename option. Enter the name you prefer and save. This only affects how the product is displayed — the underlying price history is preserved.

### Manage All Products

Go to **Settings → Reference Data → Products** to see all tracked products. From here you can:

- **Rename** any product (tap a row)
- **Merge** multiple product variants into one (long-press to select, then tap Merge) — useful when the same product appears under slightly different names
- **Reset** a custom name back to the original (tap the reset icon on a row that has been renamed)

### Merging Products

If you see "Mleko 3.2%" and "Mleko Łaciate" separately but they're the same product, select both, tap Merge, and enter the canonical name you want. All price history from both names will be combined under that single name going forward.

## Getting More Data

The index requires at least 3 products with purchases in both the base and current periods. If you see the "Scan a few receipts" message, continue scanning receipts over time — the index will appear automatically once enough data is available.

Only receipts scanned with the camera (OCR) contribute to the index. Manually entered expenses and bank imports do not include product-level line items.

## Privacy

All price history is stored in your account on the server. It is not shared across accounts or used to build any shared product catalog. If you delete your account, all price history is deleted with it.
