# AI Budget Assistant — Reel „Budżety" (Instagram / Facebook Reels)

Funkcja: **Budżety z limitem na każdą kategorię** — ustawiasz jeden ogólny limit albo osobny
limit dla każdej kategorii, a aplikacja pokazuje na pulpicie, ile zostało, i podświetla te
kategorie, w których już przekraczasz. Do tego widok okresu (dzienny / tygodniowy / miesięczny /
roczny), przełączanie miesięcy, liczba dni do końca okresu i prognoza wydatków na koniec okresu.

Dlaczego warto to reklamować: budżet to funkcja, której szuka się w takiej aplikacji jako
pierwszej, a **nie miała dotąd ani reela, ani własnego posta** — w całym katalogu `copy/`
nie ma o niej osobnego materiału.

Format: pionowy 9:16 (1080×1920) + wersja 4:5 do feedu, ~24 sek (5 scen × 4 s + przejścia).
Konto: profil AI Budget Assistant.
Link: https://play.google.com/store/apps/details?id=com.budget.assistant · app.ai-budget.pl

Render:
- reel — `python build_budgets_reel.py both` (+ `4:5`)
- stories — `python build_budgets_story.py all both`

Oba trafiają do `creatives/budgets/renders/pl/`.

---

## Storyboard (PL)

Kolejność scen jest **narracyjna** (widzisz → wchodzisz w szczegóły → łapiesz przekroczenie →
ustawiasz), a nie taka, w jakiej zrzuty zostały przekazane.

| # | Czas | Co pokazujemy | Tekst na ekranie (eyebrow / nagłówek) | Uwagi |
|---|---|---|---|---|
| 1 | ~4 sek | **Pulpit** — widget „Budżet miesięczny": 1 248,94 zł z 8 200,00 zł, pomarańczowy pasek, „85% wykorzystano" | BUDŻET MIESIĘCZNY / „Jedno spojrzenie — wiesz, ile zostało" | Duża liczba to **to, co zostało**, nie to, co wydane. Bez wchodzenia w żadną zakładkę |
| 2 | ~4 sek | **Szczegóły budżetu** „Life" — plakietka „W normie", przełączanie miesięcy (Lipiec 2026), 6 951,06 zł z 8 200,00 zł, 85%, „1 248,94 zł pozostało", niżej „Podział na kategorie" z paskiem dla każdej kategorii | LIMIT NA KATEGORIĘ / „Widzisz dokładnie, gdzie przekraczasz" | Każda kategoria ma **swój** limit i swój pasek: zielony / pomarańczowy / czerwony |
| 3 | ~4 sek | **Dalsza część szczegółów** — Yoka 114,28 zł / 100,00 zł na czerwono (limit przekroczony), pod tym Okres, Próg powiadomienia, Pozostało dni 1, Prognozowana suma 6 951,06 zł, Status Aktywny | LIMIT NA KATEGORIĘ / „Widzisz dokładnie, gdzie przekraczasz" | Czerwony pasek Yoki to prawdziwe przekroczenie — nie inscenizacja. Prognoza wynika z dotychczasowego tempa wydatków |
| 4 | ~4 sek | **Edycja budżetu** — nazwa „Life", waluta zł PLN, przełącznik TRYB BUDŻETU: **Ogólny / Według kategorii**, pod nim limity: Entertainment 300, Medicine 200, Flat 4350, Orange 50, Aliona 400 | USTAWIASZ RAZ / „Ogólny limit albo na kategorie" | To jest właściwy wyróżnik: jeden budżet może być ogólny **albo** rozbity na dowolne kategorie |
| 5 | ~4 sek | **Dalsza część edycji** — kolejne limity, „Dodaj kategorię", Budżet łączny 8 200,00 zł (liczony sam), OKRES: Dzienny / Tygodniowy / Miesięczny / Roczny, POWIADOM PRZY, Zapisz | USTAWIASZ RAZ / „Ogólny limit albo na kategorie" | Budżet łączny **sumuje się sam** z limitów kategorii — nie trzeba go liczyć w głowie |

Chipy na dole (stałe): **Limity · Kategorie · Alerty**.

**Prywatność w scenie 1:** zrzut pulpitu ma **dwa rozmyte pasy** — kwota „Bezpieczne wydatki"
oraz kwoty Przychody / Wydatki. Oba zdradzają dochód i stan konta, a żaden nie jest potrzebny,
by sprzedać funkcję. Liczby samego budżetu (1 248,94 zł z 8 200,00 zł, 85%) zostają ostre,
bo **one są przekazem**. Rozmycie robi skrypt (`HOME_BLUR_BANDS`), nie trzeba go dodawać ręcznie.

**Do decyzji przed publikacją:** kategorie na zrzutach to własne kategorie tego konta i część
z nich to **imiona domowników** (Mikita, Yoka, Aliona). Fabularnie działa to na plus — pokazuje,
że kategorię można nazwać dowolnie, np. per osoba w rodzinie — ale to prawdziwe imiona.
Jeśli mają nie wychodzić na zewnątrz, potrzebne są nowe zrzuty z budżetu testowego;
skrypt ich nie rusza.

---

## Stories

`build_budgets_story.py` **importuje** `build_budgets_reel`, więc kadry scenowe dziedziczą
rozmycie z `HOME_BLUR_BANDS` — nie ma drugiego miejsca, które mogłoby o nim zapomnieć.

| Plik | Rozmiar | Co to jest |
|---|---|---|
| `stories/01-pulpit.png` | 1080×1920 | scena 1 jako osobne Story (pulpit + widget budżetu) |
| `stories/02-kategorie.png` | 1080×1920 | scena 2 (podział na kategorie) |
| `stories/03-przekroczenie.png` | 1080×1920 | scena 3 (Yoka na czerwono + prognoza) |
| `stories/04-tryb.png` | 1080×1920 | scena 4 (Ogólny / Według kategorii) |
| `stories/05-okres.png` | 1080×1920 | scena 5 (budżet łączny + okres) |
| `budgets-story-all.png` | 1080×1920 | podsumowanie: 4 kroki, bez telefonu |
| `budgets-story-all-4x5.png` | 1080×1344 | to samo do feedu |

Kroki na podsumowaniu: **1** Ustawiasz limit → ogólny albo na każdą kategorię · **2** Każda
kategoria ma swój pasek → zielony, pomarańczowy, czerwony · **3** Przekroczenia widzisz od razu
→ na czerwono, bez szukania · **4** Na pulpicie jedna liczba → ile jeszcze zostało.

Żaden krok nie mówi o wyborze progu powiadomienia — patrz „Czego NIE obiecujemy".

Dolny pas obu podsumowań jest celowo pusty: na Stories zakrywa go interfejs odpowiedzi
platformy. Skrypt ostrzega (`WARNING`), gdy wiersze podejdą pod stopkę.

---

## Podpis do posta (PL)

```
💸 „Gdzie mi się rozeszły te pieniądze?" — budżet odpowiada, zanim zapytasz.

AI Budget Assistant pozwala ustawić limit nie tylko na cały miesiąc, ale osobno na każdą kategorię. Na pulpicie widzisz jedną liczbę: ile jeszcze zostało.

Jak to działa:
📊 Jeden ogólny limit ALBO osobny limit dla każdej kategorii — Ty wybierasz tryb
🎯 Każda kategoria ma swój pasek: zielony, pomarańczowy, czerwony
🔴 Przekroczone kategorie widzisz od razu — nie musisz ich szukać
📅 Okres do wyboru: dzienny, tygodniowy, miesięczny, roczny
📈 Prognoza na koniec okresu na podstawie Twojego tempa wydatków
🔔 Powiadomienie, gdy zbliżasz się do limitu — dla całego budżetu i dla pojedynczej kategorii

Budżet, który nie jest tabelką do wypełniania, tylko jedną liczbą na ekranie 👇
```

**Hashtagi:** #budżet #budżetdomowy #limitwydatków #oszczędzanie #finanseosobiste #kontrolawydatków #planowaniebudżetu #aplikacjafinansowa #wydatki #budżetrodzinny #AIBudgetAssistant #micode

---

## Wersja krótka (Stories / 1 kadr)

```
💸 Wiesz, ile Ci jeszcze zostało w tym miesiącu?

Limit osobno na każdą kategorię — a na pulpicie
jedna liczba: ile zostało.

Przekroczone kategorie na czerwono 👇
```

---

## Czego NIE obiecujemy w tym poście

Świadome ograniczenia — żadna wersja tekstu nie może ich przekroczyć:

- **Użytkownik NIE wybiera, kiedy dostanie ostrzeżenie.** Ekran ma chip „POWIADOM PRZY"
  (a szczegóły pokazują „Próg powiadomienia"), ale `budget-alert.service.ts` iteruje po
  zaszytej liście `THRESHOLDS = [50, 80, 100]` i **nigdy nie czyta**
  `budget.thresholdPercentage`. Powiadomienia lecą przy 50%, 80% i 100% niezależnie od
  ustawienia. Dlatego nagłówek sceny 4–5 mówi „Ogólny limit albo na kategorie", a **nie**
  „próg alertu", i w podpisie jest tylko „powiadomienie, gdy zbliżasz się do limitu".
  (Rozbieżność zgłoszona osobno — jeśli zostanie naprawiona, tę linię można zmienić.)
- **Prognoza to nie AI i nie predykcja.** „Prognozowana suma" =
  `wydane / dni_które_minęły × dni_w_okresie`, czyli liniowe przedłużenie dotychczasowego
  tempa. Piszemy „na podstawie Twojego tempa wydatków", nigdy „sztuczna inteligencja
  przewiduje".
- **Aplikacja nie blokuje wydatków.** Przekroczenie limitu jest tylko pokazane i zgłoszone —
  nic się nie zatrzymuje, nie ma żadnej blokady karty ani transakcji.
- **Powiadomienia wymagają zgody.** Push przychodzi tylko, jeśli użytkownik ma włączone
  powiadomienia i nie wyłączył alertów budżetowych w ustawieniach. Nie piszemy „zawsze
  dostaniesz powiadomienie".
- **Nie obiecujemy oszczędności w złotówkach.** Żadnego „zaoszczędzisz X zł miesięcznie" —
  budżet pokazuje i ostrzega, a decyzję podejmuje użytkownik.
