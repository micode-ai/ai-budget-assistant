# Gazetka match (promo leaflets)

*Hub: [analytics-insights](../analytics-insights.md) · related: [shopping-list](shopping-list.md), [community-prices](community-prices.md), [share-to-capture](share-to-capture.md)*

## What this is

The user shares screenshots (or a PDF) of a store promo leaflet, the server reads the promo lines with the vision model and the app shows **only the promos on products this user already buys**, next to what they usually pay. Admins can upload a leaflet from the dashboard, review the rows and publish it; an opt-in **community layer** turns confirmed promos into a daily push for people who shop at that chain. Spec: `docs/superpowers/specs/2026-11-11-gazetka-match-design.md`; plan `docs/superpowers/plans/2026-11-11-gazetka-match.md`. Issue: [ABA-746](https://github.com/micode-ai/ai-budget-assistant/issues/784).

The server never goes and gets a leaflet. The user (or an admin) hands one in.

## Entry points

- API: `apps/api/src/modules/leaflets/` — `leaflets.controller.ts` (`/leaflets*`, user), `leaflets-admin.controller.ts` (`/admin/leaflets*`), `leaflet-reader.service.ts` (vision read), `leaflet-basket.util.ts` + `leaflet-basket.loader.ts` (basket, usual price, closed-set match), `leaflet-budget.service.ts` (page budget), `community-promo.service.ts` + `community-promo.util.ts` (contribute / confirm), `leaflet-promo-push.cron.ts` + `leaflet-push-match.service.ts` + `leaflet-notification-ledger.service.ts` (the push), `leaflet-prune.cron.ts`.
- Migrations: `20261112000000_leaflets`, `20261112010000_community_promos`, `20261112020000_leaflet_notification_log`.
- Mobile: `apps/mobile/app/leaflets/index.tsx` over `src/components/leaflets/` (`LeafletScreen` / `LeafletScreen.web.tsx`, `LeafletPhone`, `desktop/LeafletDesktop`), `src/features/leaflets/` (session, reader, consent notice, page helpers), `src/services/leaflets.api.ts`. Entry: the "Check a leaflet" button on the shopping list (`/leaflets?from=pick`, which opens the gallery at once on a phone), the Android share chooser ([share-to-capture](share-to-capture.md)), and the community push (`/leaflets?from=push`, which never opens the picker).
- Admin: `apps/admin/src/app/leaflets/page.tsx` and `components/leaflets/`.
- Settings: Notifications → "Leaflet promos" (`notifyLeafletPromos`); data settings → the existing community-prices consent.
- Ops: `docs/ops/leaflets.md`.

## Key concepts

**Basket.** Resolved names (`COALESCE(alias, canonicalName)`) bought at least twice in the last 90 days, plus unchecked shopping-list items that carry a `canonicalName`; the 150 most frequent. **Usual price** = median per-unit price the user paid in 90 days, any store, in the leaflet's currency only — no FX conversion.

**Closed-set match.** The model gets the numbered basket and returns an index or `null` per leaflet line; out-of-range, non-integer and duplicate indexes are dropped. "Same product" = same type, same brand when the basket name has one, pack size equal when both state one, unsure means no match. A product the user does not buy is never shown — there is no catalog view.

**Page budget.** Separate from the monthly AI limit: Free 20 / Pro 200 / Business 500 pages a month (`LEAFLET_PAGES_FREE|PRO|BUSINESS`), reset together with the AI-usage month. A single share is capped at 10 pages. A user PDF is capped by the app on its **encoded** size — `LEAFLET_PDF_MAX_BYTES` in `leafletPages.ts`, ~7.45 MB raw, so the base64 JSON body stays under the proxy's 10 MB with 64 KB to spare; the server keeps its own 10 MB raw check. When there are no pages left, `POST /leaflets/:id/pdf` refuses at once with 403 `LEAFLET_LIMIT` (admins exempt), so the PDF path opens the paywall like the image path.

**Admin leaflets.** Dashboard upload (60 pages / 50 MB, `LEAFLET_ADMIN_MAX_PAGES`, `LEAFLET_ADMIN_MAX_MB`) is read, reviewed row by row and published; publishing confirms the promos immediately. A PDF's pages are counted first (`countPages`, never in parallel with rendering), then rendered five at a time (`ReceiptPdfService.renderPageChunks`: one `pdftoppm -f/-l` spawn per chunk, each with its own 20 s timeout), and each chunk is read and released before the next is rendered, so a 60-page leaflet never sits in memory whole. A chunk that fails after some pages were read keeps those pages and counts the rest as dropped; a failure before any page was read fails the leaflet. A user listed in `ADMIN_EMAILS` reading a leaflet in the app is treated the same way (trusted, no budget, no consent).

**Community layer.** A promo is confirmed when at least K distinct contributors (`COMMUNITY_PROMO_K`, default 3), of which at least `COMMUNITY_PROMO_MIN_TRUSTED` (default 2) are trusted, agree on the same (chain, canonicalName, promoPrice, validFrom, validTo). No footprint correlation clustering. Contribution needs the existing `User.contributeCommunityPrices` consent; users who opted in before this feature contribute leaflets only after `leafletConsentNoticeAt` is set (the consent copy now mentions leaflets).

**The push.** A daily cron pushes confirmed promos that are **on today** — `validFrom <= today <= validTo`, compared as UTC `YYYY-MM-DD` — to users with `notifyLeafletPromos` on who bought at that chain in the last 90 days: at most one push a user a day, deduped per (promo, user) in the notification log. A leaflet read on Monday announces Thursday's promos; those wait for Thursday. Every line says until when the promo runs (`until DD.MM`, in all 9 languages). The free-text condition is taken only from an admin or a trusted row, never from a lone untrusted contributor. Tapping the push opens `/leaflets?from=push`: the idle state with the active list, never the photo gallery (R14).

**Reopening a leaflet (R13).** The idle state of the leaflet screen (phone and desktop) lists the account's active leaflets from `GET /leaflets` — chain, valid until, number of matches; a tap loads `GET /leaflets/:id` and shows its rows with the same Add to list. Leaflets with no page read (an abandoned run, a PDF that never reached the API) are hidden (`reopenableLeaflets`). The state lives in `useLeafletSession`, above the 1024 split.

**Year-less dates.** A leaflet date like `16.11` is read as the date nearest to now: more than 300 days in the past means next year, more than 300 days in the future means last year (a December leaflet read in January).

## Invariants

- **Never fetch a leaflet from a retailer or aggregator site.** No URL download, no scraping, anywhere. Input is only what a user or admin uploads.
- **Images are never persisted or displayed back** — only extracted facts are stored. On the device, the cache copies made by the share intake (and the downscaled JPEGs) are deleted on every exit: once the flow has read them, on cancel, on a failed run (R2). A new exit path must delete too.
- **Matching is closed-set.** An index into the numbered basket or `null`; no string-similarity fallback, ever.
- **The page budget is separate from the AI limit, and the 10-page cap is checked before the budget is consumed** (R1) so a refused share charges nothing. Admins skip the budget (R3), and their reads write no COGS row (R7).
- **The admin contributor key is derived per leaflet**, `computeContributorKey(salt, "<adminUserId>:<leafletId>")` (R11). A per-admin key made two leaflets by the same admin collide on the unique constraint, `skipDuplicates` dropped the second leaflet's rows, and unpublishing the first hid the second's promos. Admin rows confirm alone, so contributor identity buys nothing there.
- **A published admin leaflet is read-only**: unpublish first, then edit.
- **A stale `reading` leaflet expires after 30 minutes without progress** and is treated as failed (R12) — admin leaflets in `LeafletsAdminService`, personal ones in `LeafletsService` (`PERSONAL_STALE_READ_MS`, applied by `GET /leaflets` and `GET /leaflets/:id`). Progress is held in memory (`activeReads`) and every deploy force-recreates the api container, so an in-flight read would otherwise be stuck forever; a personal PDF refused by the proxy before it reached the API leaves the same `reading` orphan. The in-memory progress also assumes **one api instance**.
- **`COMMUNITY_PROMOS_ENABLED` defaults OFF.** With it off nothing contributes, confirms or pushes; admin publishes still write rows that wait for the flag. Rollback is the flag plus a force-recreate (`docs/ops/leaflets.md`).
- **The push has a 20-hour floor, not a calendar day** (R10). A literal 1-day window skips every other day for a cron that fires at 09:00 and drifts by seconds; 20 h survives drift and still gives at most one push a day. `notifyLeafletPromos` defaults to true on purpose (R9) — the whole layer sits behind the flag.
- **Tier-1 encrypted accounts never get the community push.** Their merchant is encrypted, so the "bought at this chain" match finds nothing and the user is skipped — it fails safe. Accounts at `encryptionTier >= 2` are refused in the reader with a message that the usual price cannot be computed.
- **In-app admin reads write rows with `adminLeafletId = null`**; unpublish withdraws by `adminLeafletId`, so it cannot withdraw those. Remove them by hand if one is wrong.
- **Copy** in all 9 locales says "according to a leaflet — check in store" and compares with what the user usually pays; never "buy now" or "don't miss out". Ru/ua/be say "газетка".
- Viewers may read a leaflet; Add to list follows the shopping list's own rules.
- **nginx**: the shared proxy caps bodies at 10 MB for `api.ai-budget.pl`. A user PDF fits under it by construction (the client's encoded-size cap); a 413 anyway — or, on web, an opaque `TypeError` on the PDF upload, since an nginx error carries no CORS headers — reads as "share screenshots instead" (`pdfUploadFailure`). Admin uploads still need the per-location limit in `docs/ops/leaflets.md` (applied only with the owner's OK).
- `LeafletsModule` is new and its DI graph has not been booted outside the unit tests — smoke it on the first deploy.

## Known gaps

- A failed page after a consume still costs the slot (a transient OpenAI error charges one page).
- Concurrent page uploads can race on the cap and `pageNo`; progress is per process.
- `pdf-parse`'s page-count call is unverified by integration; it falls back to the old behaviour.
- No iOS share and no web share (same as share-to-capture); web uses the drop zone.
- **The user cannot correct a leaflet's chain or dates.** A misread chain or validity stays as read; the user can only read the leaflet again. Admins can edit theirs in the dashboard. Deferred by R13 as cosmetic next to reopening.
- A reopened leaflet whose PDF read is still running shows a snapshot; it does not poll.
- `addedToListAt` is not returned to the app, so a reopened leaflet shows Add to list again on items already added (adding twice is harmless).

## History

[ABA-746](https://github.com/micode-ai/ai-budget-assistant/issues/784) — Gazetka match: reader, budget, community layer, push, admin upload (2026-11-11).
