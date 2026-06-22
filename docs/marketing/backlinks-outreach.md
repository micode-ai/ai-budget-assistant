# Outreach Drafts — paste-ready copy for the manual (Tier 3) backlinks

The directory listings live in `backlinks.md` (ready-to-paste cards). This file covers the
**manual outreach** that the kit only sketched: press pitches, community posts, and canonical
reposts. Track each in `backlinks-tracker.csv`.

**Honesty rules (read first):**
- On Reddit/Quora/forums you are the **maker** — disclose it. Undisclosed self-promo gets removed and burns the brand. A one-line disclosure ("I built this") is fine and usually welcomed.
- Lead with genuine value; the app is a footnote, not the headline.
- Never paste the same text twice in the same community. Reword.
- Respect each sub's self-promo ratio (often the "9:1" rule) and weekly-promo threads.

**Fresh assets to point at (beyond the homepage):**
- Multilingual blog, 15 guides × 9 languages: `https://ai-budget.pl/blog/en/`
- Public help center: `https://ai-budget.pl/help/en/`
- Web app (no install): `https://app.ai-budget.pl`
- Deep links that read as "useful resource" (better than the bare homepage for context):
  `…/blog/en/best-budgeting-apps/`, `…/blog/en/shared-budget-for-couples/`, `…/blog/en/import-bank-statement/`

---

## 1. Polish press / editorial pitch (email or DM)

Targets: antyweb.pl, spidersweb.pl, geex.pl, mamstartup.pl, my-company.pl, Telepolis.
Find the right editor (kontakt / redakcja page) and keep it short. One outlet = one tailored opener.

**Temat:** Polski startup: aplikacja do budżetu z asystentem AI (9 języków, wspólne budżety rodzinne)

**Treść:**
Dzień dobry [Imię],

piszę z MICODE sp. z o.o. — jesteśmy polskim studiem, które zbudowało **AI Budget Assistant**, aplikację do zarządzania finansami osobistymi z asystentem AI.

Krótko, dlaczego może zainteresować [nazwa redakcji]:
- Wydatki dodaje się **głosem**, **zdjęciem paragonu** (OCR czyta kwotę, datę i sprzedawcę) albo zwykłym zdaniem do czatu AI — koniec z ręcznym wpisywaniem.
- **Wspólne budżety rodzinne**: każdy domownik dodaje wydatki ze swojego telefonu do jednego widoku na żywo (role właściciel/edytor/obserwator).
- **Import wyciągów** z polskich banków (mBank, PKO, Revolut), Wise oraz PDF (Erste, Alior) z wykrywaniem duplikatów.
- Menedżer subskrypcji, cele oszczędnościowe, alerty o nietypowych wydatkach. Działa na Androidzie i w przeglądarce, **9 języków**, darmowy plan.

Polski produkt, polski zespół. Chętnie udostępnię materiały prasowe, zrzuty ekranu i dostęp testowy, albo opowiem o kulisach (np. dlaczego ręczne wpisywanie zabija większość budżetów).

Strona: https://ai-budget.pl · Web: https://app.ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant

Pozdrawiam,
[Imię Nazwisko], MICODE sp. z o.o.

---

## 2. Reddit — value-first, maker disclosed

### r/budgeting — discussion post (NOT a link drop)
**Title:** The thing that finally made expense tracking stick for me: cutting the friction at entry

**Body:**
Every budget I tried died for the same reason — I'd stop logging after a week because typing every transaction is tedious. What actually changed it for me was making *entry* effortless: I now add an expense by speaking it or snapping the receipt, so it takes ~3 seconds and I actually do it.

A few things that helped, app-agnostic:
- Log at the moment of purchase, not "later" (later never comes).
- Keep categories few. 10–12 max. A giant list kills the habit.
- For couples: one shared view both people update, or someone becomes the resentful household accountant.

Full disclosure: I build one of these apps (AI Budget Assistant), so I'm biased about the voice/receipt part — but the friction point is the real lesson regardless of tool. Happy to share what categories worked if useful. What finally made it stick for you?

### r/personalfinance / r/androidapps — reply on an existing "best budgeting app" thread
**Comment:**
Depends what kills your budgets. If it's the manual entry, look for an app with fast capture (voice or receipt photo) rather than more charts. If you budget with a partner, prioritise genuine shared accounts where you both log from your own phones into one live view — that single feature prevents most money arguments.

(Disclosure: I'm the maker of AI Budget Assistant, which does both, free tier — mentioning it because it fits the ask, not to spam. There are good alternatives too: YNAB if you want strict zero-based, Goodbudget for envelopes.)

---

## 3. Quora — answer "What is the best budgeting app?" type questions

**Answer:**
There's no single "best" — pick by the reason your past budgets failed.

- **You stop logging after a week?** Get an app with low-friction capture: add expenses by voice or by photographing the receipt instead of typing. That one change is what makes tracking stick.
- **You budget with a partner/family?** Prioritise real shared accounts — everyone logs from their own phone into one live view, with roles. Spreadsheets owned by one person always collapse.
- **You want strict zero-based budgeting?** YNAB is the reference (paid).
- **You like the envelope method?** Goodbudget.

I build **AI Budget Assistant** (disclosure: I'm the maker), which focuses on the first two — voice/receipt/chat capture and shared family budgets, with a free tier, bank-statement import, and 9 languages. But the honest takeaway is to match the tool to your failure mode. If you want a deeper comparison I wrote one up here: https://ai-budget.pl/blog/en/best-budgeting-apps/

---

## 4. Medium / dev.to — canonical repost (no duplicate-content risk)

Republish an existing blog article and set the **canonical URL back to ai-budget.pl** so Google keeps the original as the ranking page while you get the referral traffic + a contextual link.

- **Pick an article:** start with `best-budgeting-apps`, `how-to-budget`, or `shared-budget-for-couples` (high intent).
- **Medium:** paste the article → Story settings → "Advanced settings" → **Canonical link** → set to the original `https://ai-budget.pl/blog/en/<slug>/`.
- **dev.to:** add front-matter `canonical_url: https://ai-budget.pl/blog/en/<slug>/` at the top of the post.
- **Intro to add at the top (so it isn't a bare copy):**
  > Originally published on the [AI Budget Assistant blog](https://ai-budget.pl/blog/en/). Reposting here for the Medium/dev.to community.
- Keep the in-article internal links pointing to the live ai-budget.pl URLs (they become real backlinks).

---

## 5. After a link goes live
- Record the live URL + date in `backlinks-tracker.csv` (so you can audit dofollow vs nofollow and re-pitch dead ones).
- For directories that surface faster with engagement (AlternativeTo, Product Hunt, G2), ask 3–5 real users to upvote/review within the first days.
- Optionally ping the new/updated pages to IndexNow so Bing/Yandex recrawl the linked pages quickly (separate task).
