# Outreach pack — October 2026 (GEO: mentions that Google and answer engines pick up)

Builds on `backlinks.md`, `backlinks-outreach.md`, `backlinks-submission-fields.md`,
`backlinks-tracker.csv` and `product-hunt-launch.md` — it does not repeat their directory cards.
Everything here is text for the owner to use by hand. Nothing has been posted, submitted or sent.

Researched 2026-10-15. "Verified" = the page was fetched or found in search on that date.
"Unverified" = could not be fetched (login wall, bot block) — check before acting.

**Truth rules for every block below** (from the wiki and `FEATURES_EN`):
- Free tier: 50 AI requests/month, 3 accounts, 1 member per account. **A shared family budget
  (more than one member) is Pro**: $4.99/mo or $29.99/yr, 7-day trial, 5 accounts, 5 members.
  Never write "shared family budget, free".
- Never mention receipt price-check alerts, the Community Price Map or e-receipts by e-mail
  (flag-gated off in production). Never name the AI model.
- BLIK on a split link shows the payer's phone number with instructions — BLIK has no cross-bank
  payment link. Revolut and PayPal get a prefilled button. Don't write "pay with one tap via BLIK".
- No native iOS app: iPhone users use the web app at app.ai-budget.pl (installable as a PWA).

---

## 0. What the tracker misses (it says "todo" for everything)

The CSV is stale. Found live on 2026-10-15:

| Site | Status found | Action |
|---|---|---|
| **AlternativeTo** — https://alternativeto.net/software/ai-budget-assistant/about/ | Live since 2026-06-29, 1 like, **0 alternatives linked**, pricing shown as **"$10–20/month"** (wrong), only 7 languages (no Polish, no Dutch), developer "MICODE sp. z o.o." | **Fix the listing** — see §1 #1 and §2(d) |
| **Product Hunt** — https://www.producthunt.com/products/ai-budget-assistant | Page exists, maker @micode, **2 points**; the page reads as already launched | Launch is effectively spent; use the page as a profile (see §1 #9) |
| SoftwareSuggest — https://www.softwaresuggest.com/ai-budget-assistant | Live (company "Micode", HQ Gdańsk) | Record in tracker |
| SourceForge — https://sourceforge.net/projects/ai-budget-assistant/ | Live | Record in tracker |
| PeerPush — https://peerpush.com/p/ai-budget-assistant | Live (footer badge exists) | Record in tracker |
| Indie Hackers — https://www.indiehackers.com/product/ai-budget-assistant | In search results; page returned 403 to the fetcher | Unverified; check and record |
| G2 — https://www.g2.com/sellers/micode | In search results; 403 to the fetcher | Unverified; check product page and record |
| Footer-badge directories: Startup Fame, PeerPush, Best AI Brands, Firsto, Lifto, Fazier, LaunchStag, Uneed, Tools Cafe, Sell With Boost, AlphaShot | Live (badges in `build_landing.py`) | Not in the CSV at all — record them |
| LinkedIn company page | **None found.** mi-code.pl links only the founder's personal profile | Create (§1 #4) |
| Crunchbase | **None found** | Create (§1 #5) |

---

## 1. Priority list (Poland first, then EN)

Ranked by expected GEO value: answer engines quote Polish ranking articles for
"najlepsza aplikacja do budżetu domowego", and they join an entity through consistent profiles
(AlternativeTo, LinkedIn, Crunchbase, Wikidata). Effort: S < 30 min, M 1–2 h, L half a day+.

**Market note:** the Polish SERP for this query is dominated by **freenance.io** (9+ "ranking"
pages, all putting its own paid app first). Those pages will never list us — don't pitch them.
Same for **easybudget.pl** (EasyBudget sp. z o.o. ranks its own app). The realistic targets are
independent editorial lists that are already being updated in 2026.

| # | Target | URL | Why it matters | What to submit | Effort |
|---|---|---|---|---|---|
| 1 | **AlternativeTo — fix existing listing** | https://alternativeto.net/software/ai-budget-assistant/about/ | Most-cited "alternatives" source for answer engines; it currently tells them we cost $10–20/mo and are an alternative to nothing | Edit: pricing → Freemium, Pro from $4.99/mo; add Polish + Dutch; set "Alternative to" Monefy, Wallet by BudgetBakers, YNAB, Spendee, Money Manager, Goodbudget, Splitwise; paste §2(d); developer → "MiCode Sp. z o.o."; website → `https://ai-budget.pl/` (not `/en/`) | S |
| 2 | **Bankier.pl SMART** — "Jaka jest najlepsza aplikacja do oszczędzania pieniędzy i planowania budżetu domowego?" (Mateusz Królik, 2026-07-08) | https://www.bankier.pl/smart/jaka-jest-najlepsza-aplikacja-do-oszczedzania-pieniedzy-i-planowania-budzetu-domowego | Top Polish finance domain; list of 7 (Wallet, Kontomierz, Spendee, Money Lover, Monefy, YNAB, MoneyWiz) — none has Polish PDF import + voice + bill split | Pitch §2(a) to the author via Bankier redakcja contact; ask to be considered at the next update | S |
| 3 | **Financer.pl** — "Aplikacja do budżetu domowego 2026 – ranking" (Grzegorz Pietruczuk, 2026-07-13) | https://financer.pl/finanse-osobiste/aplikacja-do-budzetu-domowego/ | Comparison site, actively updated, 8 budget apps (Monefy, Wallet, Kontomierz, YNAB, Szybki Budżet, 1Money, Spendee, 4grosze); comparison sites are heavily cited by AI Overviews | Pitch §2(a) via https://financer.pl/kontakt/ (no e-mail published; contact form). Do **not** use the "Financer Talks" comments for promotion | S |
| 4 | **LinkedIn company page — MiCode Sp. z o.o.** | https://www.linkedin.com/company/setup/new/ | Missing `sameAs`; the company currently has no organisation profile anywhere except mi-code.pl, GitHub, Wikidata | Create page with §2(e); then add URL to `ORG_SAMEAS` (both generators) and Wikidata Q141551004 (P4264 LinkedIn company ID) | S |
| 5 | **Crunchbase — MiCode Sp. z o.o.** | https://www.crunchbase.com/ (Add → Organization) | Missing `sameAs`; Crunchbase is a seed source for entity graphs | Create with §2(f) and §3 facts; then add to `ORG_SAMEAS` and Wikidata (P2088 Crunchbase organization ID) | M (review queue) |
| 6 | **android.com.pl** — "domowy budżet aplikacje finanse" (Mateusz Nowak, 2025-11-16) | https://android.com.pl/tech/990641-domowy-budzet-aplikacje-finanse/ | Big Polish Android outlet; short list (Szybki Budżet, 4grosze, Splitwise) — our bill-split-by-link + budget combo is a natural fit | Pitch §2(a), Android angle (bank-notification capture, Polish bank import) | S |
| 7 | **Komputronik nano** — "Aplikacje do zarządzania domowym budżetem i kontroli wydatków (2026)" (Mariusz Ignar, 2026-01-21) | https://nano.komputronik.pl/n/aplikacja-do-wydatkow-budzet-domowy/ | 2026-dated TOP 5, retailer blog with good authority | Pitch §2(a) via https://nano.komputronik.pl/redakcja/ | S |
| 8 | **r/PolskaFinanse** | https://www.reddit.com/r/PolskaFinanse/ | Reddit threads are among the most-cited sources in Perplexity/ChatGPT answers; Polish personal-finance sub | Post §2(c) **only after reading the sidebar rules** — rules could not be fetched (Reddit blocks the fetcher) → *unverified*. Reddit-wide: maker disclosure required, no referral links, ~1-in-10 self-promo norm. Prefer answering an existing "jaka aplikacja do budżetu?" thread with a disclosed comment first | M |
| 9 | **Product Hunt — use as profile, not launch** | https://www.producthunt.com/products/ai-budget-assistant | Page exists with 2 points; a second launch is acceptable only for a major new version | Complete the page (gallery, PL-relevant topics, link to web app); add a "shared expense groups" update as a forum post; plan a relaunch only around a real major release (`product-hunt-launch.md`) | S |
| 10 | **antyweb.pl** — "najlepsze aplikacje do planowania budżetu Android" (Bartek Luzak, 2025-06-19) | https://antyweb.pl/najlepsze-aplikacje-do-planowania-budzetu-android | Ranks well for the Android query; already in tracker as a generic editorial pitch — this is the specific article to reference | Pitch §2(a) to the author, asking for inclusion in an update; use the press pitch in `backlinks-outreach.md` §1 for a news story | S |
| 11 | **budzet-excel.pl** — "7 najlepszych aplikacji do planowania budżetu domowego" (Karol, 2026) | https://budzet-excel.pl/najlepsze-aplikacje-do-budzetu-domowego/ | Ranks for the exact query; the site sells Excel templates, so a CSV-export / "app next to your spreadsheet" angle is complementary, not competing | Pitch §2(a) via https://budzet-excel.pl/kontakt/ — mention that the app imports bank statements and exports CSV/Excel reports | S |
| 12 | **wykop.pl** | https://wykop.pl/ | High-authority Polish UGC; threads get indexed | A disclosed "zrobiłem aplikację" entry under tags like #finanse #oszczedzanie #programowanie. Tag culture and self-promo tolerance **unverified** — read the regulamin; wykop users react badly to ads, so lead with a concrete free resource (e.g. the 2000 zł budget article) | M |
| 13 | **Polish Facebook groups** (budżet domowy / oszczędzanie / "Oszczędzanie na co dzień"-type groups) | — | Large audiences but posts are not indexed by Google; low GEO value, some acquisition value | Most such groups ban advertising in their rules — **unverified per group**; ask the admin before posting, or only answer questions with disclosure | M |
| 14 | **mFinanse (mBank blog)** — "7 aplikacji do planowania budżetu domowego" | https://mfinanse.pl/blog/aplikacje-do-planowania-budzetu-domowego/ | Bank-owned, top-ranking; inclusion unlikely but we import mBank statements, which is a relevant hook | Low-priority pitch (§2(a), mBank import angle). Date/author not checked | S |
| 15 | **SaaSHub** | https://www.saashub.com/ | No listing found; free dofollow, lists alternatives (answer engines use it for "X alternatives") | Card in `backlinks-submission-fields.md` §3; set alternatives as in #1 | S |
| 16 | **Slant** — "best budgeting app" question pages | https://www.slant.co/ | Q&A format answer engines quote directly | Add as an option to existing questions (e.g. best budgeting app for Android / for couples) with an honest pros/cons | M |
| 17 | **r/androidapps / r/budgeting** | already in tracker | EN Reddit citations | Use drafts in `backlinks-outreach.md` §2 | M |
| 18 | **Wikidata app item Q141551014** | https://www.wikidata.org/wiki/Q141551014 | Has no publication date / country; deletion risk as non-notable | Add P577 publication date = 2026-04, P495 country of origin = Poland, and, once live, "described at URL" (P973) pointing to any press article from #2–#11 | S |
| 19 | **Capterra / GetApp / Software Advice** | already in tracker | B2C budgeting category is thin; review platforms are cited for "best app" queries | One Gartner signup (see `backlinks.md`) | M |
| 20 | **Trustpilot** | already in tracker | Brand SERP; reviews | Claim profile; invite real users | S |

Not added on purpose: freenance.io and easybudget.pl (competitor-owned rankings), instalki.pl
"10 aplikacji do oszczędzania" (last updated 2023-09-15, savings apps not budget apps),
jakoszczedzacpieniadze.pl (the blog states it has ended its activity; only the bank ranking is
updated), play.pl (mobile-operator content).

---

## 2. Copy blocks

### (a) Polish pitch to a listicle author

Length: ~1,000 characters — short enough to read on a phone. Personalise the first line per
article (name the article and one app it lists). One e-mail per author; no follow-up sooner than
10 days, and at most one follow-up.

**Temat:** Propozycja do zestawienia „[tytuł artykułu]” — polska aplikacja AI Budget Assistant

> Dzień dobry [Imię],
>
> przeczytałem Pana/Pani zestawienie „[tytuł]” — szczególnie trafne było [jedno konkretne zdanie o artykule]. Jeśli będzie Pan/Pani je aktualizować, proszę rozważyć AI Budget Assistant (ai-budget.pl), aplikację do budżetu domowego, którą tworzymy w MiCode Sp. z o.o. w Gdańsku.
>
> Czym różni się od aplikacji z listy:
> - wydatek dodaje się głosem, zdjęciem paragonu albo jednym zdaniem w czacie;
> - import wyciągów CSV/PDF z PKO BP, mBanku, ING, Pekao, Millennium, Alior i Erste (oraz Revolut i Wise), z wykrywaniem duplikatów;
> - podział rachunku linkiem: znajomi widzą swoją kwotę i dane do zapłaty (BLIK na numer telefonu, Revolut, PayPal) bez instalowania aplikacji;
> - wspólny budżet rodzinny z rolami (plan Pro, 7 dni za darmo);
> - darmowy plan bez karty: 50 zapytań AI miesięcznie, 3 konta.
>
> Android, przeglądarka (app.ai-budget.pl, na iPhonie jako aplikacja z ekranu początkowego), 9 języków. Pro kosztuje 4,99 USD/mies.
>
> Chętnie dam dostęp testowy do Pro i zrzuty ekranu. Jeśli aplikacja nie pasuje do zestawienia, proszę po prostu zignorować tę wiadomość.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant

### (b) English pitch to a listicle author

**Subject:** Suggestion for "[article title]" — AI Budget Assistant

> Hi [Name],
>
> I read your "[article title]" — [one specific point about it]. If you refresh it, would you consider AI Budget Assistant (ai-budget.pl)? We build it at MiCode Sp. z o.o. in Gdańsk, Poland.
>
> What it does differently from the apps on your list:
> - log an expense by voice, a receipt photo, or one sentence to the AI chat;
> - import CSV/PDF statements from Wise, Revolut and nine Polish and European banks, with duplicate detection — any other bank's statement is read by the AI import;
> - migrate from Monefy, Wallet or Money Manager keeping your own categories;
> - split a bill by link: friends see their share and how to pay, no install needed;
> - shared family budgets with owner/editor/viewer roles (Pro, 7-day free trial);
> - a free plan, no card: 50 AI requests a month, 3 accounts.
>
> Android and web (app.ai-budget.pl, installable on iPhone from Safari), 9 languages. Pro is $4.99/month or $29.99/year.
>
> Happy to give you a Pro test account and screenshots. If it isn't a fit, no reply needed.
>
> Best,
> [Name], MiCode Sp. z o.o.
> https://ai-budget.pl

### (c) r/PolskaFinanse post (Polish, maker disclosed)

Reddit limits: title ≤ 300 characters, body ≤ 40,000. Check the sub's flair (e.g. "Dyskusja") and
whether self-promo goes in a weekly thread before posting. No referral links, no UTM soup — one
plain link to the site at the end.

**Tytuł:** Zrobiłem aplikację do budżetu domowego z importem wyciągów z polskich banków — szukam szczerej krytyki

> Cześć, od razu zaznaczam: jestem twórcą tej aplikacji, więc piszę jako zainteresowany. Nie chodzi mi o reklamę, tylko o opinie od ludzi, którzy faktycznie prowadzą budżet.
>
> Problem, od którego zacząłem: większość moich budżetów umierała po dwóch tygodniach, bo ręczne wpisywanie każdego paragonu jest męczące. Zrobiłem więc **AI Budget Assistant**, w którym:
>
> - wydatek dodaje się głosem („kawa 14 zł”), zdjęciem paragonu albo zdaniem w czacie;
> - można wgrać wyciąg CSV/PDF z PKO BP, mBanku, ING, Pekao, Millennium, Alior, Erste (i Revolut/Wise) — duplikaty są pomijane;
> - rachunek ze znajomymi dzieli się linkiem: każdy widzi swoją kwotę i dane do BLIK-a/Revoluta, bez instalowania niczego;
> - jest wspólny budżet dla rodziny z rolami (to już plan płatny, 4,99 USD/mies., z 7-dniowym okresem próbnym).
>
> Darmowy plan: 50 zapytań AI miesięcznie i 3 konta, bez karty. Android i przeglądarka; na iPhonie działa jako aplikacja webowa — natywnej wersji na iOS jeszcze nie ma.
>
> Co chciałbym wiedzieć:
> 1. Czego brakuje Wam w aplikacjach, których używacie teraz (Wallet, Monefy, arkusz)?
> 2. Czy import wyciągu z Waszego banku zadziałał bez poprawek? Jeśli nie — który bank i jaki format?
> 3. Czy darmowy plan jest wystarczający, żeby w ogóle ocenić aplikację?
>
> Link: https://ai-budget.pl — odpowiem na każdy komentarz, również krytyczny.

### (d) AlternativeTo description (EN)

AlternativeTo's exact field limits are **not verified**; the existing listing uses a one-line
summary plus a multi-paragraph description. Keep the summary under ~150 characters.

**Summary (131 chars):**
> AI budgeting app: log expenses by voice, receipt photo or chat, import bank statements, split bills by link, share a family budget.

**Description:**
> AI Budget Assistant is a personal and family finance app from MiCode Sp. z o.o. (Poland), for Android and the web.
>
> Log an expense by speaking it, photographing the receipt, or typing one sentence to the AI assistant — then ask questions such as "how much did we spend on groceries this month?" in plain language.
>
> Import CSV and PDF statements from Wise, Revolut, mBank, PKO BP, ING, Millennium, Pekao, Erste and Alior; statements from other banks are read by the AI import, with duplicate detection. Moving from Monefy, Wallet by BudgetBakers or Money Manager keeps your own categories.
>
> Also: category budgets, savings goals, a subscription manager with renewal reminders, debt tracking, a trip wallet, bill splitting by guest link (no install for friends), shared expense groups, anomaly alerts for duplicate charges and price increases, multi-currency, and an offline-first design with optional end-to-end encryption.
>
> Shared family accounts have owner/editor/viewer roles. Free plan: 50 AI requests a month and 3 accounts. Pro: $4.99/month or $29.99/year with a 7-day trial, 5 accounts and 5 members per account. Available in English, Polish, German, Spanish, French, Dutch, Ukrainian, Belarusian and Russian. On iPhone it runs as a web app from app.ai-budget.pl.

**Fields:** Pricing → Freemium · Platforms → Android, Online (Web), iPhone *only if the site allows
"Online" to cover it — don't tick iOS* · Alternative to → Monefy, Wallet by BudgetBakers, YNAB,
Spendee, Money Manager, Goodbudget, Splitwise · Tags → budget-manager, expense-tracker,
receipt-scanner, family-budget, bill-splitting, personal-finance.

### (e) LinkedIn company page "About" — MiCode Sp. z o.o.

LinkedIn limits: **tagline 120 characters, description ("About") 2,000 characters.**
Fields: Website `https://mi-code.pl/` · Industry: Software Development · Company size: 2–10 ·
Type: Privately held · Founded: 2024 · HQ: Jana Heweliusza 11 lok. 811, 80-890 Gdańsk, Poland.
Public URL slug: `micode-ai` (matches the GitHub org; no page exists there today).

**Tagline (EN, 72 chars):** `Polish software studio behind AI Budget Assistant, the AI budgeting app.`

**About (EN, ~800 chars):**
> MiCode Sp. z o.o. is a software company based in Gdańsk, Poland. We build AI-assisted products for everyday money and paperwork.
>
> Our main product is AI Budget Assistant (https://ai-budget.pl), a personal and family budgeting app launched in April 2026 for Android and the web, in 9 languages. People log expenses by voice, receipt photo or a sentence to the AI assistant, import statements from Polish and European banks, split bills with friends by link, and share one budget across the family with roles. It has a free plan; Pro adds more AI requests, accounts and members.
>
> We publish practical budgeting guides in nine languages at https://ai-budget.pl/blog/ and a public help center at https://ai-budget.pl/help/.
>
> NIP 5833510147 · REGON 528740633

**Slogan (PL, ≤120):** `Polskie studio programistyczne, twórca aplikacji AI Budget Assistant.`

**O firmie (PL, ~850 znaków):**
> MiCode Sp. z o.o. to firma programistyczna z Gdańska. Tworzymy produkty z asystentem AI do codziennych spraw finansowych.
>
> Naszym głównym produktem jest AI Budget Assistant (https://ai-budget.pl) — aplikacja do budżetu osobistego i rodzinnego, dostępna od kwietnia 2026 na Androida i w przeglądarce, w 9 językach. Wydatki dodaje się głosem, zdjęciem paragonu albo zdaniem w czacie, wyciągi importuje się z polskich i europejskich banków, rachunki dzieli się ze znajomymi linkiem, a budżet rodzinny prowadzi się wspólnie z podziałem ról. Aplikacja ma darmowy plan; Pro daje więcej zapytań AI, kont i członków.
>
> Publikujemy praktyczne poradniki o budżecie w dziewięciu językach na https://ai-budget.pl/blog/ oraz centrum pomocy na https://ai-budget.pl/help/.
>
> NIP 5833510147 · REGON 528740633

(LinkedIn supports one secondary-language version of the About text — add PL as a second language.)

### (f) Crunchbase

Limits **not verified** (Crunchbase's short description is commonly ~250 characters; keep under
that). Create the **organisation as MiCode Sp. z o.o.**, not "AI Budget Assistant" —
`backlinks-submission-fields.md` §4 says the opposite and also says "Founded 2025"; both conflict
with Wikidata and mi-code.pl. The org profile is what goes into `ORG_SAMEAS`.

| Field | Value |
|---|---|
| Name | MiCode Sp. z o.o. (also known as: MiCode, MICODE sp. z o.o.) |
| Website | https://mi-code.pl/ |
| Founded | 2024 |
| HQ | Gdańsk, Pomorskie, Poland |
| Operating status | Active · Company type: For profit · Employees 1–10 |
| Industries | FinTech, Personal Finance, Mobile Apps, Artificial Intelligence, Software |
| LinkedIn | (the page from #4) |
| Facebook | https://www.facebook.com/profile.php?id=61570771625318 |

**Short description (~150 chars):**
> MiCode Sp. z o.o. is a Polish software company that makes AI Budget Assistant, an AI budgeting app for individuals and families on Android and the web.

**Full description:**
> MiCode Sp. z o.o. is a software company from Gdańsk, Poland, founded in 2024. It develops AI Budget Assistant (https://ai-budget.pl), a personal and family finance app launched in April 2026 on Android and the web, in nine languages.
>
> Users log expenses by voice, by photographing a receipt or by typing a sentence to the AI assistant, and can ask questions about their spending in plain language. The app imports CSV and PDF statements from Wise, Revolut and Polish banks including PKO BP, mBank, ING, Pekao, Millennium, Alior and Erste, and migrates data from Monefy, Wallet by BudgetBakers and Money Manager. It also offers category budgets, savings goals, a subscription manager, debt tracking, bill splitting by guest link, shared expense groups and shared family accounts with owner/editor/viewer roles.
>
> AI Budget Assistant is freemium: the free plan includes 50 AI requests a month and three accounts; Pro costs $4.99 a month or $29.99 a year with a 7-day trial.

---

## 3. Entity-consistency checklist

Every profile, pitch signature and listing uses exactly these values. A second spelling splits the
entity for answer engines (ABA-674).

| Fact | Value — use verbatim |
|---|---|
| Product name | **AI Budget Assistant** (alternate names only where a field asks: "AI Budget", "AI Budget App"; Polish copy may say "AI Budżet" in prose, never as the profile name) |
| Product URL | **https://ai-budget.pl/** (root, with trailing slash; not `/en/`, not `/pl/`) |
| Web app | https://app.ai-budget.pl |
| Google Play | https://play.google.com/store/apps/details?id=com.budget.assistant |
| Product launch | **April 2026** (`2026-04`, as in `llms.txt`) |
| Company name | **MiCode Sp. z o.o.** (alternate: "MICODE sp. z o.o.", "MiCode") |
| Company URL | **https://mi-code.pl/** |
| Company founded | **2024** (per mi-code.pl) |
| Company address | Jana Heweliusza 11 lok. 811, 80-890 Gdańsk, Poland |
| NIP / REGON | 5833510147 / 528740633 |
| Wikidata | company **Q141551004**, app **Q141551014** (not Q110126846, a French YouTuber) |
| Category wording | "AI budgeting app" / "personal and family finance app" |
| Platforms | Android, Web (iPhone via the web app — never "iOS app") |
| Languages | 9: English, Polish, German, Spanish, French, Dutch, Ukrainian, Belarusian, Russian |
| Pricing | Free plan; Pro $4.99/mo or $29.99/yr, 7-day trial; Business $19.99/mo |

**sameAs — the app** (`APP_SAMEAS`): Facebook `https://www.facebook.com/profile.php?id=61570771625318`,
`https://t.me/aibudgetassistant`, `https://t.me/aibudgetassistantEn`, `https://t.me/aibudgetassistantBy`,
Google Play (above), `https://www.wikidata.org/wiki/Q141551014`. Candidates to add once confirmed:
the AlternativeTo listing and the Product Hunt product page.

**sameAs — the company** (`ORG_SAMEAS`): `https://mi-code.pl/`, `https://github.com/micode-ai`,
`https://www.wikidata.org/wiki/Q141551004`. **Add** the LinkedIn company page and Crunchbase
organisation URL from #4/#5 to both `build_landing.py` and `build_blog.py` (the list is duplicated),
and record them on Wikidata Q141551004.

**After each profile goes live**
- [ ] The profile links to `https://ai-budget.pl/` (product) or `https://mi-code.pl/` (company) — not a tracked/UTM URL.
- [ ] Developer/publisher field reads "MiCode Sp. z o.o.".
- [ ] Pricing matches the table (AlternativeTo is wrong today).
- [ ] Languages list all 9 (AlternativeTo lacks Polish and Dutch today).
- [ ] Launch date April 2026 wherever a launch/release date is asked; company founding 2024 where a company date is asked. Fix `backlinks-submission-fields.md` §4 ("Founded 2025").
- [ ] Wikidata: add P577 publication date 2026-04 and country of origin Poland to Q141551014 (both missing today).
- [ ] mi-code.pl: replace the founder's personal LinkedIn with the company page once it exists.

---

## 4. Tracker rows to append

Paste under the existing header of `backlinks-tracker.csv`. The first block records listings found
live; the second adds new targets. Existing rows for AlternativeTo, Product Hunt, LinkedIn and
Crunchbase should have their status changed by hand (AlternativeTo → `live-needs-fix`, Product
Hunt → `live`).

```csv
1,SoftwareSuggest,https://www.softwaresuggest.com/,mixed,done,live,,https://www.softwaresuggest.com/ai-budget-assistant,Found live 2026-10-15; company shown as Micode / Gdansk.
2,SourceForge,https://sourceforge.net/,mixed,done,live,,https://sourceforge.net/projects/ai-budget-assistant/,Found live 2026-10-15.
2,PeerPush,https://peerpush.com/,mixed,done,live,,https://peerpush.com/p/ai-budget-assistant,Footer badge.
2,Fazier,https://fazier.com/,mixed,done,live,,https://fazier.com/launches/ai-budget.pl,Footer badge.
2,Uneed,https://www.uneed.best/,mixed,done,live,,https://www.uneed.best/tool/ai-budget-assistant,Footer badge.
2,LaunchStag,https://launchstag.com/,mixed,done,live,,https://launchstag.com/p/tool-1789044587266,Footer badge.
2,"Startup Fame, Best AI Brands, Firsto, Lifto, Tools Cafe, Sell With Boost, AlphaShot",(see build_landing.py badge constants),mixed,done,live,,,Footer badges; split into one row each when auditing.
1,AlternativeTo (fix),https://alternativeto.net/software/ai-budget-assistant/about/,follow,W1,todo,,https://alternativeto.net/software/ai-budget-assistant/about/,Live since 2026-06-29 but wrong price ($10-20) and 0 alternatives and no PL/NL. Use outreach-pack-2026-10.md 2(d).
1,Bankier.pl SMART (listicle),https://www.bankier.pl/smart/jaka-jest-najlepsza-aplikacja-do-oszczedzania-pieniedzy-i-planowania-budzetu-domowego,editorial,W1,todo,,,Author Mateusz Krolik 2026-07-08. Pitch 2(a).
1,Financer.pl (ranking),https://financer.pl/finanse-osobiste/aplikacja-do-budzetu-domowego/,editorial,W1,todo,,,Author Grzegorz Pietruczuk 2026-07-13. Contact form /kontakt/. Pitch 2(a).
1,android.com.pl (listicle),https://android.com.pl/tech/990641-domowy-budzet-aplikacje-finanse/,editorial,W2,todo,,,Author Mateusz Nowak 2025-11-16. Pitch 2(a).
1,Komputronik nano (listicle),https://nano.komputronik.pl/n/aplikacja-do-wydatkow-budzet-domowy/,editorial,W2,todo,,,Author Mariusz Ignar 2026-01-21. Contact via /redakcja/.
2,antyweb.pl Android budget list,https://antyweb.pl/najlepsze-aplikacje-do-planowania-budzetu-android,editorial,W2,todo,,,Author Bartek Luzak 2025-06-19. Ask for inclusion in update.
2,budzet-excel.pl (listicle),https://budzet-excel.pl/najlepsze-aplikacje-do-budzetu-domowego/,editorial,W2,todo,,,Author Karol; site sells Excel templates. Contact /kontakt/.
3,mFinanse (mBank blog),https://mfinanse.pl/blog/aplikacje-do-planowania-budzetu-domowego/,editorial,W3,todo,,,Low odds; mBank import angle.
2,r/PolskaFinanse,https://www.reddit.com/r/PolskaFinanse/,nofollow,W2,todo,,,Read sidebar rules first (unverified). Post 2(c) with disclosure.
3,wykop.pl,https://wykop.pl/,nofollow,W3,todo,,,Disclosed maker entry; lead with a free article. Rules unverified.
3,Polish Facebook budget groups,(per group),nofollow,W3,todo,,,Ask admin first; most ban ads. Not indexed - low GEO value.
1,Wikidata Q141551014 (enrich),https://www.wikidata.org/wiki/Q141551014,n/a,W1,todo,,,Add P577 2026-04 + country Poland; later P973 to press coverage.
```
