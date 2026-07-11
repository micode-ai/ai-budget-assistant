# Community Price Map (ABA-335) — Sybil resistance & the read go-live gate

Status: **read path is DARK** (`COMMUNITY_PRICE_READ_ENABLED=false` by default). This
note is the checklist that must be satisfied before flipping it on for real users.

## Why the read is gated

The corpus is crowdsourced across all accounts and its only privacy guarantee is
k-anonymity: a (product, store, region, week) price point is exposed only when
`≥ K` distinct `contributorKey`s back it (`K` default 5). `contributorKey =
sha256(salt : accountId)`.

The gate counts **distinct accounts**, and an attacker controls the write path:
`POST /expenses` accepts client-supplied `merchant`, item `canonicalName`,
`location`, `currencyCode`, `date` — no OCR is required. So an attacker who
registers `K-1` accounts and posts matching fabricated receipts can:

1. **Manufacture a fake "cheapest store"** — surface a nonexistent store/price
   nationally to every Pro subscriber.
2. **Deanonymize a real below-K observation** — pad a victim's hidden data point
   past K, then read back `medianPrice`/`minPrice` and solve for the one unknown.

A bare distinct-count threshold cannot stop an adversary who mints identities.

## Defenses shipped (raise the cost; do NOT fully solve it)

| Layer | Where | Effect |
|---|---|---|
| Read kill-switch (default off) | `readEnabled()` | The whole read surface returns empty until explicitly enabled. **This is the safety net.** |
| Consent opt-in (default off) | `recordContribution` | Only opted-in accounts contribute. |
| Receipt-source gate | `RECEIPT_SOURCES` | Only OCR / bot-photo-scanned expenses feed the corpus — a hand-typed / API-posted expense can't inject free text. |
| Contributor eligibility | `isEligibleContributor` | Account must be ≥ 7 days old **and** have ≥ 15 real tracked expenses (both env-tunable). Forces a Sybil fleet to simulate sustained real usage per identity, not just register + wait. |
| Multi-week persistence | `aggregateCommunityPrices`/`aggregateCommunityMap` + service lookback | A store is exposed only if backed across ≥ `COMMUNITY_MIN_PERSISTENCE_WEEKS` distinct weeks (default 2) over an 8-week lookback — blocks a single-week burst of K throwaway accounts. The displayed price still comes only from the requested 1w/4w period. |
| Label-length caps | `MAX_LABEL_LEN`, DTO `@MaxLength` | No oversized free text reaches the cross-account corpus. |
| One-vote-per-account-per-week | DB unique constraint | An account can't inflate its own weekly count. |
| Outlier filter + median | `aggregateCommunityPrices` | A single poisoned price can't move the displayed median. |
| Salted one-way `contributorKey` | `computeContributorKey` | Never leaves the server; the only contributor linkage. |

## Residual risk (the reason the read stays dark)

A determined, scripted attacker can still: create N accounts, age them, generate
≥15 plausible expenses each over 2 weeks, then coordinate matching contributions.
The eligibility gate makes this linearly more expensive per identity but does not
make it infeasible. Deanonymization of rare (product, store, region, week) cells
remains possible for an attacker who clears K with their own identities.

## To satisfy before `COMMUNITY_PRICE_READ_ENABLED=true`

Pick a policy (business/product decision — friction vs. corpus freshness):

1. **Trust scoring / min real-usage** — stronger than the current flat gate: weight
   by account tenure + verified activity (paid tier, linked bank import, push-token
   engagement), require a higher effective trust sum behind each exposed cell.
2. **Cross-account velocity / correlation detection** — flag clusters of accounts
   that contribute the same (product, store, region, week) in lockstep or share
   signup fingerprints (IP, device, timing); exclude flagged clusters from the count.
3. **Differential privacy** — add calibrated noise to displayed aggregates and/or a
   noisy K threshold, so reading back exact prices can't isolate one contributor.
   Strongest against deanonymization; costs some accuracy.
4. **Raise K and/or require multi-week persistence** — a cell must clear K across
   ≥ N distinct weeks, not a single burst. ✅ **SHIPPED** (multi-week persistence,
   default 2 distinct weeks over an 8-week lookback; raising K remains available
   via `COMMUNITY_PRICE_K`).

Recommended minimum before go-live: (4) multi-week persistence is now shipped, so
the remaining minimum is **(2) cross-account velocity / correlation exclusion**,
with **(3) DP noise** on the returned `median`/`min` if the read is ever made
broadly (non-Pro) available.

## Operational note

The write pipeline keeps filling the corpus while the read is dark (as long as
`COMMUNITY_PRICE_SALT` is set), so once the above lands there is already data to
serve. Nothing here changes the "no PII in the observation table" invariant —
verified by the egress audit (see issue ABA-335).
