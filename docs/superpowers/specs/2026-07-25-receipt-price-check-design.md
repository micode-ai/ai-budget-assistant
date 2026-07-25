# Receipt Price Check ("чек-контроль") — Design (v1)

> **Elevator pitch:** the moment a receipt is scanned, the app compares every line against what *you* normally pay for that product *in that store* and says "3 items cost more than usual, +12.40 zł — check the receipt." Actionable while the user is still standing at the register.

## Why this is defensible

Every other surface in the app tells the user about money they already spent. This one can hand money back. It is only possible because three things already exist together:

1. **Line-item receipt history** — `expense_items.canonical_name` + `unit_price`, populated by OCR.
2. **Per-product, per-store price series** — `PriceHistoryService.fetchRows` / `getProductTrends`, with `COALESCE(alias.canonicalName, item.canonicalName)` so the check inherits the user's own product renames and merges for free.
3. **A crowdsourced price corpus** — `CommunityPriceService`, k-anonymized, for "the usual price in this store" and "cheaper nearby".

A bank sees "Biedronka 154 zł". A retailer will never tell you a competitor is cheaper. A new entrant has no receipt corpus. There is no LLM in the hot path — the whole engine is deterministic arithmetic.

## Positioning constraint — read before writing any copy

**We cannot prove that a promotion was not applied.** If the receipt does not print a discount line, nothing in the data establishes that a promotion existed. The only claims the data supports are:

- "this line costs more than *you* usually pay for it in this store", and
- (when community reads are on) "more than the usual price in this store this week" / "cheaper nearby".

So the feature never says *"you were overcharged"* or *"the promo was not applied"*. It says **"more expensive than usual — check the receipt"**, and lets the user draw the conclusion at the register. A promo that silently failed to apply is the most common real cause, and this framing surfaces it without accusing anyone. Findings carry a `confidence` field so the UI can soften low-confidence ones further.

## Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| **Comparison baseline** | Personal price history is the core (works from day one, no gating); community prices are an optional booster behind the existing `COMMUNITY_PRICE_READ_ENABLED` kill-switch, degrading silently to personal-only. Same shape as Inflation Shield. |
| **Where it surfaces** | Inline in the scan response (so it reaches the app *and* all three bots through one funnel) **plus** a persisted `anomaly_alerts` row for history and the "found overpayments" counter. **No push** — a notification that arrives after the user has left the store has nothing actionable in it. |
| **False positives** | Conservative gates on existing data now, plus a new `size` field in the OCR prompt so accuracy improves over time. Forward-only, no backfill. |

### Non-goals for v1

- Per-litre / per-kilogram normalization. Sizes are compared for *equality* when both are known; a 1 L vs 500 ml comparison is dropped, not converted.
- Any claim about promotions, fraud, or cashier error.
- Shelf-price comparison (we have no shelf-price source).
- Acting on a finding (dispute flow, refund claim, "I got it fixed" tracking).
- Push notifications for this alert type.
- Backfilling `size` onto existing `expense_items`.

## Engine

New pure module `modules/price-history/receipt-check.util.ts`, sitting next to `basket-calculator.ts` and modelled on `inflation-shield.util.ts` — no IO, fully unit-tested.

```ts
checkReceiptPrices(input: {
  lines: { canonicalName: string; size?: string | null; unitPrice: number; quantity: number }[];
  history: ProductTrendRow[];         // the EXISTING type from price-history.service.ts, narrowed
                                      // by the caller to this merchant + lookback window
  merchantNormalized: string;
  currencyCode: string;
  community?: CommunityBaseline[];    // present only when reads are enabled and k-anon passes
  config: ReceiptCheckConfig;
}): ReceiptCheckFinding[]
```

**Duplicate lines are grouped first.** A receipt often lists the same product twice. Lines are grouped by `canonicalName` (+ `size` when known), quantities summed, and the unit price taken as the quantity-weighted average — so one product yields at most one finding.

Baseline = the **median** of prior prices for that product in that same store within the lookback window. Median, not mean, so a single promo-priced purchase in the history cannot depress the baseline enough to manufacture a finding.

A finding is emitted only when every gate passes:

| Gate | Default | Why |
|---|---|---|
| `LOOKBACK_WEEKS` | 12 | older prices are a different price regime, not a baseline |
| `MIN_POINTS` | 2 | one prior purchase is not "what you usually pay" |
| `MIN_RISE_PCT` | 15 | below this it is noise and ordinary fluctuation |
| `MAX_RISE_PCT` | 100 | above this it is almost certainly a different pack size — drop it and log |
| `MIN_AMOUNT` | 1.00 | do not nag about 20 groszy |
| same `merchantNormalized` | — | a Lidl price vs a Biedronka price is a different store, not an overcharge |
| same currency | — | never compare prices across FX (Inflation Shield precedent) |
| `MAX_FINDINGS` | 5, ranked by amount | the card must not become a wall of text |

*(This table originally had a `size` equal-when-known gate row here. It was removed — see **Correction — the `size` field was never added** below.)*

`overpaidAmount = (paidUnitPrice − baselineUnitPrice) × quantity`, in the receipt's currency.

All gates are env-tunable as `RECEIPT_CHECK_*` with defaults in an exported `RECEIPT_CHECK_DEFAULTS`, mirroring `SHIELD_DEFAULTS`.

**Weighted goods work naturally:** for 0.437 kg of tomatoes the receipt's `unitPrice` is per kilogram and `quantity` is the weight, so comparing unit prices is already the correct comparison. No special case needed.

**Community booster** (only when `COMMUNITY_PRICE_READ_ENABLED` is on *and* the store clears k-anonymity): adds a second baseline — the store's usual price this week — and a "cheaper nearby" hint. When the switch is off, or the product/store is below k, the booster contributes nothing and the personal path stands alone. Building this in now rather than later means the graceful-degradation path is exercised from day one instead of being retrofitted.

## Hook points — one pure function, two call sites

### 1. Inline, at scan time

`buildReceiptExpense` is called from four places, and `accountId` is already in scope at all of them (`ocr.service.ts:565`, `:625`, `:709`). Rather than thread a parameter into the private method — and rather than leave four call sites to remember — introduce:

```ts
private async finalizeReceipt(parsed, categories, accountId): Promise<ReceiptExpense>
```

which does `buildReceiptExpense` + the price check, and convert all four call sites to it. The single funnel is preserved, so a fifth scan path added later gets the check automatically.

The check is **fail-silent**: if it throws, the scan still returns the receipt with an empty findings array. A price comparison must never break receipt scanning. Precedent: `GeocodingService` is fail-silent inside this same service.

`ScanReceiptResponse` gains `priceFindings: ReceiptCheckFinding[]` — always present, empty when there is nothing to say (an absent field and an empty array are different things for the clients). The three bot `photo.handler.ts` files add one summary line to their reply; they already route through the same scan, so this costs almost nothing.

**Performance — do not call `getProductTrends` here.** That method reads the account's entire item history and builds a series for every product ever bought; running it on every scan is unacceptable. Add a narrowed sibling over the same private `fetchRows`:

```ts
getProductTrendsFor(accountId, canonicalNames: string[], merchantNormalized: string, since: Date)
```

scoped to the products on *this* receipt, that store, and the lookback window. `fetchRows`'s select widens to carry `size`.

### 2. Post-create, for persistence

At scan time the expense does not exist yet, so there is no `expenseId` to build a dedup key from. Persistence therefore happens in a new detector `detectPriceOvercharge`, fired from `AnomalyService.checkExpense` alongside the existing four, reading `expense_items` from the database. Because the engine is deterministic, both passes reach the same conclusion.

This second path also covers receipts saved through the bots. It skips expenses with no `expense_items` carrying a `canonicalName`, which excludes imports and bank-notification stubs — neither has line items, so neither can be checked.

## Storage

- Alert type `'price_overcharge'` — a plain string in `anomaly_alerts.type`, **no migration** (precedent: `possible_merge`).
- Dedup key `overcharge:{expenseId}` — one alert per receipt, with all findings in the `params` Json. Insert and catch `P2002`, the module's existing convention.
- **No push.** The type is simply never added to the notification branch, so no new `NotificationType`, no new preference toggle, and no risk of a notification arriving when nothing can be done about it.
- No text stored in the database — the mobile app renders from `params` through `alerts.*`, matching how every other alert type works.
- Dismissal uses the existing `DELETE /alerts/:id`.

### The counter must stay honest

The inflation screen gains a line: **"found overpayments: 142 zł this year"** — the sum of `overpaidAmount` across these alerts. Deliberately *found*, not *saved*: we have no evidence the user went back to the register. Inflation Shield already learned this lesson the hard way and had to halve its estimate and label it an estimate; this feature avoids the problem by not making the claim in the first place.

## Correction — the `size` field was never added

This section originally planned `size?: string` on `ReceiptItem` plus a migrated, persisted `expense_items.size` column, on the premise that `canonicalName` strips per-unit pack size — which would make a 1 L and a 500 ml purchase of the same product look identical and require a separate field + equality gate to keep them apart.

**That premise was wrong.** The live OCR prompt (`ocr.service.ts`'s `canonicalName rules` block) already keeps per-unit size, fat/alcohol percentage, and flavour inside `canonicalName`, stripping only pack-quantity multipliers, codes, and PLU numbers — e.g. `"MLEKO 3,2% ŁACIATE 1L 6SZT"` → `"Mleko Łaciate 3,2% 1L"`. Different pack sizes are therefore already different products and never match each other in `groupReceiptLines` or the history lookup, so no `size` field, migration, or gate was ever necessary. The field and gate were built anyway per this spec's original (mistaken) premise, were unreachable in production (nothing populated `size`), and were removed as dead code in a follow-up cleanup.

Per-litre / per-kilogram normalization — comparing a 1 L and a 500 ml price on a common unit instead of requiring an exact size match — remains the real open follow-up; see **Follow-ups** below.

## Mobile and i18n

- `expense/receipt.tsx` confirmation screen: a card above the form — "3 items cost more than usual · +12.40 zł" — expanding to rows of product / paid / usual / difference. It never blocks the save and never edits the amounts. The user is deciding whether to walk back to the register, not correcting bookkeeping.
- Alerts screen: a new `price_overcharge` card rendered from `params`.
- Inflation / price-history screen: the "found overpayments" total.
- `receiptCheck.*` keys across all 9 locales. Copy reviewed against the positioning constraint above — no locale may phrase it as an accusation.

## Edge cases

| Case | Behavior |
|---|---|
| E2EE (tier-2) account | `expense_items` are encrypted at rest, so there is nothing to compare — return zero findings silently. Not an error. |
| Thin history | Empty findings array, no card. |
| Same product on two receipt lines | Grouped before comparison; at most one finding per product. |
| Pack size changed (1 L → 500 ml) | Caught by `MAX_RISE_PCT` when the jump is large, and by the size gate once both sides have a stored size. Some middle-sized cases will still slip through — this is the acknowledged residual risk, mitigated by the soft copy. |
| Community reads disabled | Personal-only, silently. |
| Check throws | Scan succeeds with empty findings (fail-silent). |
| Import / bank-notification expense | Skipped — no line items to check. |

## Testing

- Pure function: every gate in isolation (min points, min rise, max-rise cap, min amount, merchant mismatch, currency mismatch, size mismatch, size unknown on one side), median baseline including the promo-in-history case, duplicate-line grouping with weighted average, top-N ranking, community booster on and off.
- Detector: dedup by `expenseId`, no alert when findings are empty, expense without line items skipped, no push emitted.
- OCR service: findings present in the scan response, empty (not absent) on thin history, scan still succeeds when the check throws.
- `getProductTrendsFor`: scoped to the requested names/merchant/window — a regression guard against someone "simplifying" it back to `getProductTrends`.
- i18n completeness across all 9 locales.

## Deploy notes

- One additive nullable column (`expense_items.size`) plus the mobile SQLite `ALTER TABLE`. Author the migration DB-free via `prisma migrate diff` — migrations run against prod from the deploy `migrator`, there is no local DB.
- No migration for the alert type.
- New optional env vars, all with defaults: `RECEIPT_CHECK_MIN_POINTS`, `RECEIPT_CHECK_MIN_RISE_PCT`, `RECEIPT_CHECK_MAX_RISE_PCT`, `RECEIPT_CHECK_MIN_AMOUNT`, `RECEIPT_CHECK_LOOKBACK_WEEKS`, `RECEIPT_CHECK_MAX_FINDINGS`. The feature works with none of them set.
- `AiModule` must import `PriceHistoryModule` explicitly to inject `PriceHistoryService`. Verified cycle-free: `PriceHistoryModule` imports only `SubscriptionsModule`.

## Follow-ups

- Per-litre / per-kilogram normalization, which would let differing pack sizes be compared instead of dropped — the same gap that already blocks community-price exact matching, so it is worth solving once for both.
- Turning findings into a dispute/refund-claim flow, and only then a real "saved" counter.
- An AI chat tool ("did I overpay for anything last week?") — the engine is already a pure function, so this is a schema plus a dispatcher entry.
- Re-evaluating the `MAX_RISE_PCT` cap once `size` coverage is high enough to carry the discrimination on its own.
