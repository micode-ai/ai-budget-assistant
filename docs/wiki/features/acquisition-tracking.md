# Acquisition tracking

*Hub: [mobile-app](../mobile-app.md) · [admin-dashboard](../admin-dashboard.md)*

## What this is

Joining a click on the marketing site to the signup it caused, without an analytics SDK in the
product. The link carries the attribution; the client stores it on first arrival; registration
sends it; the admin reports on it.

## Entry points

- `docs/marketing/landing/build_landing.py` — `app_url(loc, lang, plan)`, `play_url(...)`, the GA4
  tracker template
- `docs/marketing/seo/build_blog.py` — `app_url(loc, lang, src)`, and `to_html()`'s rewrite of the
  bare Play URL written in article prose
- `apps/mobile/src/services/attribution.{ts,types.ts,web.ts,native.ts}` — `parseAcquisition`,
  `captureAcquisition`, `captureReferralCode`
- `apps/mobile/index.js` — calls the capture **before** expo-router mounts
- `apps/mobile/src/services/auth.api.ts` — attaches it to registration
- `apps/api` — `User.acquisition{Source,Location,Language,Plan}`, `acquisitionReferrerRaw`;
  `GET /admin/analytics/acquisition`; the admin `/acquisition` page

## Key concepts

**The link carries it.** Every link into the app is tagged `?src=&loc=&lang=(&plan=)`. `loc` uses
the GA4 tracker's own vocabulary (`nav`, `hero`, `band`, `pricing_card`, `footer`, `cta`) so the
click and the signup describe the same section.

**Capture is first-touch and happens before routing.** `index.js` reads the query string into
`localStorage` before expo-router owns the URL. First touch wins and is never overwritten — this
records where a visit *started*, and is explicitly not cross-session attribution.

**Attachment is in the API layer, not the store.** `auth.api.ts` attaches the value, so
`/auth/register` and `/auth/google` both carry it by construction — a Google signup never passes
through `register()` and would otherwise read as unattributed.

**Storage is four flat nullable columns**, not JSON, because the admin needs `groupBy` and Prisma
cannot group on JSON. `NULL` is a legitimate "unknown" for every pre-existing user and every native
install, and must not be backfilled.

**Android installs carry it through the Play Install Referrer.** A legacy Old-Arch native module
reads it once on first launch into MMKV; the bootstrap then PATCHes `/users/me/acquisition` once
per install behind a flag. `parseAcquisition` needed no change — Play delivers the same
`utm_source`/`utm_medium` shape the fallback already reads.

## Invariants

**Validate charset and length, never an allow-list of the values we emit today.** An allow-list
would make the first new section name marketing invents fail every registration that carries it.
Losing a signup's attribution is acceptable; losing the signup is not. The web capture drops a
malformed value for the same reason.

**`utm_*` is an all-or-nothing fallback**, used only when our own tags produced nothing at all — a
record must not mix `src=landing` with someone else's medium. `utm_source` is required, since
`utm_medium=referral` says how but not from where.

**`normalizeTag` folds unsafe characters to a dash and truncates rather than dropping.**
`utm_source` is conventionally a hostname, and a dot would fail the safety check — so a strict
guard silently discarded every directory referral (`startupfa.me`).

**First-touch is enforced in SQL, not read-then-write.** `updateAcquisition` is a single
`updateMany` filtered on `acquisitionSource: null`, so two concurrent calls cannot race.

**`acquisitionReferrerRaw` is evidence, not a label.** It carries no charset guard, is never
indexed, never grouped, and has no admin UI — it exists to be read by hand when a source needs
explaining.

**Keep identity claims untagged.** `SAMEAS`, JSON-LD `downloadUrl`/`sameAs` and the GA4 tracker's
Play constant use the bare URL. The tracker detects a store click by prefix, which a tagged URL
would still satisfy, but those fields assert "this is our listing" rather than funnelling a click.

**One delegated capture-phase listener, never an `onclick` per anchor.** The markup comes out of a
dozen separate f-strings, so a per-link attribute would have to be threaded through all of them and
re-added by whoever writes the next section; intent is read off `href` plus nearest section instead,
which covers new sections for free.

**Do not re-check consent inside the tracker.** `window.gtag` exists only once the consent loader
has run, and that runs only on `granted` — so a declining visitor is a structural no-op with no
second copy of the rule to drift.

**Do not modernise `function g(){dataLayer.push(arguments);}`.** gtag.js tells its own commands
apart by type; pushing a real array instead of `arguments` is silently discarded. That exact bug
existed in a sibling project.

**A referral code is captured only alongside `src=referral`.** `ref` is a common parameter name and
at least one directory links to us as `?ref=peerpush`, which satisfies the code shape exactly —
without the gate, first-touch-wins then kept it over a real friend's later link.

## Known gaps

- The product itself is otherwise unmeasured: `app.ai-budget.pl` serves no analytics and the mobile
  app has no analytics SDK. Web telemetry exists but is a separate, narrower thing.
- **`not-set` is a Play install that reached the listing through an untagged link (checked
  2026-11-09).** All 32 `not-set` signups since September carry exactly
  `utm_source=(not%20set)&utm_medium=(not%20set)` from the Play Install Referrer, so they are
  Android installs, not web visits; none came through a shared account or a referral, one through
  an expense group. Play Console's own split for the same 28 days — 13 "Google Play explore", 20
  "Paid and direct", 3 not attributed — matches our `google-play` (organic search/browse) vs
  `not-set` ratio, so `not-set` is Play's "direct": someone followed a bare
  `play.google.com/...?id=com.budget.assistant` link. It is the best-activating source (22 of 32
  logged a transaction, against 6 of 18 for `google-play`) and skews ru/ua, which fits links shared
  in chats and social posts. Bare Play links we control and could tag: the receipt-split guest page
  (`receipt-split/helpers/guest-page.ts`), the group guest page (`groups/helpers/group-guest-page.ts`),
  directory listings, social bios and community posts.
- No internal-traffic filter (needs the office IP).
- **What the outside consoles can and cannot answer (checked 2026-11-09, last 28 days).**
  *GA4* covers only the marketing site and only visitors who accepted the consent banner: 11
  users, 21 sessions, 7 `consent_accept`, 3 `cta_click` from one person, 0 key events — too thin to
  judge pages or CTAs; Search Console (`gsc-snapshot.yml`) is the better read of organic reach.
  *Play Console* is the one source for the Android top of funnel and for native stability: 3.1K
  store impressions → 109 listing visitors → 37 install clicks → 36 acquisitions → 18 first opens →
  1 device retained at day 7; listing conversion ~20%; no user-perceived crash or ANR; DAU/MAU at or
  above the Finance peer median; 13 ratings averaging 5.0 with no new review since 2026-08-25
  (the [store-rating-prompt](store-rating-prompt.md) has produced none). Half of all installs never
  open the app, so the leak starts before signup. In the same window the database shows 11
  `google-play` signups of which 2 logged a transaction.
- The landing and blog generators do not forward `?ref=` through their CTAs, so a referral routed
  via the marketing site loses the code.

## History

ABA-434 (GA4 events — the property had `config` and zero `event` calls, so the Key events report
was permanently empty) · ABA-436 (link tagging and capture) · ABA-452 (the admin read surface) ·
ABA-486 (referral links) · ABA-492 (`utm_*` fallback) · ABA-553 (Play Install Referrer) ·
ABA-584 (the 90-day check: 30 signups since ABA-436, only one NULL after the Install Referrer
shipped — native rows now read `not-set`/`google-play`, so "native stays NULL" is no longer true) ·
ABA-685 (`plan` and `billing_period` verified populating on `cta_click`/`plan_select`; no NULL source since 09-24).
