# Distribution pack — November 2026

Prepared 2026-11-10. Nothing here has been sent or posted: every item is sent by hand, from the
right account, after a yes. When something goes live, record it in `backlinks-tracker.csv`
(Status, Date submitted, Live URL) and, for community posts, in `community/post-log.md`.

Why now: Play "direct" installs (bare Play links shared somewhere) are the largest and
best-activating source — 20 of 36 acquisitions in 28 days, `not-set` signups activate 22/32 —
yet `community/post-log.md` is empty and 49 tracker rows are still `todo`. Everything below is
tagged so the Acquisition page in the admin can tell the channels apart.

Facts checked against the code/wiki on 2026-11-10: Pro **14,99 zł/mies. or 89,99 zł/rok**
(USD $4.99 / $29.99), **7-day trial**; free plan **50 AI requests a month, 3 accounts**; reports
in **PDF, Excel and CSV are free**; Android + web (`app.ai-budget.pl`), **no native iOS app**.


**Bank list (checked 2026-11-10):** the import picker shows Wise, mBank, PKO, Revolut, Erste and
Alior; ING, Millennium and Pekao parsers are registered but hidden until validated against real
exports (`docs/wiki/features/bank-statement-import.md`), so no pitch names them — other banks
are covered by the AI import. `outreach-pack-2026-10.md` still lists them; do not reuse that list.

---

## 1. Tagged Play links for every place we control

Format (same scheme as the landing's `play_url` and the API's `playStoreUrl`): our
`src`/`loc`/`lang` plus the `utm_*` pair, URL-encoded into `referrer`. A referrer is written once,
at install — tag the link before posting it, it cannot be fixed afterwards.

| Where | Link |
|---|---|
| Telegram PL (`t.me/aibudgetassistant`) — bio | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-pl%26loc%3Dbio%26lang%3Dpl%26utm_source%3Dtelegram-pl%26utm_medium%3Dbio |
| Telegram PL — pinned post | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-pl%26loc%3Dpinned%26lang%3Dpl%26utm_source%3Dtelegram-pl%26utm_medium%3Dpinned |
| Telegram BY (`t.me/aibudgetassistantBy`) — bio | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-by%26loc%3Dbio%26lang%3Dbe%26utm_source%3Dtelegram-by%26utm_medium%3Dbio |
| Telegram BY — pinned post | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-by%26loc%3Dpinned%26lang%3Dbe%26utm_source%3Dtelegram-by%26utm_medium%3Dpinned |
| Telegram EN (`t.me/aibudgetassistantEn`) — bio | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-en%26loc%3Dbio%26lang%3Den%26utm_source%3Dtelegram-en%26utm_medium%3Dbio |
| Telegram EN — pinned post | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtelegram-en%26loc%3Dpinned%26lang%3Den%26utm_source%3Dtelegram-en%26utm_medium%3Dpinned |
| Facebook page — "Install" button / About | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dfacebook%26loc%3Dpage%26lang%3Dpl%26utm_source%3Dfacebook%26utm_medium%3Dpage |
| Instagram (`micode.development`) — bio | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dinstagram%26loc%3Dbio%26lang%3Dpl%26utm_source%3Dinstagram%26utm_medium%3Dbio |
| Threads — bio | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dthreads%26loc%3Dbio%26lang%3Dpl%26utm_source%3Dthreads%26utm_medium%3Dbio |
| TikTok — bio (if the account exists) | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dtiktok%26loc%3Dbio%26utm_source%3Dtiktok%26utm_medium%3Dbio |
| YouTube / Shorts — channel links and video descriptions | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dyoutube%26loc%3Dchannel%26utm_source%3Dyoutube%26utm_medium%3Dchannel |
| E-mail signature of the team | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Demail-sig%26loc%3Dsignature%26utm_source%3Demail-sig%26utm_medium%3Dsignature |
| SaaSHub listing ("Get it" link, if the form has one) | https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dsaashub%26loc%3Dlisting%26utm_source%3Dsaashub%26utm_medium%3Dlisting |

For a new place: `src` = a short id (a–z, 0–9, `-`, ≤ 20 chars), `loc` = the slot (`bio`, `post`,
`pinned`, `video`, `pitch`). **Do not tag identity fields** — a profile's "website" field,
`sameAs`, AlternativeTo's website: those state "this is our app", not "click here"
(`docs/wiki/features/acquisition-tracking.md`, *Keep identity claims untagged*).

Also worth one question to whoever has posted the app before: **where were bare Play links
pasted** (chats, groups, posts)? Those are the 20 "direct" installs a month we cannot see.

---

## 2. Polish listicle pitches — personalised, ready to send

Base: `outreach-pack-2026-10.md` §2(a), with prices in złoty and a tagged Play link per outlet.
Rules from that pack still hold: one e-mail per author, no follow-up sooner than 10 days, at
most one follow-up. All six articles were opened on 2026-11-10 and are live.

### 2.1 Bankier.pl SMART — Mateusz Królik

- Article: „Jaka jest najlepsza aplikacja do oszczędzania pieniędzy i planowania budżetu
  domowego?" (2026-07-08) — lists Wallet, Kontomierz, Spendee, Money Lover, Monefy, YNAB, MoneyWiz.
- Route: no e-mail on the page — the article's „Zadaj pytanie" form, or SMART Bankier "Kontakt"
  in the footer. Author page: bankier.pl/smart/autor/544/mateusz-krolik.

**Temat:** Propozycja do zestawienia aplikacji do budżetu domowego — AI Budget Assistant

> Dzień dobry, Panie Mateuszu,
>
> przeczytałem Pana tekst „Jaka jest najlepsza aplikacja do oszczędzania pieniędzy i planowania budżetu domowego?" — rada, żeby nie ciąć wydatków na jedzenie poza domem do zera, tylko zacząć od 15–20%, jest bardzo życiowa. Jeśli będzie Pan aktualizował zestawienie, proszę rozważyć AI Budget Assistant (ai-budget.pl) — aplikację do budżetu domowego, którą tworzymy w MiCode Sp. z o.o.
>
> Czym różni się od aplikacji z listy:
> - wydatek dodaje się głosem, zdjęciem paragonu albo jednym zdaniem w czacie;
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora i Erste (oraz Revolut i Wise), a wyciąg z innego banku czyta import AI; duplikaty są pomijane, a loginu do banku nie podaje się nigdzie;
> - podział rachunku linkiem: znajomi widzą swoją kwotę i dane do zapłaty bez instalowania aplikacji;
> - wspólny budżet rodzinny z rolami (plan Pro: 14,99 zł/mies., 7 dni za darmo);
> - darmowy plan bez karty: 50 zapytań AI miesięcznie, 3 konta.
>
> Android i przeglądarka (app.ai-budget.pl), 9 języków. Chętnie dam dostęp testowy do Pro i zrzuty ekranu. Jeśli aplikacja nie pasuje do zestawienia, proszę po prostu zignorować tę wiadomość.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dbankier%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dbankier%26utm_medium%3Dpitch

### 2.2 Financer.pl — Grzegorz Pietruczuk

- Article: „Najlepsza aplikacja do budżetu domowego w 2026" — **updated 2026-11-05**, the
  freshest of the six. Lists Monefy, Wallet, Kontomierz, YNAB, Szybki Budżet, 1Money, Spendee, 4grosze.
- Route: contact form at financer.com/kontakt/ (no e-mail). Not in "Financer Talks" comments.

**Temat:** Do rankingu aplikacji do budżetu domowego — import wyciągów z polskich banków

> Dzień dobry, Panie Grzegorzu,
>
> w rankingu „Najlepsza aplikacja do budżetu domowego w 2026" zwraca Pan uwagę, że YNAB nie łączy się z polskimi bankami i trzeba wpisywać transakcje ręcznie albo wgrywać CSV. To dokładnie problem, który rozwiązuje AI Budget Assistant (ai-budget.pl), aplikacja tworzona w MiCode Sp. z o.o. — proszę rozważyć ją przy kolejnej aktualizacji.
>
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora i Erste (oraz Revolut i Wise); wyciąg z innego banku czyta import AI; duplikaty są pomijane;
> - wydatek dodaje się też głosem, zdjęciem paragonu albo zdaniem w czacie;
> - podział rachunku linkiem dla znajomych bez aplikacji i wspólny budżet rodzinny z rolami;
> - darmowy plan: 50 zapytań AI miesięcznie, 3 konta; Pro 14,99 zł/mies. lub 89,99 zł/rok, 7 dni za darmo.
>
> Android i przeglądarka (app.ai-budget.pl), 9 języków. Mogę przesłać zrzuty ekranu i dać dostęp testowy do Pro.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dfinancer%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dfinancer%26utm_medium%3Dpitch

### 2.3 android.com.pl — Mateusz Nowak

- Article: „Domowy budżet pod kontrolą. Te aplikacje pomogą w zarządzaniu finansami
  osobistymi" (2025-11-16) — only three apps: Szybki Budżet, 4grosze, Splitwise.
- Route: **no contact on the page** — find the editorial e-mail ("redakcja") on android.com.pl's
  own contact/impressum page before sending; do not use social DMs for a pitch.

**Temat:** Aplikacja do budżetu i dzielenia rachunków w jednym — propozycja do tekstu o finansach osobistych

> Dzień dobry, Panie Mateuszu,
>
> w tekście „Domowy budżet pod kontrolą" zestawia Pan aplikację do budżetu (4grosze, metodą kopertową) ze Splitwise do dzielenia wydatków. AI Budget Assistant (ai-budget.pl), który tworzymy w MiCode Sp. z o.o., łączy jedno i drugie — może się przydać przy aktualizacji albo w osobnym tekście.
>
> Co jest specyficzne dla Androida i polskich użytkowników:
> - wydatki mogą dodawać się same z powiadomień aplikacji bankowej (Android, po włączeniu);
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora i Erste, a z innych banków przez import AI;
> - podział rachunku linkiem: znajomi widzą swoją kwotę i dane do zapłaty bez instalowania czegokolwiek; są też wspólne grupy wydatków;
> - wydatek głosem, ze zdjęcia paragonu albo zdaniem w czacie z AI.
>
> Darmowy plan: 50 zapytań AI miesięcznie, 3 konta; Pro 14,99 zł/mies. Chętnie dam dostęp testowy do Pro.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dandroidcompl%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dandroidcompl%26utm_medium%3Dpitch

### 2.4 Komputronik nano — Mariusz Ignar

- Article: „Aplikacje do zarządzania domowym budżetem i kontroli wydatków (2026)"
  (2026-01-21) — Wallet, Moje Finanse, Szybki budżet, Finanse, Monefy.
- Route: https://nano.komputronik.pl/redakcja/ (or /kontakt/).
- Angle: the article praises "Finanse" for not connecting to bank accounts (privacy). Our import
  is from a file — no bank login is ever given — and encryption is available.

**Temat:** Prywatność bez ręcznego wpisywania — propozycja do zestawienia aplikacji budżetowych 2026

> Dzień dobry, Panie Mariuszu,
>
> w zestawieniu aplikacji do budżetu na 2026 podkreśla Pan, że aplikacja Finanse nie łączy się z kontami bankowymi — dla wielu osób to ważne. AI Budget Assistant (ai-budget.pl), który tworzymy w MiCode Sp. z o.o., idzie tą samą drogą, ale bez ręcznego przepisywania: wyciąg z banku wgrywa się z pliku, więc aplikacja nigdy nie dostaje loginu do banku.
>
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora, Erste, Revolut i Wise (inne banki: import AI), z pomijaniem duplikatów;
> - wydatek głosem, zdjęciem paragonu albo zdaniem w czacie z AI;
> - opcjonalne szyfrowanie danych;
> - darmowy plan: 50 zapytań AI miesięcznie, 3 konta; Pro 14,99 zł/mies., 7 dni za darmo.
>
> Android i przeglądarka (app.ai-budget.pl). Chętnie dam dostęp testowy do Pro, jeśli będzie Pan aktualizował tekst.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dkomputronik%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dkomputronik%26utm_medium%3Dpitch

### 2.5 antyweb.pl — Bartek Luzak

- Article: „Portfel pod kontrolą: Te aplikacje pomogą zadbać o budżet" (2025-06-19) — Wallet,
  4grosze, Money Manager, Goodbudget, Monefy, Finanse.
- Route: https://antyweb.pl/kontakt-antyweb (author profile /author/bartlomiejl).

**Temat:** Do tekstu „Portfel pod kontrolą" — budżet bez ręcznego wpisywania

> Dzień dobry, Panie Bartku,
>
> w tekście „Portfel pod kontrolą" pisze Pan, że w Goodbudget wpisuje się transakcje ręcznie i że buduje to świadomość wydatków — i że wersja premium kosztuje ok. 25 zł miesięcznie. AI Budget Assistant (ai-budget.pl), który tworzymy w MiCode Sp. z o.o., zostawia tę świadomość, ale zdejmuje przepisywanie: wydatek dodaje się głosem, zdjęciem paragonu albo jednym zdaniem w czacie.
>
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora, Erste, Revolut i Wise, a z innych banków przez import AI;
> - przejście z Monefy, Wallet albo Money Manager z zachowaniem własnych kategorii;
> - podział rachunku linkiem i wspólny budżet rodzinny;
> - darmowy plan: 50 zapytań AI miesięcznie, 3 konta; Pro 14,99 zł/mies.
>
> Android i przeglądarka (app.ai-budget.pl). Jeśli będzie Pan odświeżał zestawienie, chętnie dam dostęp testowy do Pro.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dantyweb%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dantyweb%26utm_medium%3Dpitch

### 2.6 budzet-excel.pl — Karol

- Article: „7 Najlepszych aplikacji do planowania budżetu domowego" (2026) — Wallet, Money
  Lover, Spendee, YNAB, Goodbudget, Monefy, Splitwise.
- Route: https://budzet-excel.pl/kontakt/
- Angle: the site sells Excel templates, so we are complementary — the app exports to Excel.

**Temat:** Aplikacja, która eksportuje budżet do Excela — propozycja do zestawienia

> Dzień dobry, Panie Karolu,
>
> w zestawieniu „7 najlepszych aplikacji do planowania budżetu domowego" dobrze opisuje Pan metodę YNAB, w której każda zarobiona złotówka dostaje zadanie. AI Budget Assistant (ai-budget.pl), który tworzymy w MiCode Sp. z o.o., dobrze uzupełnia arkusz zamiast z nim konkurować: dane wpada się szybko w telefonie, a raport można pobrać w Excelu, CSV albo PDF — za darmo.
>
> - import wyciągów CSV/PDF z PKO BP, mBanku, Aliora, Erste, Revolut i Wise (inne banki: import AI);
> - wydatek głosem, zdjęciem paragonu albo zdaniem w czacie z AI;
> - budżety kategorii i wspólny budżet rodzinny;
> - darmowy plan: 50 zapytań AI miesięcznie, 3 konta; Pro 14,99 zł/mies.
>
> Android i przeglądarka (app.ai-budget.pl). Chętnie dam dostęp testowy do Pro.
>
> Pozdrawiam,
> [Imię Nazwisko], MiCode Sp. z o.o.
> https://ai-budget.pl · Google Play: https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=src%3Dbudzet-excel%26loc%3Dpitch%26lang%3Dpl%26utm_source%3Dbudzet-excel%26utm_medium%3Dpitch

---

## 3. AlternativeTo — fix the live listing

Status 2026-11-10: edit submitted (website, price 4.99–19.99, Polish + Dutch, description) and 7 alternatives
submitted (Monefy, Wallet App, YNAB, Spendee, Money Manager, Goodbudget, Splitwise) — both pending moderation.
New edits are blocked until the pending one is approved.

Listing: https://alternativeto.net/software/ai-budget-assistant/about/ — live since 2026-06-29
with a wrong price ($10–20/mo), **0 alternatives** and no Polish/Dutch. Edit as the listing
owner (logged in on alternativeto.net).

| Field | Set to |
|---|---|
| Pricing | Freemium — Pro from $4.99/month ($29.99/year), 7-day trial |
| Platforms | Android, Online (Web). **Do not tick iOS / iPhone.** |
| Languages | add Polish and Dutch (the app has en, pl, de, es, fr, ru, uk, be, nl) |
| Alternative to | Monefy, Wallet by BudgetBakers, YNAB, Spendee, Money Manager, Goodbudget, Splitwise |
| Developer | MiCode Sp. z o.o. |
| Website | `https://ai-budget.pl/` — untagged (identity field) |
| Tags | budget-manager, expense-tracker, receipt-scanner, family-budget, bill-splitting, personal-finance |
| Summary / Description | `outreach-pack-2026-10.md` §2(d) — **submitted 2026-11-10, pending moderation**; it names ING, Millennium and Pekao, which are not yet validated (see the bank list note) — once approved, submit one more edit replacing that sentence with "…from Wise, Revolut, mBank, PKO BP, Erste and Alior; statements from any other bank are read by the AI import" |

Why first among the S items: "Monefy alternative" is the one English page that earned clicks
(position ~7), and AlternativeTo is the most-cited "alternatives" source for answer engines.

---

## 4. Diaspora communities (Ukrainians and Belarusians in Poland)

Target list, Go / Ask-admin / No-Go verdicts and per-community drafts are in
`community/drafts/2026-11-10-diaspora-poland.md` (local only, per the community-post skill).
Every draft there uses its own tagged link.
