# Community Price Map — anti-Sybil layer and go-live (ABA-642) — Design

Issue: #672 (ABA-642). Builds on ABA-335. Wiki: `docs/wiki/features/community-prices.md`,
`docs/wiki/features/receipt-price-check.md`. Prior checklist: `docs/superpowers/community-price-antisybil.md`.

## Goal

Make the "where's cheapest" corpus trustworthy enough to show to every user, then turn the read on.
The work is mostly closing holes that make the current Sybil gates easy to get around. Adding more
gates on top of them is secondary.

## Locked decisions

- **Reads are free on every tier once enabled.** The Pro gate goes, and so does every paywall entry
  point into this surface (see *Free reads*).
- **Privacy invariants do not move.** The observation table holds no accountId, userId, expenseId or
  user coordinate. `contributorKey` never leaves the server. Every trust signal is evaluated **at
  contribution time** and only a coarse boolean is stored.
- **Receipt price check copy rule still applies.** A community finding says "more than other
  shoppers usually pay here". It never says "overcharged" or "promo not applied".
- Signup-fingerprint velocity (IP/device/timing) stays **out**: it needs new data collection. Same
  as ABA-335.
- No DP noise. Why: see the threat table, row 5.

## What already exists, and the holes that make it weaker than it looks

Already shipped (ABA-335): consent opt-in, `RECEIPT_SOURCES` gate, eligibility (7 days / 15
expenses), one vote per account per cell-week, multi-week persistence (2 of 8 weeks), correlation
clustering (flag off), K=5, an outlier band of `[med/2, med×2]`, and the read kill switch (off).

Holes found while reading the code. Each one is fixed below:

1. **The "OCR only" gate is client-controlled.** `CreateExpenseDto.source` is a free `@IsString()`.
   Any client can `POST /expenses` with `source:'ocr'` and arbitrary `items[].canonicalName`,
   `merchant` and `location`. So the "scripted OCR uploader" needs no OCR at all. Bot text-expense
   handlers also use `source:'telegram'|'whatsapp'|'slack'`.
2. **The displayed price is not k-anonymous.** The K and persistence gates count over the 8-week
   lookback, but the median is taken over the *display* window. Take a store that cleared K over
   8 weeks and has one row this week: the `1w` view shows that single contributor's exact price.
   That lets **one malicious account set the displayed price of any established store**, and it
   leaks a single real user's price. `minPrice` is one contributor's exact value by construction.
3. **One person is many contributors.** `contributorKey = sha256(salt:accountId)`. Personal +
   business + trip accounts give one human three votes.
4. **User aliases inject free text.** `recordContribution` maps names through the user's
   `product_aliases`, which are user-typed renames, into the cross-account corpus.
5. **Store pins are last-write-wins, and they come from client GPS.** `communityStoreGeo.upsert`
   overwrites `lat/lng` on every contribution, so one account can move any store's pin. The
   coordinate is `expense.location`, which the app fills from `scannedReceipt.location ??
   gpsLocationRef` — the device's GPS at scan time, often the user's **home**. That is contributor
   location in a table that promises to hold none.
6. **Sync item updates re-contribute.** `expense-item.handler.ts` calls `recordContribution` on
   every item create/update, and the price is overwritten (`update: { price }`), so editing a line
   rewrites the vote.
7. **Backdating fakes persistence.** `weekStart` comes from the expense date, which the client
   chooses. A burst in one real week can claim two "distinct weeks".
8. **`searchProducts` is ungated in time.** It counts raw contributors over all time, with no
   clusters and no persistence, so it is the one place that can surface ring-made product names.

## Decisions — anti-Sybil mechanisms

### D1. Server-attested scans (closes holes 1, 4, 5, 6, 7 — the main change)

Only lines the **server's own OCR** read can contribute.

- `ReceiptFinalizerService.finalizeReceipt` issues `scanAttestation` on the `ReceiptExpense` when
  every **attestation gate** below passes. Otherwise it issues none, and the scan works exactly as
  today.
  - `COMMUNITY_PRICE_SALT` is set.
  - OCR `confidence >= COMMUNITY_MIN_OCR_CONFIDENCE_PCT/100` (default **80**). The finalizer
    defaults a missing confidence to 0.7, so "the model gave none" fails the gate on purpose.
  - **The line sum reconciles with the total.** It uses the same tolerance arithmetic as
    `buildCategorySplits`: Σ(net line totals) vs `total − deposit + discount`, within **5%**.
    Extract it as an exported `receiptTotalsReconcile()` in
    `apps/api/src/common/utils/receipt-category-split.ts`, called by `buildCategorySplits`, with no
    behaviour change. Mirror the extraction in `packages/shared-utils` (deliberately duplicated
    pair).
  - At least **2** priced lines with a `canonicalName` of 64 characters or less.
  - Merchant, receipt date and currency are present.
  - A **server-geocoded** store location exists. This is `buildReceiptExpense`'s Nominatim lookup
    of the printed address, never client GPS.
- **Token format:** `base64url(json) + "." + base64url(HMAC-SHA256(k_att, json))`, with
  `k_att = HMAC-SHA256(COMMUNITY_PRICE_SALT, "cp-scan-attest-v1")`. No new env var, and domain
  separation from the contributor hash. The JSON holds:
  - `v:1`
  - `u` (userId) and `a` (accountId). The token is bound to the caller and rejected for anyone
    else.
  - `iat`. Accepted for **24 h**.
  - `m` (normalized merchant), `c` (currency), `d` (receipt date), `t` (receipt time or null),
    `tot` (total in cents)
  - `loc: [lat, lng]` rounded to 4 dp. This is the store's geocoded point.
  - `h`: one 16-hex-character `sha256(canonicalName|quantity|totalPriceCents)` per attested line.

  The token holds only the caller's own data, so it is signed but not encrypted. It is never
  stored.
- **The client hands it back on create.** Add `scanAttestation?: string` (`@MaxLength(8192)`) to
  `CreateExpenseDto` and send it on the **first push only**, the same treatment as
  `receiptFingerprint` (ABA-603). An offline retry does not carry it, so that receipt simply does
  not contribute. Fail-safe, and it needs **no sync DTO change**.
  - Bots pass `receipt.scanAttestation` into their create DTO.
- **Contribution uses only attested data.** `recordContribution(accountId, userId, expenseId,
  scanAttestation)` verifies the token and then contributes only the saved items whose hash is in
  `h`. A line the user edited is not attested and is dropped; a line the user deleted is gone.
  - Merchant, location, date and currency come **from the token**, never from the expense row.
  - `source` is no longer consulted.
- **Aliases** are no longer applied, except that the `__ignored__` sentinel still excludes a product.
- **Remove both `recordContribution` calls** from `sync/handlers/expense-item.handler.ts`. Only
  `ExpenseCreatedHooksService` contributes, so an item edit can never re-vote.
- **Recency gate:** the attested receipt date must be within **[now − 14 d, now + 1 d]**.
  - Persistence across two weeks therefore requires the attacker to act across two real calendar
    weeks.
  - Shoebox back-scanning does not contribute. That is intended.

### D2. One contributor per human (hole 3)

`contributorKey = sha256(salt + ":u:" + userId)`. Eligibility moves to the user:
- `user.createdAt` must be at least 7 days ago.
- At least 15 non-deleted expenses with `userId` equal to the user, across all accounts.

Both env names are unchanged. A family sharing one account now counts as distinct humans. One
physical receipt still counts once, because of D4.

### D3. Trusted contributors and the exposure gate

At contribution time compute `trusted = tenure ≥ COMMUNITY_TRUSTED_TENURE_DAYS (60) OR
Stripe-paid`. Stripe-paid means an active paid tier **with** `stripeSubscriptionId`; reuse the comp
predicate from `admin-comped.util.ts`, because a comp is not a payment. Store `trusted` on the row:
- It is a coarse boolean, not identity.
- `contributorKey` already links the rows, and the table never leaves the server.

**A cell (store, or store × region on the map) is exposed only when all of these hold:**
- (a) **K = 5 distinct clusters** with at least one price **inside the display window, counted
  after outlier filtering**. This closes hole 2: the number shown is backed by at least K.
- (b) **At least `COMMUNITY_MIN_TRUSTED` (2) of those clusters are trusted.** A cluster is trusted
  if any member is.
- (c) The existing persistence gate: at least 2 distinct weeks in the 8-week lookback.

Why (b) and not a weighted sum: it states the guarantee plainly. *No cell can be created purely by
accounts younger than 60 days.* A fresh ring must either pre-age identities for two months or pay
Stripe per identity, each with a distinct card.

**Turn correlation on:** `COMMUNITY_CORRELATION_ENABLED=true` at go-live, with defaults
`minFootprint 5` and `Jaccard 0.9`. D4 means two people can no longer share one receipt, so the
remaining organic false-merge case is two household members with ≥90% identical 5+-cell footprints.
Merging those is harmless.

### D4. One physical receipt contributes once, from anyone

New table `community_receipt_seen(content_key PK, week_start)`, where
`content_key = HMAC(k_att, m|d|t|tot|sorted(h))`.
- It is inserted before the observation writes. P2002 means this receipt was already contributed
  (by anyone), so skip it whole.
- It has no account, user or contributor link.
- It stops one real receipt being photographed into N accounts.
- A weekly `@Cron` in `CommunityPriceModule` deletes rows with `week_start` older than 12 weeks.

### D5. Per-contributor rate limits

After all gates pass and before any write, call `CacheService.incrementWindow` on two windows:
- `cp:rl:d:{contributorKey}`: **6 receipts per 24 h**
- `cp:rl:w:{contributorKey}`: **20 receipts per 7 d**

These are receipts, not lines. A real household rarely scans more than 2–3 grocery receipts a day,
and back-scanning is already excluded by D1's recency gate. `incrementWindow` throws on a Redis
outage, so this **fails closed**: the receipt is skipped and a warning is logged. The keys hold the
server-side hash only and expire on their TTL.

### D6. Robust aggregation against the store's own data (pure, in `community-price-calculator.ts`)

1. **One value per cluster per cell.** Take the median of that cluster's rows in the display window.
   A ring that survived clustering still gets one vote per member, and a member's 4 weekly rows in
   `4w` stop being 4 votes.
2. **MAD filter** replaces `[med/2, med×2]`. Drop a cluster value `p` when
   `|p − med| > 3.5 × 1.4826 × max(MAD, 0.05 × med)`, the modified z-score from Iglewicz–Hoaglin.
   The 5% floor stops a store with a perfectly stable price (MAD = 0) from rejecting a legitimate
   one-cent change. Gate (a) counts clusters **after** this filter.
3. **Displayed price** is the median of the surviving cluster values. An attacker controlling
   fewer than half of a cell's clusters cannot move it outside the honest range.
4. **Cheapest-badge stability.** A store can be `isCheapest` only if
   `displayMedian ≥ (1 − COMMUNITY_CHEAPEST_MAX_DROP_PCT/100 [30]) × priorMedian`, where
   `priorMedian` uses lookback weeks *before* the display window and needs at least 3 clusters
   there.
   - The goal of a poisoning attack is a fake "cheapest store"; a sudden coordinated 30%+ drop does
     not earn the badge.
   - A real promotion week still shows its price, just without the badge.
5. **`minPrice` is no longer sent.** It becomes optional in the type. It was a single
   contributor's exact value.
6. **`contributorCount` is bucketed** to the floor of {5, 10, 20, 50}. The UI shows "5+ shoppers".
   An exact cluster count would let an attacker probe whether their ring was merged.

### D7. Store pins

- `community_store_geo` gets its coordinate **only from the token's server-geocoded `loc`**, never
  from the expense's client GPS.
- It is **create-only**: the upsert uses `update: {}`, so the first attested write wins and nobody
  can move an existing pin.
- A pin still shows only for a cell that cleared D3.

### D8. Product search

`searchProducts` limits itself to the 8-week lookback. It returns a product only when some region
has at least K distinct contributors, at least 2 of them trusted. `groupBy` adds `trusted`.

Search stays a cheap prefilter, so no clustering runs there: the full gate runs on selection, and a
hit that fails the full gate shows the existing `noResults`. This keeps product names minted only by
a ring out of autocomplete.

### D9. Scraping

The corpus is the moat and reads are now free, so add `@Throttle({ default: { limit: 60, ttl:
60_000 } })` on the three read routes. It uses the existing Redis `ThrottlerModule`.

## Threat table — what each attacker can still achieve

| # | Attacker | Before this design | After | Residual |
|---|---|---|---|---|
| 1 | **Single malicious account** (eligible) | Set the `1w` displayed price of any established store (hole 2). Post any text and price with `source:'ocr'` (hole 1). Move any store pin (hole 5). Inject alias text (hole 4). | Needs a forged receipt image per contribution, which costs AI quota. Gets one vote among at least 5 clusters, median + MAD. Cannot move pins or inject typed text. At most 6 receipts/day. | **Low.** Can add noise to cells where it is one of about 5. Cannot create a cell, move a median or squat a store pin (a pin needs k distinct agreeing contributors). Audit: a text-layer PDF or e-mail can no longer mint a token, so forged input must be an image or a scanned PDF. |
| 2 | **Ring of fresh accounts** (N each 7+ days old with 15 expenses, under 60 days) | 5 accounts manufacture a nonexistent "cheapest store", in one week if dates are backdated. | Cannot create any cell: gate (b) needs 2 trusted. Can shift an *existing* sparse cell's median only with at least as many unclustered members as honest clusters. Each member needs distinct baskets (to stay under Jaccard 0.9), forged images that pass confidence and reconciliation with a geocodable address, two real calendar weeks (recency), and AI quota. The badge-stability rule blocks a 30%+ fake drop from winning "cheapest". | **Low–medium in sparse cells.** A real store can be shown somewhat cheaper or dearer. No fabricated stores. Audit: persistence now counts the weeks rows were INGESTED (back-dated receipts written in one sitting are one week) and needs >= 2 distinct clusters; reads are refused unless correlation is on. |
| 3 | **Patient ring** (5+ aged 60+ days, or Stripe-paid) | Same as 2. | Can satisfy every gate. Cost: 60 days of pre-aging or 5 paid subscriptions on distinct cards, 15 plausible expenses each, and forged images every week inside the recency window. | **Medium, accepted.** This is the attack the system cannot rule out without identity collection. Detection is a follow-up (admin anomaly view). The token proves only "our OCR read this document", never that it is a genuine receipt. |
| 4 | **Scripted OCR uploader** (synthetic receipt images) | Unnecessary: the API accepted `source:'ocr'` directly. | Now the only way in. Bounded by `AiUsageGuard`'s per-tier OCR quota, D5 rate limits, D4 content dedup (no reusing one receipt), the 24 h token, D1 recency, confidence 80, and reconciliation. It is the *instrument* of rows 1–3, not a separate capability. | Folded into rows 1–3. |
| 5 | **Deanonymizer** (bracket a victim's value with K−1 controlled values) | Not needed: the `1w` view could show one user's price outright (hole 2), and so did `minPrice`. | Needs K−1 unclustered, eligible members (2 trusted) with forged scans in the same store-week. Exposure is counted after filtering; `minPrice` is gone; counts are bucketed. Even on success it reveals that *someone* paid the shelf price at a store that week — a public price with no identity or link. Audit: `receiptCount` is bucketed like `contributorCount`, one cluster adds at most 3 rows to it, and the scan-time baseline read is budgeted per user (30/h, fail closed, <= 100 products per scan) so it is not an unthrottled oracle. | **Low harm.** This is why DP noise is not worth the accuracy loss. |
| 6 | **Scraper** (free account) | n/a (Pro-gated, dark). | 60 req/min per user, ONE shared bucket across the three read routes; search term and product capped at 64 chars; search results cached 5 min. | Slow scraping possible; accepted. |
| 7 | **Token replay or sharing** | n/a | Bound to `u`+`a`, 24 h. D4 means a replayed receipt contributes once. | None. |
| 8 | **Location spoof** (real store's address printed on a forged receipt in another city) | Client GPS anywhere. | A geocodable printed address is needed, and a pin is published only once >= k distinct contributors' coordinates agree within 150 m (median), so one forged receipt cannot place or squat a pin. | Same bounds as rows 1–3; a ring of k can still agree on a wrong pin. |

## Security audit follow-up (ABA-642)

Fixes made after the post-implementation audit, before anything was deployed:

- **Inbound e-mail never attests.** `inbound-receipt-processor.service.ts` passes `{ attest: false }` on
  every OCR call and strips `scanAttestation` from the stored extraction. A text-layer PDF and plain
  text are NEVER attested on any route (`ocr.service.ts`); only an image scan or a rasterised (scanned)
  PDF may. The token proves "our OCR read this document", not that it is a genuine receipt.
- **Persistence on contribution time.** `community_price_observations.ingest_week` (Monday of the signed
  `iat`, set on create only) is what the >= 2 weeks gate counts, and those rows must span >= 2 clusters.
- **Store pins by consensus.** `community_store_pin_candidates` (one row per merchant, region,
  contributor); `community_store_geo` is written only when >= k distinct contributors agree within 150 m,
  at the median (`community-store-pin.ts`).
- **No exact counts.** `receiptCount` is bucketed; per-cluster weight capped at 3; the median is rounded to
  2 decimals after the filter.
- **Baseline oracle.** `getStoreBaselines` is budgeted per user (`cp:bl:{userId}`, 30/h,
  `COMMUNITY_BASELINE_READS_PER_HOUR`), fails closed, caps products at 100 and orders its 20,000-row cap.
- **Correlation required for reads** (`readEnabled()` = read flag AND correlation flag), with a startup warning.
- **Exact quantities.** Line hashes and the unit price use integer thousandths and cents, so OCR floats and
  the saved `Decimal(10,3)` cannot disagree.
- **Low:** receipt-seen key is `(merchant, date, time, total, line count)`; the rate limiter is spent only
  after the seen insert (and the seen row is released when refused); one shared read throttle key; a salt
  under 32 characters disables attestation with a startup warning.

## Schema changes

**Migration `20261011000000_community_prices_antisybil` (the `20261010000000` stamp is taken by
`add_inbound_mail`). It lands in the same commit as the `schema.prisma` change.**

**DEVIATION FROM THE ORIGINAL DRAFT (user decision): nothing is deleted.** The first draft
truncated `community_price_observations` and `community_store_geo`. The migration instead
keeps every row and excludes the old ones by construction:

```prisma
model CommunityPriceObservation {
  // ...existing fields...
  attested Boolean @default(false)   // existing rows = false = legacy, never aggregated
  trusted  Boolean @default(false)   // D3, computed at contribution time; not identity
  @@index([contributorKey, weekStart], map: "community_obs_contributor_week_idx") // buildClusterMap
}

model CommunityStoreGeo {
  // ...existing fields...
  attested Boolean @default(false)   // existing pins = false: kept, never overwritten, never shown
  @@unique([merchantNormalized, region, attested], name: "community_store_geo_key", map: "community_store_geo_key")
}

model CommunityReceiptSeen {               // D4 — no account/user/contributor link
  contentKey String   @id @map("content_key")
  weekStart  DateTime @map("week_start") @db.Date
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([weekStart], map: "community_receipt_seen_week_idx")
  @@map("community_receipt_seen")
}
```

- Every read (`getCommunityPrices`, `searchProducts`, `getCommunityMap`, `getStoreBaselines`,
  `buildClusterMap`) filters `attested: true`, so legacy rows can never enter an aggregate.
- Store pins: a new pin is written only from the signed token's server-geocoded `loc`, as an
  `attested = true` row, create-only (`update: {}`). `attested` is part of the unique key, so a
  legacy pin never blocks a real one and is never touched by any write. The map joins only
  `attested = true` pins.
- The legacy rows are inert data: unreachable from any API, and they age out of the 8-week
  lookback on their own. A later, separately approved cleanup can delete them.

## Backfill / re-score: keep, exclude, no re-score

Existing rows cannot be re-scored (no attestation, keyed per account, pins may hold home GPS), so
they are simply never read. Reads were dark, so nothing visible changes. The privacy concern about
legacy home-GPS pins is handled by never exposing them, not by deleting them.

## API changes

| Verb | Route | Guards | Change |
|---|---|---|---|
| GET | `/price-history/community` | `JwtAuthGuard + AccountContextGuard` + `@Throttle(60/min)` | **Drop** `SubscriptionTierGuard`/`@RequireTier('pro')`. The response omits `minPrice` and `contributorCount` is bucketed. |
| GET | `/price-history/community/products` | same | Drop the tier gate. Apply D8. |
| GET | `/price-history/community/map` | same | Drop the tier gate. D3 gate per store × region. Pins from D7. |
| POST | `/ai/scan-receipt` (+ PDF path) | unchanged (`AiUsageGuard`) | Response gains `scanAttestation?`. Request gains optional `communityBaseline?: boolean` (in both `ScanReceiptRequestSchema` copies: API `ai/utils/sanitize` and shared-utils). |
| POST | `/expenses` | unchanged | `CreateExpenseDto.scanAttestation?: string`. |

These are all read routes, so no `ViewerBlockGuard`. `CommunityPriceModule` drops its
`SubscriptionsModule` import if nothing else in the module uses it.

**Receipt price check — community fallback (wire it).**
- `checkReceiptPrices` already accepts `community?: CommunityBaseline[]`.
- Add `CommunityPriceService.getStoreBaselines(canonicalNames, merchantNormalized, lat, lng,
  currency)`. It returns `{canonicalName, medianPrice, currency}` only for cells that pass the full
  D3/D6 gate in the `4w` window at **the same store and region**.
  - Region uses the same `regionBucket(lat, lng, reverseGeocode)`; the geocode cache is
    `geocode_cache`.
  - It is cached 5 min under `cpbase:{sha1(merchant|region|currency)}`.
  - It is fail-silent: any failure returns `[]`.
- `runPriceCheck` passes it **only when** all of these hold:
  - `COMMUNITY_PRICE_READ_ENABLED` is true
  - the request carried `communityBaseline: true`. Only new app builds send it, so old builds,
    which would label it "you usually pay" / "two earlier purchases", never receive one.
  - a server-geocoded location exists.
- **Bots never request it.** Their `priceCheckSummary` says "above your usual price", and all three
  stay at parity by staying personal-only.
- **Community findings are inline-only.** `AnomalyService.detectPriceOvercharge` stays
  personal-only and never persists a community finding. A crowd baseline is weaker evidence than
  your own history. Document that the "both passes agree" invariant is scoped to `source:'personal'`.
- Same-store comparison keeps the copy honest: different chains legitimately price differently,
  so the baseline is never a cross-store figure.

## Free reads — everything that must change with the gate

- **API:** the controller guards (above). Update the controller and service doc comments that say
  "Pro-gated".
- **Mobile `communityPriceStore.ts`:** remove the three `403 → useUpgradeStore.show(...)` branches
  and leave a plain `console.warn`. Delete the now-unused `communityPrices.paywall` key in all 9
  locales.
- **`whatsNewEntries.ts`:**
  - Remove `tier: 'pro'` from `community-price-map`. The id is permanent, so keep the entry.
  - Add a new free entry `community-prices-live` (2 keys × 9). It ships **in the first app release
    after the flag flip**, never before, so the spotlight does not point at an empty screen.
- **`InflationIndexSection.tsx` banner:** verify that it shows no Pro badge or lock (none found).
- **`user_docs/*/40-inflation-shield.md`:** the line "comparing prices across other users … planned
  for a future update" is replaced with a pointer to community prices (9 locales).
- **`user_docs/*/36-personal-inflation-index.md`:** add a section on community prices. Cover that it
  is free, the opt-in, what "5+ shoppers" means, why a store may not appear yet, and that nothing is
  traceable to anyone. It is an existing help section, so no registration is needed, but run
  `npm run generate:help` and rebuild help/landing with `LANDING_BASE=
  ROBOTS="index,follow,max-image-preview:large"`.
- **Pricing/landing:** `pricing-data.json` and the `subscription.features.*` i18n do **not** list
  community prices. Checked: nothing to remove.
- **`docs/marketing/seo/content-plan.md`:** its honesty rule says "NOT claimed: community prices
  (dark in prod)". Update it **after** the flip. The file is gitignored territory, so use
  `git add -f` if it is tracked that way.
- **`docs/en|ru/API.md`, `ARCHITECTURE.md`:** they mention community prices. Update the guard and
  the free tier wording.

## Mobile / UI / i18n

- **`useReceiptScanner`:**
  - It sends `communityBaseline: true`.
  - `useReceiptSave` passes `scannedReceipt.scanAttestation` to `addExpense`.
  - `expenseStore.addExpense` forwards it on the first push only, beside `receiptFingerprint`.
    Web gets it on the same deploy.
- **`PriceFindingsCard.tsx`:** when `f.source === 'community'`:
  - label `receiptCheck.othersUsually` ("others usually pay here") instead of `usually`;
  - show `receiptCheck.communityBaseline` ("based on anonymous prices from other shoppers at this
    store") instead of `lowConfidence`;
  - the subtitle uses `receiptCheck.cardSubtitleCommunity` ("About {{amount}} more than usual
    here — worth checking the receipt.") when any finding is community.
  - Every language: no "overcharged", no "promo not applied".
- **`app/price-history/community.tsx`:**
  - Default period goes from `'1w'` to `'4w'`, because gate (a) now holds within the window and
    `1w` will be sparse.
  - `backedBy` becomes `'{{receipts}} receipts · {{contributors}}+ shoppers'` in all 9 locales.
  - Add a **contribute CTA card** above the search when `!user.contributeCommunityPrices`, with
    title, body and a button that flips the same consent as `DataSettings`. That is 3 keys. The
    corpus restarts empty, and consent is opt-in, so this drives supply.
  - `aba-designer` owns the card.
- **i18n total:** 8 new keys (3 `receiptCheck`, 3 `communityPrices` CTA, 2 whatsNew) × 9 = 72, plus
  1 changed key and 1 removed key, in all 9 locales.

## Rollout

1. **Pre-check (ops, read-only, needs user approval for SSH):** confirm `COMMUNITY_PRICE_SALT` is
   set in `/opt/ai-budget/.env.production`. If it is unset, nothing has ever been contributed and
   nothing will be.
2. **Merge and deploy** the API, migration (non-destructive) and web. Reads stay **off**.
   `COMMUNITY_CORRELATION_ENABLED` is not yet set.
3. **Release the Android build** that sends `scanAttestation` and `communityBaseline`. Until users
   update, only web and the three bots contribute; old native builds contribute nothing, by design.
4. **Fill period: at least 3 weeks**, because of persistence, K-within-window and the 2-trusted
   gate. Readiness is this read-only SQL: the number of
   `(canonical_name, merchant_normalized, region)` cells over the last 4 weeks with ≥5 distinct
   `contributor_key` and ≥2 `trusted`. **Flip when there are at least 50 such cells in at least one
   region.**
5. **Flag flip (ops, needs explicit user approval):** on the VPS set
   `COMMUNITY_PRICE_READ_ENABLED=true` and `COMMUNITY_CORRELATION_ENABLED=true` in
   `.env.production`, then run
   `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api`.
   A plain `docker restart` does not reload env.
   - Verify: a free test account gets 200 on `/price-history/community/products?q=ml` with
     non-empty results.
   - **Rollback:** set the flag back to `false` and force-recreate. Nothing caches while the flag
     is off.
6. Ship the app release with the `community-prices-live` spotlight. **The What's New entry (and its nine
   i18n objects) is NOT in the codebase until this step**: web deploys on every push while reads are off, so
   shipping it earlier would point users at an empty screen. Add it in the same change that flips the flag.
   Also: `COMMUNITY_PRICE_READ_ENABLED` alone is now refused — reads need `COMMUNITY_CORRELATION_ENABLED=true`
   too (the API logs a startup warning otherwise), and `COMMUNITY_PRICE_SALT` must be >= 32 characters. Update the marketing honesty
   rule, the wiki and `community-price-antisybil.md` (status: live, residual = threat rows 2–3).

## Build order

1. **`packages/shared-types`** (aba-backend-engineer):
   - `CommunityPriceStore.minPrice?` becomes optional;
   - `scanAttestation?` on the scanned-receipt type and on the create-expense DTO;
   - `ReceiptCheckFinding` is unchanged (`source` already exists).
2. **`packages/shared-utils`:**
   - `ScanReceiptRequestSchema.communityBaseline?`;
   - mirror the `receiptTotalsReconcile` extraction.
3. **`schema.prisma` + migration `20261011000000_community_prices_antisybil`** (aba-db-engineer):
   **one commit**.
4. **API:**
   - **a.** (aba-ai-engineer) `scan-attestation.util.ts` (sign/verify/hash, pure) in
     `community-prices/`; the finalizer issues tokens; `receiptTotalsReconcile` extraction;
     `communityBaseline` request plumbing; `runPriceCheck` community fallback.
   - **b.** (aba-backend-engineer) `CreateExpenseDto.scanAttestation`; `onExpenseCreated` passes it;
     rewrite `recordContribution` (D1, D2, D3, D4, D5, D7); remove the sync-handler calls;
     calculator D6; service D3/D8; `getStoreBaselines`; prune cron; controller ungate + throttle;
     the three bot photo handlers pass the token and never request the community baseline.
   - **c.** (aba-stripe-engineer) review the tier-gate removal; confirm no `TIER_REQUIRED` path
     remains for this surface.
5. **Mobile** (aba-mobile-engineer; aba-designer first for the CTA card and finding-row variant):
   - scanner and save plumbing;
   - `communityPriceStore` paywall removal and 4w default;
   - community screen CTA and copy;
   - `PriceFindingsCard`.
6. **i18n**, all 9 locales.
7. **Docs:**
   - user_docs (36, 40) in 9 locales, then `generate:help`;
   - `docs/en|ru` API/ARCHITECTURE;
   - wiki `community-prices.md` and `receipt-price-check.md`; rewrite `community-price-antisybil.md`.
8. **Rollout steps 1–6** (aba-devops-engineer for steps 1 and 5, user-approved).

## Edge cases

- **Shared account:** contributions are keyed by the *scanning* user. The same receipt scanned by
  two members dedups via D4.
- **E2EE account:** still skipped.
- **Consent revoked:** future contributions stop. Past rows are unlinkable by design, as today.
- **User edits the date or merchant before saving:** the token's values are used, because the token
  holds what the receipt says. If the OCR'd date was wrong, the 14-day recency check uses the OCR
  date. Acceptable.
- **Multi-currency receipt:** a single `c` per token. The majority-currency rule applies at read.
- **Salt rotation:** invalidates outstanding tokens, D4 keys and contributor keys. That is a clean
  break, as before.
- **Redis down:** D5 fails closed (no contribution) and reads still work. The geocode cache is in
  Postgres.
- **Scan hot path latency:** `getStoreBaselines` adds one indexed query plus a cached reverse
  geocode, and only when the flag and request ask for it. It is fail-silent.
- **Infra:** a new Redis key-space `cp:rl:{d,w}:*` (TTL-bounded, tiny), a new small table with a
  weekly prune cron, and a new index. No memory or container changes.

## Testing

- **`scan-attestation.util.spec.ts`:**
  - round trip;
  - tampered payload or signature;
  - expired (over 24 h);
  - wrong `u` or `a`;
  - no token when the salt is unset;
  - an edited line's hash does not match.
- **Finalizer:** no token for confidence below 0.8, a missing confidence (0.7 default), a
  reconciliation miss over 5% (the discount and deposit cases from the split spec), fewer than 2
  lines, no geocode, or GPS-only location.
- **`receiptTotalsReconcile`:** the existing `receipt-category-split.spec.ts` stays green; there is
  a parity case for the shared-utils mirror.
- **`recordContribution`:**
  - no token means no write;
  - only intersected lines are written;
  - merchant, location and date come from the token, not the expense row;
  - recency outside 14 d means skip;
  - D4 P2002 means skip the whole receipt;
  - the rate limit hits on the 7th receipt in a day;
  - `incrementWindow` throwing means skip and log a warning;
  - `trusted` true at 60 d tenure, true when Stripe-paid, **false when comped**;
  - the user-keyed `contributorKey` is the same across two accounts of one user;
  - aliases are not applied, but `__ignored__` is honoured;
  - store geo is create-only (a second write does not move it).
- **The sync item handler** no longer calls `recordContribution`. Update
  `expense-item.handler.spec.ts`.
- **Calculator (pure):**
  - one value per cluster;
  - the MAD filter, including MAD=0 with the 5% floor;
  - **a store with 5 lookback contributors but 1 in-window contributor is NOT exposed** (the hole-2
    regression);
  - gate (b) with 5 fresh clusters means not exposed;
  - badge stability on a 35% drop means no badge but the price is shown;
  - `contributorCount` bucketing;
  - no `minPrice`.
- **Egress:** the response objects never contain `contributorKey`, `trusted` or `weekStart` per row.
  Snapshot the key set.
- **Controller:** a free-tier user gets 200 (no `TIER_REQUIRED`); the throttle is applied.
- **Receipt check:**
  - community findings only with the flag on, `communityBaseline: true`, same store and region,
    same currency;
  - a personal history of 2 or more points wins over community;
  - the detector stays personal-only; extend `receipt-check.util.cross-path.spec.ts` to assert the
    scope.
- **Bots:** all three never request the baseline.
- **Mobile:** `communityPriceStore` has no paywall call on 403; `PriceFindingsCard` community copy
  is rendered on a device (there is no RN render harness); there is an i18n key-parity check across
  9 locales.
- **Manual:** scan a real receipt on web, then check the DB for a row with `trusted` and with no
  identity columns, and check `community_store_geo` equals the printed-address geocode.

## Required pre-merge reviews

- `aba-security` audit — **Required.** This adds a new HMAC token scheme on the AI/OCR scan
  surface, changes the privacy-bearing write path and contributor-key derivation, and exposes a
  cross-account corpus to every tier. Verify:
  - the token binding;
  - that no identity reaches `community_price_observations`, `community_receipt_seen` or
    `community_store_geo`;
  - egress;
  - the throttle.
- `aba-devops-engineer` review — **Required.** It covers the new Redis key-space `cp:rl:*`, the
  destructive TRUNCATE migration (needs user approval), the new weekly cron, and the production env
  flip with force-recreate (rollout steps 1 and 5, user-approved).

## Follow-ups

- An admin view for corpus health: exposable cells, the cluster merge rate, and cells whose median
  moved more than 30% week over week. This is detection for threat row 3.
- A community line in bot replies, which needs its own `shared-messages` key in 9 languages.
- Revisit opt-in by default. That is a product and privacy decision, not this issue.
- Per-litre/kg normalization and non-PL merchant normalization (existing gaps).

## Out of scope

- Signup-fingerprint or velocity collection (IP, device, timing).
- Differential-privacy noise.
- A free "teaser" tier with hidden prices. Reads are simply free, per the user's decision.
- Persisting community findings as anomaly alerts.
- Any change to `RECEIPT_CHECK_ALERTS_ENABLED`.
