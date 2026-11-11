# Gazetka match — design

Status: draft for owner review · 2026-11-11

## Intent

Poles flip through supermarket promo leaflets (gazetki) on their phones looking for discounts on
things they buy anyway. Doing that across three or four chains every week is tedious, and the
leaflet does not know what *you* buy. The app does: it has every product from the user's scanned
receipts, how often they buy it and what they usually pay.

Gazetka match closes that gap. The user shares a few leaflet screenshots with the app and gets back
only the promotions that match their own usual purchases, with the usual price next to the promo
price and one tap to put the item on the shopping list. Users who opt in to sharing also feed a
community promo layer, so other users with the same product in their basket get told about the
promotion without having to share the leaflet themselves.

Why this shape: the owner wants the data source to be **free and legal**. Research (2026-11-11)
found that every chain's site terms forbid commercial reuse of their content (Biedronka §9.1, Dino
§3, Żabka 3.11, Lidl's shop terms), Kaufland blocks bots with a captcha, Carrefour's robots.txt
opts out of AI crawlers, aggregators (blix, gazetki.pl, ding.pl) hold their data under agreements
with the chains and forbid bots, and nobody offers an API or open feed. Prices as facts are not
copyrighted, so facts that a user brings to us are fine. The feature is therefore built only on
what users themselves share.

## Goals

- A user who looks at a leaflet on their phone can turn it into "what here is for me" in under a
  minute: screenshots → share → matches.
- Single-player value from day one. The feature must be useful with zero other users; the
  community layer is a bonus, not a precondition.
- Matched items show usual price vs promo price and can go to the shopping list in one tap.
- Opted-in users contribute promo facts (product, promo price, chain, validity dates, conditions)
  to a community promo layer; a promo confirmed by several independent people is pushed to other
  users who regularly buy that product.
- Phone (Android share sheet, in-app picker) and desktop web (≥1024, drag-and-drop) ship together.

## Non-goals

- The app never fetches leaflets itself: no scraping of chain sites or aggregators, and no
  server-side download of a URL the user pastes (that would be our server collecting from the
  chain's site again). Only files the user sends.
- No leaflet catalog or browsing. We do not show promotions on products the user does not buy.
- No storage or republishing of leaflet images, layout or artwork. Images are processed and
  discarded; only extracted facts persist.
- No string-similarity matching (edit distance, token overlap). Matching is closed-set by the
  model (see Matching).
- No per-kg / per-litre normalization in v1 (`canonicalName` keeps pack size; matching stays
  exact).
- No native iOS work (there is no iOS app; the PWA gets the web upload path).
- No partnership integration with chains in v1. That is a separate business track the owner may
  pursue in parallel; if a chain later grants a feed, it plugs in as another fact source.

## Anti-goals (failure even if it "works")

- Telling a user something is on sale when it is not. A missed match is acceptable; a false one
  is not. All copy frames promo prices as "according to a leaflet, check in store".
- Nudging people to spend. Copy compares to what they usually pay; it never says "buy now" or
  "don't miss out".
- Anything that looks like republishing a chain's leaflet (images, page layout, full item lists
  for products the user does not buy).
- A community layer that a single person (or a scripted ring) can poison with fake promotions.

## User flow

### Phone (Android)

1. The user is in the Lidl / Biedronka app or a browser, takes 3–5 screenshots of interesting
   pages, selects them in the gallery and taps Share → AI Budżet. A PDF of the whole leaflet,
   when the chain offers one, works too.
2. Shared images today go straight to the receipt scanner (`share-to-capture`). A shared batch
   now first shows a one-tap chooser: **Receipts** / **Promo leaflet**. *(Builder's call how to
   remember the last choice; the chooser must not slow down the existing receipt path more than
   one tap.)*
3. The leaflet screen opens immediately and fills page by page as each page is read: header
   "Lidl leaflet · valid until Sun 16.11" (chain and dates from the leaflet; editable if the model
   could not read them), then the list of matches. Each row: product, promo price, "usually
   7.49 → 4.99", any condition ("with Lidl Plus", "from 2 pcs"), and an **Add to list** button.
4. No matches → an honest "nothing from your usual purchases in this leaflet". Pages the model
   could not read are reported as such, not silently dropped.
5. An in-app entry point (shopping list screen: **Check a leaflet**) opens the same flow with the
   system multi-image picker, for users who do not think of the share sheet.

### Desktop web (≥1024) and narrow web

Same screen; input is a multi-file upload, plus drag-and-drop onto the screen on desktop. The
desktop layout follows the established desktop design language (aba-web-designer owns it). There
is no share sheet on web.

### Community push

When a community promo (see below) becomes confirmed and matches a product in a user's usual
basket, **and the user has shopped at that chain in the last 90 days** (merchant history), that
user gets a push. Promos carry no region: leaflets vary by region and format, so the push copy
always says "check in your store", and region bucketing is deferred until we see wrong-region
complaints. *(My call.)* Example push: "Masło Łaciate 200g −35% in Biedronka until Sunday (you usually pay
7.49)". At most one promo push per user per day, batched if several match; deduped per
(promo, user) through the existing push dedup ledger pattern used by restock pushes. Users can
turn these pushes off in notification settings.

## Matching

- **The basket.** A product is in the user's usual basket when its resolved name
  (`COALESCE(alias, canonicalName)`) appears on receipts at least twice in the last 90 days, or it
  is an unchecked item on one of their shopping lists. *(My call on the thresholds; tune later.)*
- **Closed-set matching (owner decision).** Two independently generated `canonicalName`s rarely
  match literally (receipt abbreviations vs marketing names), so matching is done by the model
  against a closed list: each page call is sent the user's basket names as a numbered list, and
  for every leaflet item the model returns either the index of the basket product it is, or
  nothing. It is never asked for or allowed to return a name, id or new product — the same
  pattern `chat-spending-questions.md` uses for its semantic filter. An out-of-range or malformed
  index is dropped, never guessed.
- **The prompt rules for "same product"**: same product type and brand when the basket name has a
  brand; pack size must match when both sides state one (200 g butter is not 400 g butter); when
  unsure, no match. A missed match is acceptable, a wrong one is not.
- **Leaflet items still get a `canonicalName`** by the same rules as receipt OCR (reuse the OCR
  prompt's canonicalName rules block, do not write a second copy) — it is what the community
  layer stores, and what other users' basket lists are matched against for pushes (see below).
- **Basket size cap**: the 150 most frequent basket products, to bound prompt size. *(My call.)*
- Unmatched leaflet items for the user are not shown; the count per leaflet is logged (no names).
- **Usual price** is the median of what this user paid for that product in the last 90 days, any
  store, in the leaflet's currency only (no FX conversion of a promo comparison).

## Reading a leaflet

- New endpoint in the AI module, alongside `POST /ai/scan-price-tag` and in its spirit: its own
  service (not `OcrService`), one model call per page, output treated as untrusted and normalized
  by a pure, tested function (null missing / mistyped / absurd fields; drop a "regular" price that
  is not above the promo price; an all-empty page is "unreadable").
- Per item it extracts: product name, canonicalName, promo price, regular price if printed,
  currency, condition (loyalty card, multi-buy, coupon), and per-item validity if it differs from
  the leaflet's.
- Per leaflet: chain (normalized the same way as receipt merchants) and validity dates.
- **Cost: a separate leaflet page budget (owner decision)**, not the general monthly AI limit, so
  leaflets can never starve receipt scanning. Monthly pages: **Free 20, Pro 200, Business 500**,
  env-tunable *(numbers are my call)*. Counted per user, reset with the AI-usage month. Hitting
  the budget mid-leaflet stops the remaining pages and opens the existing paywall sheet with
  leaflet-specific copy (same handling as a 403 in the receipt share queue).
- **Page cap: 10 per share**, matching the native share-intake cap of 10 files
  (`ShareIntakeModule.kt`). Extra pages are reported as dropped. *(My call.)*
- **Images** are downscaled before base64 through `receiptImage.ts`, as for receipts and price
  tags. **PDFs** are rendered to pages on the server (`ReceiptPdfService.renderToPngs`, whose
  default `maxPages = 4` must be raised for this path), so the page cap and the per-page metering
  are enforced on the server for PDFs. The native 10 MB PDF limit stands; a larger leaflet PDF is
  rejected with a "share screenshots instead" message. *(My call.)*
- Images are not stored on the server or the device beyond processing.

## Community promo layer

- Opt-in through the **existing** community contribution consent; no second consent toggle.
  Contribution follows the same eligibility rules as Community Price Map (account age, real
  expense count, one key per person, daily/weekly rate limits failing closed).
- A **separate table** from `community_price_observations`: a promo is a time-boxed claim, not a
  paid price, and it has no server attestation. Fields: chain, canonicalName, promo price,
  currency, condition, valid-from, valid-to, contributorKey, ingest time. No account id, user id,
  image or location.
- **Exposure by consensus.** A promo is "confirmed" only when at least K distinct contributors
  reported the same (chain, canonicalName, promo price, validity window), **of whom at least 2
  are `trusted`** (the Community Price Map definition: tenure or Stripe-paid, never a comp).
  Default K = 3, env-tunable, with the same test-period override approach Community Price Map
  used. **Do not reuse the footprint correlation clustering here**: honest people sharing the same
  leaflet produce near-identical footprints by construction, so it would collapse them into one
  cluster and nothing would ever confirm. The trusted-contributor requirement plus the
  per-contributor rate limits are the anti-poisoning measure. *(My call.)*
- **Consent wording.** The existing consent (`User.contributeCommunityPrices`) was given for
  receipt prices. Its copy is extended to mention leaflet promotions, and users who opted in
  before this feature see a one-time notice; until they have seen it, their leaflets do not
  contribute. *(My call.)*
- **Personal leaflet results are kept per account until the leaflet's validity ends**, so the
  user can reopen "this week's Lidl leaflet" and so their own unconfirmed promos stay visible to
  them. Pruned after `valid-to`. Unconfirmed promos are never shown to anyone else. *(My call.)*
- **Admin uploads are fully trusted (owner decision).** A leaflet uploaded by an account in
  `ADMIN_EMAILS` — from the app or from the admin dashboard — confirms its promos immediately,
  without waiting for K contributors. Identified through the existing `ADMIN_EMAILS` check
  (`admin-emails.util.ts`), never a hard-coded address. Admin uploads do not consume a page
  budget and do not require the community consent.
- **Admin uploads are not bound by the app's share limits.** The 10-page / 10 MB caps above
  exist because of the Android share sheet and the user page budget; the admin page accepts a
  whole leaflet PDF (up to 60 pages and 50 MB, env-tunable) and renders every page on the server.
  Pages are read in the background with progress shown, since a full leaflet takes a while.
  *(My call on the numbers.)*
- **Admin dashboard page "Leaflets"** (`apps/admin`): upload images or a PDF, pick or confirm the
  chain and validity dates, review the extracted items in a table (edit a name, price or
  condition, delete a wrong line), then **Publish**. Nothing is pushed before Publish. The publish
  step shows how many users would be notified. The page also lists published leaflets with an
  **Unpublish** action, which withdraws their promos (pushes already sent cannot be recalled).
  Only extracted facts are stored; the uploaded images are discarded after extraction, as
  everywhere else. The owner enters facts only — never copies leaflet artwork.
- **Push matching for community promos** uses the same closed-set approach in reverse: for each
  user whose basket may contain a confirmed promo's product, the promo's `canonicalName` is
  matched against that user's basket list by the model, batched per user per day. *(Builder:
  choose the batching; the rule is closed-set and "when unsure, no match".)*
- Expired promos (`valid-to` in the past) are never pushed and are pruned.
- Gated behind its own env flag, default OFF, so the single-player feature can ship first and the
  community layer turns on once enough leaflets flow.

## Access, tiers, accounts

- **Available on every tier**, metered by the separate leaflet page budget (see Reading a
  leaflet). Community promo pushes are free. *(My call, replacing the earlier "Pro unlocks all
  chains" idea: the user brought the leaflet, so gating their own matches feels hostile.)*
- Viewers may use it — reading a leaflet writes nothing; **Add to list** follows the shopping list's
  own rules.
- Accounts at `encryptionTier >= 2` are excluded: tier 2 encrypts item prices
  (`ENCRYPTION_FIELDS`), so the server cannot compute the usual price to compare against. They
  see a message saying exactly that, consistent with how chat treats them.
- The basket is the current account's.

## Legal guardrails (binding on implementation and copy)

- Never fetch content from a retailer or aggregator site, by URL or otherwise.
- Never persist or display leaflet images; only facts.
- Never show a promotion for a product the user does not buy (no catalog).
- Copy in all 9 languages frames prices as reported by a leaflet and to be checked in store.
- The community layer stores no image and no identity.

## Success after 3 months *(my call — owner to adjust)*

- ≥ 15% of monthly active Android + web users share at least one leaflet a month.
- ≥ 40% of leaflet shares produce at least one match.
- ≥ 20% of shown matches are added to the shopping list.
- Community layer: confirmed promos exist every week for the three largest chains (Biedronka,
  Lidl, Kaufland).

## Telemetry

Product telemetry is web-only (`telemetry.ts` is a native no-op), so the success metrics are
measured **server-side**: the leaflet endpoint records per-read counters (pages read / unreadable
/ dropped, matches returned, entry point, platform) with no product names; Add to list is
attributed through a `source` marker on the created shopping-list item; the push records sends,
and opens are counted when the app calls back with the push id. Web telemetry additionally gets a
`gazetka` flow, keeping the mobile unions equal to the server validator's lists
(`web-telemetry.md`). *(My call.)*

## Left to the builder

- Data model details, endpoint names, migration.
- How the chooser remembers the last choice, and its exact placement in the share-intake queue.
- Desktop layout (aba-web-designer spec first).
- Whether the per-page reads run sequentially or with small parallelism, within the AI limit
  accounting.
- i18n keys (all 9 locales), user docs section, What's New entry, wiki page under
  `docs/wiki/features/`.

**Known gap (final review, R13):** the user cannot correct a misread chain or validity dates of
their own leaflet — only read it again. Reopening a leaflet from the screen's idle state (the
account's active leaflets) was built instead; editing is deferred as cosmetic. Admin leaflets
remain editable in the dashboard.

## Related

`features/share-to-capture.md`, `features/shopping-list.md` (price-tag scan, restock pushes, dedup
ledger, receipt reconciliation), `features/personal-inflation-index.md` (canonicalName, aliases),
`features/community-prices.md` (consent, eligibility, clustering), `features/upgrade-paywall.md`
(AI limit), `features/receipt-image-memory.md`.
