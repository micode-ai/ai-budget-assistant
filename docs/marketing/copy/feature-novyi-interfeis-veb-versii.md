# AI Budget Assistant — "Wersja webowa, zaprojektowana od nowa" (nowy interfejs desktopowy)

Kampania (Dreaming Center proposal #46, brief operatora: pusty — angle z API:
*"Прорекламировать то что в декстоп версии обновлен интерфейс"*): ogłoszenie
przeprojektowanego interfejsu wersji webowej aplikacji (`app.ai-budget.pl`) na
szerokich ekranach — CLAUDE.md "Desktop web layout" (ABA-289/290) i kolejne
bespoke przejścia dla poszczególnych zakładek: transakcje (ABA-499), pulpit
(ABA-505), czat AI (ABA-513).

**Dowód, na którym stoi cała kreacja.** `evidence` z API mówi wprost: brief
nie podał żadnego zewnętrznego faktu ("hand-written brief, no external fact
supplied: build only from what the venue's repository and the subject's own
product demonstrably show, and ask... for anything neither establishes") —
zgodnie z instrukcją make-creative krok 1, źródłem prawdy jest repozytorium
(CLAUDE.md) i sam produkt. Człowiek dołożył do `src/` siedem prawdziwych
zrzutów ekranu prawdziwej wersji desktopowej (`app.ai-budget.pl`, 2026-09-07,
~1901-1918×903-911 px każdy):

- `2026-09-07-211557.png` — realny **Pulpit** (dashboard): pasek górny z
  pięcioma prawdziwymi zakładkami (Pulpit/Transakcje/Budżet/Analityka/Czat
  AI), widżety w DWÓCH kolumnach obok siebie. Dowodzi ABA-505 (dwukolumnowy
  układ pulpitu).
- `2026-09-07-211612.png` — realny **Transakcje**: lewy pasek filtrów
  (Okres/Pokaż/Kategoria/Sprzedawca) obok tabeli transakcji z własnym
  przełącznikiem Lista/Mapa. Dowodzi ABA-499 (pasek filtrów + tabela).
- `2026-09-07-211704.png` — realny **Budżet** ze szczegółami budżetu
  OTWARTYMI JAKO OKNO DIALOGOWE nad listą (nawigacja okresu, pasek postępu,
  podział na kategorie) zamiast przejścia na nową stronę. Dowodzi wzorca
  "okno dialogowe hostuje istniejący ekran", opisanego w CLAUDE.md przy
  ABA-499 (`ExpenseDialog.tsx` HOSTS the existing detail cards).
- `2026-09-07-211808.png` — realna **Analityka**: karty statystyk na całą
  szerokość, szeroki wykres trendu i dwa wykresy kołowe w skali
  desktopowej.
- `2026-09-07-212007.png` — realny **Czat AI**: pasek rozmów po lewej obok
  szerokiej kolumny czatu z prywatną/wspólną rozmową i odpowiedzią
  asystenta. Dowodzi ABA-513 (pasek rozmów + kolumna czatu).
- Nieużyte w tej parze skryptów: `2026-09-07-211638.png` (okno szczegółów
  wydatku — pozycje paragonu, zdjęcie, mapa) i `2026-09-07-211822.png`
  (ta sama Analityka przewinięta niżej, do indeksu inflacji) — dostępne,
  gdyby przyszła poprawka chciała innego ujęcia.
- CLAUDE.md, "Desktop web layout" (ABA-289/290), dostarcza jedyny fakt
  niewidoczny na pojedynczym zrzucie: układ włącza się automatycznie od
  `DESKTOP_MIN_WIDTH = 1024` px szerokości okna (`isDesktopWeb(width)`), a
  telefon i wąski widok webowy (<1024) zostają bez zmian — to nie jest
  osobny produkt, to ten sam login i to samo konto, tylko szerszy układ.

## Prywatność (rozmycie bez wycinania ekranu)

Ta sama technika co `build_home_screen_widget_reorder_story.py`'s
`redact_band()`, tu uogólniona do dowolnego prostokąta
(`redact_box()`/`SCENE_BOXES`), bo są to szerokie karty obok siebie, nie
pełnowymiarowe wiersze telefonu:

- Zrzut Pulpitu (`211557`) niesie realne konto z dwiema rzeczami
  niezwiązanymi z tezą tej kreacji (UKŁAD interfejsu, nie widżet Rodzinnej
  Tablicy ani dokładna kwota kapitału netto):
  - widżet "Rodzinna tablica" pokazuje dwóch realnych domowników z
    dokładnymi kwotami wydatków ("Mikhail -11,04 €", "Mikhail -378,88 zł",
    "Aliona -964,77 zł") — rozmyte (`FAMILY_BAND`, zmierzone bezpośrednio
    na pikselach), nagłówek "Rodzinna tablica / Pokaż wszystkie" zostaje
    ostry, więc widżet nadal jest rozpoznawalny.
  - karta "Kapitał netto" pokazuje dokładny wielowalutowy kapitał netto
    ("+17 491,65 zł", "551,02 €", "21 428,32 zł", "$-1,700.00") — rozmyte
    (`NETWORTH_BAND`), etykiety "Kapitał netto / Łączny majątek" zostają
    ostre, więc karta nadal jest rozpoznawalna jako podsumowanie
    wielowalutowego portfela.
  Oba pasy są zastosowane do `211557` wszędzie, gdzie się pojawia (Panel A
  w story/post-4x5 i scena 0 reelu) — jeden wspólny `S.FAMILY_BAND` /
  `S.NETWORTH_BAND` w skrypcie story, importowany przez skrypt reelu, żeby
  oba pliki nie mogły się rozjechać.
- Żaden inny użyty zrzut nie niesie realnego imienia ani realnego salda w
  sposób niezwiązany z tym, co dany ekran akurat demonstruje — imiona w
  kolumnie "Dodane przez" (Transakcje) i etykieta "@Mikhail" w liście
  rozmów (Czat) dowodzą realnych, udokumentowanych funkcji (atrybucja
  transakcji, wzmianki @w czacie), więc zostają nietknięte, zgodnie z tym,
  jak te same dane tego samego konta testowego są już pokazywane w
  dziesiątkach wcześniej opublikowanych kreacji w tym repozytorium.

## Jak zbudowane są renders

Dwa nowe skrypty w `docs/marketing/scripts/` (para
story-daje-prymitywy/reel-importuje, ten sam podział co
`build_home_screen_widget_reorder_{story,reel}.py` i
`build_opoveshchenie_ob_izmenenii_kursa_{story,reel}.py`, żeby oba pliki nie
mogły się rozjechać na kolorach/fontach/redakcji), ale z jedną różnicą
konstrukcyjną: te siedem zrzutów jest DESKTOPOWYCH (~2,11:1), nie
telefonicznych (~0,46:1), więc zamiast ramki telefonu (`draw_phone()`) obie
kreacje używają realnego mockupu **okna przeglądarki** (kropki
świateł-drogowych + pigułka adresu) — dokładnie tej samej konstrukcji, jaką
`build_web_site_story.py` już ustaliło dla poprzedniej kampanii o nowej
stronie:

```
python docs/marketing/scripts/build_novyi_interfeis_veb_versii_story.py
python docs/marketing/scripts/build_novyi_interfeis_veb_versii_reel.py both reel
python docs/marketing/scripts/build_novyi_interfeis_veb_versii_reel.py both reel-4x5
python docs/marketing/scripts/build_novyi_interfeis_veb_versii_reel.py both tiktok en
```

Ostatnia linijka to wariant angielski na TikTok (patrz sekcja
"🇬🇧 English — TikTok" nizej). Aspekt `tiktok` to te same
1080x1920 co `reel`, ale caly blok jest zakotwiczony u GORY strefy
bezpiecznej TikToka zamiast wysrodkowany w kadrze — inaczej stopka (badge +
URL) wypada pod wlasnym blokiem podpisu TikToka. Skrypt sam wypisuje kontrole
granic przy kazdym buildzie `tiktok` (`_report_safe_area()`).

Renders w `docs/marketing/creatives/novyi-interfeis-veb-versii/renders/en/`:
- `novyi-interfeis-veb-versii-tiktok.mp4` / `.gif` (1080x1920, 30 fps,
  20,4 s — te same 6 scen co `reel`, uklad pod strefe bezpieczna TikToka)

Renders w `docs/marketing/creatives/novyi-interfeis-veb-versii/renders/pl/`:
- `novyi-interfeis-veb-versii-story.png` (1080×1920)
- `novyi-interfeis-veb-versii-post-4x5.png` (1080×1350, zadeklarowany
  dokładny rozmiar Centrum)
- `novyi-interfeis-veb-versii-reel.mp4` / `.gif` (1080×1920, 30 fps,
  6 scen — intro 3,2 s + pięć scen × (2,6 s hold + 0,7 s przejście),
  intro też liczy swoje 0,7 s przejście ≈ 20,4 s pętli)
- `novyi-interfeis-veb-versii-reel-4x5.mp4` / `.gif` (1080×1350)

**`story`/`post-4x5`** — dwa realne zrzuty w PEŁNI, każdy w prawdziwym oknie
przeglądarki: Panel A ("PULPIT") = `211557` (dwie kolumny widżetów, z dwoma
rozmytymi pasami); strzałka "to samo konto, inny układ"; Panel B
("TRANSAKCJE") = `211612` (pasek filtrów + tabela).

**`reel`/`reel-4x5`** — jedna scena zapowiedzi + PIĘĆ realnych zrzutów po
kolei, w kolejności dokładnie tych pięciu zakładek widocznych w pasku
górnym każdego zrzutu, jedno okno przeglądarki na raz, miękkie przesunięcie
w pionie między scenami:
0. (intro) `211557` ponownie jako tło, bez nowego zrzutu — "NOWOŚĆ" /
   "Nowa wersja desktopowa już dostępna!" (nagłówek 1,15× większy niż w
   pozostałych scenach, trzymany 3,2 s zamiast 2,6 s)
1. `211557` (Pulpit, z dwoma rozmytymi pasami) — "NOWY PULPIT" / "Wszystko
   na jednym ekranie"
2. `211612` (Transakcje) — "SZYBSZE FILTROWANIE" / "Filtry i tabela obok
   siebie"
3. `211704` (Budżet — okno dialogowe) — "SZCZEGÓŁY W OKNIE" / "Budżet
   otwiera się w jednym oknie"
4. `211808` (Analityka) — "PEŁNA ROZDZIELCZOŚĆ" / "Wykresy na całym
   ekranie"
5. `212007` (Czat AI) — "ASYSTENT AI" / "Czat na szerokim ekranie"

Trzy pigułki pod oknem w reelu: "5 zakładek" / "Od 1024 px" / "To samo
konto" — wszystkie trzy fakty udokumentowane w CLAUDE.md (pięć prawdziwych
zakładek widocznych na każdym zrzucie, `DESKTOP_MIN_WIDTH = 1024`, ten sam
login/konto co w telefonie), żadna nie wymyślona.

---

## 🇵🇱 Polski (jedyny wymagany locale — brak `DC_CREATIVE_LOCALES`, przyjęto `pl` zgodnie z przeważającą konwencją ostatnich kampanii i zapisaną preferencją operatora "marketing po polsku")

**Eyebrow / nagłówek**: NOWOŚĆ · „Nowa wersja desktopowa już dostępna!" ·
podtytuł „app.ai-budget.pl — ten sam login, myszka i klawiatura zamiast
kciuka".

CTA: **„app.ai-budget.pl"** · stopka: „Nowy układ włącza się automatycznie
od 1024 px szerokości ekranu — ta sama aplikacja i to samo konto co w
telefonie."

### Podpis do posta (PL)

```
💻 Wyszła nowa wersja desktopowa AI Budget Assistant!

app.ai-budget.pl dostał nowy interfejs na komputer — nie rozciągnięty widok
telefonu, tylko układ zaprojektowany od nowa pod myszkę i klawiaturę:

- Pulpit: widżety w dwóch kolumnach zamiast jednej długiej listy
- Transakcje: pasek filtrów obok tabeli — szukasz i filtrujesz w locie
- Budżet: szczegóły otwierają się w oknie, bez przeładowania strony
- Analityka: wykresy na pełną szerokość ekranu
- Czat AI: rozmowy po lewej, odpowiedzi w szerokiej kolumnie po prawej

Włącza się samo od 1024 px szerokości okna. Ten sam login, to samo konto —
po prostu więcej miejsca.

📲 AI Budget Assistant — app.ai-budget.pl
🔗 Link w bio / Google Play

#budżetdomowy #aplikacjawebowa #finanseosobiste #aplikacjafinansowa #AIBudgetAssistant #micode
```

### Wariant krótki (Stories)

```
Nowa wersja desktopowa już dostępna! 💻
Pulpit, transakcje, budżet, analityka, czat
Ten sam login, więcej miejsca
AI Budget Assistant
```

---

## 🇬🇧 English — TikTok (`renders/en/`)

Locale added on request ("сделай вариант на английском языке для тик ток").
**Only the TikTok video was asked for and only it was built** — `renders/en/`
deliberately holds two files, not the six every other locale directory holds.

**Eyebrow / headline**: NEW · "The desktop version is live!" — the same launch
statement as the Polish scene 0, in English.

**Scenes** (identical order and identical claims to `pl`, one-for-one — this is
the same campaign in another language, not a different edit):

| # | Screenshot | Eyebrow | Headline |
|---|---|---|---|
| 0 | `211557` (backdrop) | NEW | The desktop version is live! |
| 1 | `211557` Pulpit | NEW DASHBOARD | Everything on one screen |
| 2 | `211612` Transakcje | FASTER FILTERING | Filters and table side by side |
| 3 | `211704` Budżet dialog | DETAILS IN A WINDOW | Budgets open in a dialog |
| 4 | `211808` Analityka | FULL WIDTH | Charts across the whole screen |
| 5 | `212007` Czat AI | AI ASSISTANT | Chat on a wide screen |

Pills: **"5 tabs" / "From 1024 px" / "Same account"** — the same three
CLAUDE.md-documented facts as the Polish pills, nothing added.

**The screenshots stay the real Polish-language app UI.** They are unedited
evidence of a real account on the real deployment; re-rendering them in English
would make them a mockup of a screen nobody captured. This is the same call,
and the same wording of it, as the `en` locale of
`build_home_screen_widget_reorder_story.py`. The app itself does ship English
(`en.ts` is the source locale of all 9) — so an English-speaking viewer who
signs up sees an English UI; the ad simply shows the capture that exists.
**If that mismatch is not acceptable for this audience, the fix is new English
captures in `src/`, not a re-typeset screenshot.**

### Post caption (EN — TikTok)

```
Our web app just got a real desktop layout 💻

Not a stretched phone screen — one built for a mouse and a keyboard:

🗂 Dashboard — widgets in two columns
🔍 Transactions — filter rail right next to the table
💸 Budgets — details open in a dialog, not a new page
📊 Analytics — charts across the full width
🤖 AI chat — conversations on the left, answers in a wide column

It switches on by itself from 1024px. Same login, same account, just more room.

app.ai-budget.pl

#budgeting #personalfinance #financeapp #moneytok #budgettok #fintech #budgetapp #AIBudgetAssistant #micode
```

### Short variant (on-screen hook / first comment)

```
The desktop version is live 💻
Dashboard, transactions, budgets, analytics, AI chat
Same login — just more room
app.ai-budget.pl
```

---

## 🇬🇧 English — Threads

Added on request ("что постить по этому поводу в threads (на английском)").
English despite the standing "marketing po polsku" preference, because the ask
named the language.

**Do not paste the TikTok caption here.** It is built for a platform where the
video carries the message and the caption is an index — nine hashtags and a
five-line emoji list. On Threads the text *is* the post, and that shape reads
as an ad someone automated. Three constraints drive everything below:

| Constraint | Consequence |
|---|---|
| **500 characters per post** | The TikTok caption (~640) does not fit at all. |
| **One topic tag per post** | Nine hashtags is not a style choice here, it is impossible. |
| **Replies are the native unit** | A chain outperforms one dense post; each reply is its own 500. |

Links are clickable and do not appear to be demoted, so `app.ai-budget.pl` goes
in the post rather than in a "link in bio".

### Single post (EN — Threads)

For when only one post is wanted. 339 characters.

```
Opening a "mobile-first" app on a laptop and getting a phone screen stretched across 1400px is its own small insult.

So we rebuilt ours. Five screens laid out for a mouse and a keyboard: dashboard, transactions, budgets, analytics, AI chat. It turns on by itself at 1024px.

Same login, same account — just room to work.

app.ai-budget.pl
```

Topic tag: **budgeting**. One. If a second feels necessary, the post is trying
to reach two audiences and should be two posts.

### Thread (EN — 4 posts)

The preferred shape. Each post stands alone if someone sees only that one;
each is under 500.

**1/ — the hook** (183)

```
Most "responsive" web apps are a phone screen with the margins pulled apart. Ours was too.

So we built it a second layout, for a mouse and a keyboard. The phone version is untouched.
```

**2/ — the most concrete change** (260)

```
The clearest example is the transactions screen.

On a phone: a list, and filters behind a button.

On a laptop now: a filter rail down the side with live counts, rows grouped by day with subtotals, multi-select, and a row menu you can reach from the keyboard.
```

**3/ — the thing people feel without naming** (255)

```
The other half is that editing stopped being a trip somewhere else.

Open an expense, a budget, a map pin — it opens in a dialog over what you were reading, and closes back onto it. On a wide screen, navigating away to edit one field is just lost context.
```

**4/ — close** (198)

```
Five screens: dashboard, transactions, budgets, analytics, AI chat.

It switches on by itself at 1024px — nothing to enable, no separate app, same login and same data as the phone.

app.ai-budget.pl
```

Topic tag on post 1 only.

### If images are attached

Threads carries up to 10 per post. The same rule as the TikTok section applies
and for the same reason: **the screenshots are the real Polish-language UI of a
real account on the real deployment.** An English-speaking reader will notice.
Two honest options —

- attach them as they are and let the caption carry the English, or
- capture the same five screens with the app set to English first.

What must not happen is a re-typeset screenshot: that is a mockup of a screen
nobody ever saw, presented as evidence. The existing renders in `renders/en/`
are TikTok-shaped (vertical video); a Threads image post wants the 4:5 stills,
which today exist only in `renders/pl/`.

### What this post deliberately does not claim

- **No "AI-powered" framing.** The desktop layout contains no AI work; the AI
  chat is one of five screens and was already there.
- **No numbers.** No "3x faster", no user counts — nothing measured, so nothing
  quoted.
- **No mobile-app comparison.** The phone layout is unchanged and still the
  primary surface; "finally usable on desktop" would insult the product most
  readers actually use.

---

## Poprawka (2026-09-07)

Człowiek odesłał pierwszą wersję z dwiema uwagami (`revision_notes`,
proposal #46):

1. *"нужно что бы само видео было шире и выше. Почти до максимума по
   ширине."* — samo okno przeglądarki w reelu/reel-4x5 było postawione
   blisko górnej krawędzi kadru, z 700-800 px czarnej, pustej przestrzeni
   pod stopką — mockup wyglądał na mały, mimo że jego szerokość (980/920 px
   na kadrze 1080 px) była już blisko maksimum. Naprawa: `VIEW_W` podniesione
   do 1020 px (margines już tylko 30 px z każdej strony) DLA OBU aspektów
   reelu, a cały blok "eyebrow → stopka" jest teraz wyliczany tak, żeby był
   wyśrodkowany PIONOWO w kadrze (symetryczne marginesy góra/dół) zamiast
   przypięty do góry z całym luzem zrzuconym pod spód — patrz `_geometry()`
   w `build_novyi_interfeis_veb_versii_reel.py`.
2. *"И в начале рила и в сторис должно быть что то большими буквами, что
   вышел новый инфтерфейс декстоп версии!"* — ani reel, ani story nie mówiły
   wprost, dużymi literami, że nowa wersja desktopowa już wystartowała.
   Naprawa: obie kreacje otwierają się teraz identyczną parą "NOWOŚĆ" /
   "Nowa wersja desktopowa już dostępna!" — to nowy nagłówek story/post-4x5
   (`COPY["headline"]`) i nowa scena 0 reelu (dodana przed dotychczasową
   sceną Pulpitu, ten sam zrzut ekranu jako tło, większa czcionka
   nagłówka — `SCENE_HEAD_SCALE[0] = 1.15` — i dłuższy hold, 3,2 s zamiast
   2,6 s).

Oba skrypty zostały ponownie uruchomione po zmianach; wszystkie 6 plików w
`renders/pl/` odbudowane, `verify` (ffprobe + PIL, patrz sekcja niżej)
powtórzony.

## Uwagi produkcyjne

- Formaty zbudowane: `post-4x5`, `story`, `reel-4x5`, `reel` — dokładnie te
  cztery z `DC_CREATIVE_FORMATS`. Locale: tylko `pl` — `DC_CREATIVE_LOCALES`
  i pole `locales` w payloadzie proposal #46 były oba puste, więc żadnej
  wyraźnej decyzji operatora nie było do odziedziczenia; wybrano `pl` jako
  jedyny locale, zgodnie z większością ostatnich kampanii w tym repo
  (wallet, subscriptions, reports, financial-month,
  opoveshchenie-ob-izmenenii-kursa) i zapisaną preferencją użytkownika
  ("marketing/reklama po polsku").
- Konstrukcja okna przeglądarki (kropki + pigułka adresu) jest własnym,
  samodzielnym kodem w `build_novyi_interfeis_veb_versii_story.py` —
  NIE importuje z `build_web_site_story.py` (różne SLUG-i, różna
  konwencja: reel importuje ze swojego story, story nie importuje z innego
  story) — ale świadomie odtwarza tę samą wizualną konwencję (traffic-light
  dots, ciemna pigułka adresu z URL), żeby dwie kampanie o webowej wersji
  aplikacji nie wyglądały jak dwa różne produkty.
- Adres w pasku przeglądarki to zawsze `app.ai-budget.pl` na każdej scenie —
  celowo NIE wymyślono osobnych ścieżek (`/transakcje`, `/budzet` itd.), bo
  nie ma pewności co do dokładnego kształtu URL-i tras `expo-router` na
  tym build-zie; `app.ai-budget.pl` to jedyny fakt potwierdzony wprost w
  CLAUDE.md.
- „5 zakładek" w pigułkach reelu liczy dokładnie te pięć realnych zakładek
  widocznych w pasku górnym każdego z siedmiu zrzutów (Pulpit, Transakcje,
  Budżet, Analityka, Czat AI) — nie zaokrąglona ani wymyślona liczba.
- Żadna kwota z rozmytych pasów (`FAMILY_BAND`, `NETWORTH_BAND`) nie jest
  czytelna w żadnym renderze — sprawdzone wizualnie po zbudowaniu.
