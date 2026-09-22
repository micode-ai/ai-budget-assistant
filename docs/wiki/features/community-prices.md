# Community Price Map

*Hub: [analytics-insights](../analytics-insights.md)*

## What this is

A crowdsourced, **k-anonymized** "where's cheapest" grocery database built from all accounts' OCR'd
receipt line items — a data moat with a network effect. Opt-in, Pro-gated to read, and currently
**dark in production** behind a kill switch.

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

## Invariants

**The write path is fire-and-forget and fail-silent** — it never throws into its caller, and logs a
warning only.

**`GeocodingModule` is imported, never re-provided.** A previous version provided a second
`GeocodingService`, silently splitting the instance-level Nominatim throttle.

**`contributorKey` never leaves the server.**

**Both read routes are Pro-gated** and additionally behind `COMMUNITY_PRICE_READ_ENABLED`, which
defaults **OFF** — the surface stays dark pending anti-Sybil validation.

**Only OCR and bot-photo scans contribute.** A client-supplied merchant and canonicalName on a
manually created expense must not reach the corpus.

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

## Known gaps

- **These measures raise the Sybil cost; they do not solve it.** The remaining go-live checklist —
  validate and enable correlation, decide on signup-velocity collection, optionally add DP noise —
  is in `docs/superpowers/community-price-antisybil.md`, and it is what keeps reads off for real
  users.
- Community prices are implemented and unit-tested as a fallback baseline for
  [receipt-price-check](receipt-price-check.md) but **not service-wired**, for the same reason.
- No per-litre/kg normalization: `canonicalName` keeps pack size, so matching is exact-only.
- Merchant normalization is PL-biased, which fragments non-PL stores.

## History

ABA-335 (M1–M4, and the security audit whose findings became the invariants above).
