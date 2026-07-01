# Landing pricing page — design

## Goal

Add a dedicated, SEO-indexable `/pricing/` page to the ai-budget.pl static marketing landing (`docs/marketing/landing/build_landing.py`), so the app's real subscription tiers (Free/Pro/Business) have a linkable, crawlable page instead of being described only in a FAQ blurb.

## Scope

Static landing site only (`docs/marketing/landing/build_landing.py` + generated `site/`). No changes to the mobile app, API, Stripe products, or the `Currency` enum. Pricing content mirrors the real values in `apps/api/src/modules/subscriptions/subscriptions.service.ts` (`PRICING` table, `AI_REQUEST_LIMITS`, `MEMBER_LIMITS`, account-limit guard) — confirmed against the live Stripe product data (12 prices per product across USD/EUR/PLN/GBP/UAH/RUB).

## Page structure

Follows the existing `about_page(lang)` pattern (own function, own content dict, built into all 9 languages, same header/footer/consent scaffolding):

1. **Hero**: H1 ("Simple, transparent pricing" / localized) + subhead noting the 7-day free trial on Pro, no card required (matches existing in-app trial copy).
2. **Monthly/Yearly toggle**: pure-CSS segmented pill using the same `:checked` sibling-selector trick already used for the feature-card lightbox (two radio inputs, no JS). Toggling swaps which price (`.m-price`/`.y-price`) is visible per card.
3. **3-column pricing grid** (Free / Pro / Business — 1 column on mobile, same breakpoint as `.grid`). Each card:
   - Icon badge (reusing `.card .ic` style) + tier name
   - One-line subtitle
   - Big price number + `/month` or `/year`, toggled by the CSS switch
   - CTA button (`.btn.p` style) linking to `https://app.ai-budget.pl`
   - Checkmark feature list (new small checklist style, consistent site typography)
   - Pro card gets a "POPULAR" badge + highlighted border, in the site's orange (`#F58320`) rather than the reference screenshot's blue
4. **FAQ section** — one combined section (not two), extending the existing homepage "is it free?" Q&A with 2-3 pricing-specific questions (cancel anytime, what happens after trial, currency/billing).
5. **Closing CTA band**, same style as the homepage's.

Visual style: matches ai-budget.pl's existing light background / white cards / orange accent theme — NOT the dark navy/blue theme of the eksiegowyai.pl reference screenshot. Only the *layout* (icon badge, tier header, big price, checkmark list, POPULAR badge, toggle, CTA button) is adopted from that reference.

## Feature content per tier

Sourced directly from existing product code/copy (no invented claims):

**Free** — Full expense & budget tracking, receipt/voice capture, bank import, Telegram/WhatsApp/Slack bots, up to 3 accounts, 1 member per account, 50 AI requests/month.

**Pro** ($9.99/mo, $95.88/yr) — Everything in Free, plus 300 AI requests/month, up to 5 accounts, up to 5 members per account, predictive analytics (Spending Story, Fat Finder, AI Insights), anomaly detection, unlimited currencies.

**Business** ($19.99/mo, $191.88/yr) — Everything in Pro, plus unlimited AI requests, unlimited accounts, unlimited members, advanced reporting.

## Currency mapping (per language)

| Lang | en | pl | de | es | fr | ru | ua | be | nl |
|---|---|---|---|---|---|---|---|---|---|
| Currency | USD | PLN | EUR | EUR | EUR | RUB | UAH | USD | EUR |

Values taken verbatim from `PRICING` in `subscriptions.service.ts` (confirmed to match live Stripe prices). `be` (Belarusian) has no BYN in the supported `Currency` enum and no corresponding Stripe price, so it falls back to USD display — confirmed with the user as the intended behavior (adding real BYN billing support is out of scope; would require a separate Currency-enum + Stripe-catalog change).

**Known drift risk**: this is a hardcoded snapshot of `PRICING`. If the backend pricing table changes, the static page needs a manual re-sync — same accepted risk pattern as other content mirrored onto the static site (e.g. blog feature lists).

## URL / nav / footer / SEO wiring

- New `pricing_url(lang)` helper: `/pricing/` for `pl` (default), `/{lang}/pricing/` for the other 8 — mirrors `about_url()`.
- New `PRICING_LABELS` dict for nav/footer link text per language (e.g. "Pricing" / "Cennik" / "Preise" / …).
- Linked from header nav (next to About) and footer `f-links`, same conditional inclusion pattern as the About link.
- Full hreflang alternates (9 langs + x-default=en), canonical URL, OG/Twitter meta — same shape as `about_page()`.
- Add per-tier `Offer` JSON-LD entries (extends the existing `SoftwareApplication`/`FAQPage` JSON-LD graph) for potential rich-result pricing display.
- New `pricing_page(lang)` function wired into `build()` in the same loop style as the About page loop.

## i18n content

Real, hand-written copy (not machine-placeholder) in all 9 languages for: H1/subhead, toggle labels, 3 tier subtitles, ~10 feature bullets, CTA label (reusing existing `cta_primary` strings where applicable), POPULAR badge label, and 3-4 FAQ pairs. Same authorship pattern as the existing `ABOUT`/`CONSENT` content dicts already in `build_landing.py`.

## Out of scope

- Mobile app / in-app subscription screen changes.
- Stripe catalog changes (no new prices/products).
- Adding BYN (or any currency) to the `Currency` enum or `PRICING` table.
- A monthly/yearly toggle anywhere outside this one static page (no backend API change).
