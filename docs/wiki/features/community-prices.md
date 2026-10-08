# Community Price Map

*Hub: [analytics-insights](../analytics-insights.md)*

## What this is

A crowdsourced, **k-anonymized** "where's cheapest" grocery database built from all accounts' OCR'd
receipt line items — a data moat with a network effect. Opt-in, **free to read on every tier** (ABA-642), and
**dark in production** behind the `COMMUNITY_PRICE_READ_ENABLED` kill switch (default OFF).

## Entry points

- `apps/api/src/modules/community-prices/` — the module
- `community-price-calculator.ts` — `aggregateCommunityPrices`, `aggregateCommunityMap`
- `community-price-correlation.ts` — `distinctClusterCount`
- `community-price.util.ts` — `regionBucket`, `mondayOfWeek`
- `apps/mobile/app/price-history/community.tsx`

Migrations: `20260711000000_add_community_price_observations`,
`20260711000001_add_community_contribution_pref`, `20260711000002` (store geo).

## Key concepts

**Consent is opt-in and off by default**, settable from the data-settings screen.

**The observation table holds no identity.** No accountId, no userId, no expenseId, no user
coordinates — only a POS-derived `region` and a one-way `contributorKey = sha256(salt:accountId)`.
Contribution is **skipped entirely** when the salt env var is unset.

**The unique across `(canonicalName, merchantNormalized, region, weekStart, currencyCode,
contributorKey)` IS the one-vote-per-account-per-week dedup** and the anti-poisoning measure.

**k-anonymity.** A store is exposed only when at least K distinct contributors back it, with an
outlier drop outside `[median/2, median×2]`, a majority currency, and cheapest-first ordering.

**The store map is a separate table.** The observation table deliberately holds no coordinates, so a
`community_store_geo` lookup — holding only the STORE's public coordinate — is populated
fire-and-forget from the same write path. A pin shows only for a cell that already cleared K, so a
single-user or home-mislabelled coordinate cannot surface.

## Anti-Sybil layer (ABA-642)

Spec: `docs/superpowers/specs/2026-10-09-community-prices-anti-sybil-design.md`. Migration
`20261011000000_community_prices_antisybil`.

- **Only server-attested scans contribute.** `ReceiptFinalizerService` issues `scanAttestation`
  (HMAC token, 24 h, bound to user+account, `scan-attestation.util.ts`) only when OCR confidence
  >= 80, the line sum reconciles with the total (`receiptTotalsReconcile`), >= 2 named lines, and a
  server-geocoded store exists. The client hands it back on the FIRST `POST /expenses` only.
  `recordContribution` takes merchant/location/date/currency from the token and writes only lines
  whose hash is in it; `expense.source` is no longer read. Price = attested total / quantity, never
  the client `unitPrice`. The sync item handler no longer contributes.
- **One contributor per person**: `contributorKey = sha256(salt:u:userId)`; eligibility counts the
  user's expenses across all accounts. `trusted` (tenure >= 60 d or Stripe-paid, never a comp) is
  stored as a boolean.
- **One receipt once**: `community_receipt_seen(content_key)`, pruned weekly. **Limits**: 6/day and
  20/week per contributor via `incrementWindow`, failing closed.
- **Exposure**: >= 5 clusters inside the display window after the MAD filter, >= 2 trusted, and 2
  distinct weeks; one value per cluster; `minPrice` removed; `contributorCount` bucketed 5/10/20/50;
  no cheapest badge after a >= 30% drop.
- **Legacy rows are kept, never read** (`attested = false`); store pins are create-only and
  attested-only.

## Invariants

**Never filter reads without `attested: true`.** Pre-ABA-642 rows are still in the tables.

**The write path is fire-and-forget and fail-silent** — it never throws into its caller, and logs a
warning only.

**`GeocodingModule` is imported, never re-provided.** A previous version provided a second
`GeocodingService`, silently splitting the instance-level Nominatim throttle.

**`contributorKey` never leaves the server.**

**The read routes are free (no tier guard), throttled 60/min per user, and behind `COMMUNITY_PRICE_READ_ENABLED`, which
defaults **OFF** — the surface stays dark pending anti-Sybil validation.

**Only attested scans contribute.** A client-supplied merchant, canonicalName or `source` must not
reach the corpus.

**Contributor eligibility is enforced**: an account at least seven days old with at least fifteen
real expenses, both env-tunable.

**Multi-week persistence gates exposure.** A store is shown only if backed across several distinct
weeks over an eight-week lookback — the price still comes from the requested period. This is what
blocks a single-week burst.

**Correlation clustering counts distinct CLUSTERS, not accounts.** Near-identical broad-footprint
contributors are union-find clustered so a scripted ring collapses to one. Conservative thresholds,
and the flag defaults **OFF** until validated.

**Signup-fingerprint velocity is deliberately NOT done.** IP, device and timing data would be new
collection, and `contributorKey` is one-way by design.

**The read cache key is case-exact**, and the read `weekStart` is upper-bounded.

**Label lengths are capped** at both the util and the DTO.

## Audit hardening (ABA-642)

Carried: only an image scan or a scanned PDF may attest (never plain text, a text-layer PDF or anything from inbound e-mail); reads need BOTH `COMMUNITY_PRICE_READ_ENABLED` and `COMMUNITY_CORRELATION_ENABLED`; persistence counts `ingest_week`, not the receipt week; a store pin needs k distinct agreeing contributors (`community_store_pin_candidates`); `receiptCount` is bucketed; the scan-time baseline read is budgeted per user and fails closed; `COMMUNITY_PRICE_SALT` must be >= 32 chars. Detail: `docs/superpowers/specs/2026-10-09-community-prices-anti-sybil-design.md`, "Security audit follow-up".

## Known gaps

- **These measures raise the Sybil cost; they do not solve it.** The remaining go-live checklist —
  validate and enable correlation, decide on signup-velocity collection, optionally add DP noise —
  is in `docs/superpowers/community-price-antisybil.md`, and it is what keeps reads off for real
  users.
- The receipt-price-check fallback is wired (`getStoreBaselines`) but only runs with the read flag on.
- No per-litre/kg normalization: `canonicalName` keeps pack size, so matching is exact-only.
- Merchant normalization is PL-biased, which fragments non-PL stores.

## History

ABA-335 (M1–M4, and the security audit whose findings became the invariants above) · ABA-642 (server-attested scans, one key per person, consensus store pins, ingest-week persistence, free reads; existing rows kept and excluded by `attested`).
