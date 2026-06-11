# Pulpit

> Twoje centrum dowodzenia finansami. Zobacz status budzetu, przychody, wydatki i salda portfela na pierwszy rzut oka, z szybkimi akcjami pozwalajacymi dodac wydatek jednym dotknieciem. Mozesz pokazywac lub ukrywac poszczegolne sekcje w [Ustawieniach](./11-settings.md) → Widgety pulpitu.

## Przeglad

Pulpit to pierwszy ekran, ktory widzisz po zalogowaniu. Wyswietla kontekst aktualnego konta oraz kluczowe wskazniki finansowe za biezacy miesiac.

![Pulpit z szybkimi akcjami i przegladem budzetu](../img/home-1.jpg)

## Przelaczanie kont

W lewym gornym rogu dotknij nazwy konta (np. **Rodzina**), aby otworzyc menu **Przelacz konto**. Mozesz przelaczac miedzy kontami Osobistymi, Wspolnymi i Firmowymi. Wszystkie dane na Pulpicie aktualizuja sie zgodnie z wybranym kontem.

Obok nazwy konta widoczny jest osobny **przycisk waluty** (np. `zł`) — dotknij go, aby natychmiast zmienić walutę wyświetlania.

## Szybkie akcje

Szybkie akcje pod nagłówkiem to siatka skrótów jednego dotknięcia do najczęstszych zadań. Gdy akcji jest więcej niż mieści się w jednym rzędzie, zawijają się do kolejnego, dzięki czemu wszystkie akcje pozostają widoczne.

Dostępne akcje:

| Akcja | Opis |
|---|---|
| **Dodaj wydatek** | Otwiera formularz ręcznego dodawania wydatku |
| **Skanuj paragon** | Otwiera aparat, aby sfotografować paragon do ekstrakcji AI |
| **Glosowo** | Powiedz swój wydatek naturalnie |
| **Przychód głosowo** | Powiedz swój przychód naturalnie (domyślnie ukryte) |
| **Skanuj fakturę** | Sfotografuj fakturę, aby zarejestrować przychód (domyślnie ukryte) |
| **Kantor** | Otwiera formularz wymiany walut |
| **Kalkulator walut** | Otwiera kalkulator walutowy |
| **Przelewy** | Otwiera formularz przelewu między portfelami |

Możesz dostosować ten pasek: przejdź do **Ustawienia → Widgety pulpitu**, otwórz sekcję **Szybkie akcje**, włącz lub wyłącz dowolne akcje i przeciągnij uchwyty, aby je przestawić. **Przychód głosowo** i **Skanuj fakturę** są domyślnie ukryte — włącz je tam, jeśli rejestrujesz przychody głosowo lub skanując faktury.

## Kondycja Finansowa

Widget **Kondycja Finansowa** wyświetla pojedynczy wynik od 0 do 100 podsumowujący Twoją ogólną kondycję finansową w bieżącym miesiącu:

- **Zielony (70–100)** — finanse w doskonałym stanie
- **Żółty (40–69)** — niektóre obszary wymagają uwagi
- **Czerwony (0–39)** — wykryto poważne problemy

Okrągły wskaźnik w prawym górnym rogu karty wypełnia się proporcjonalnie do wyniku. Kliknij kartę, aby otworzyć szczegółowy widok z czterema składnikami:

| Składnik | Maks pkt | Opis |
|---|---|---|
| Przestrzeganie budżetu | 25 | % aktywnych budżetów nieprzekraczających limitu |
| Stopa oszczędności | 25 | Liniowe mapowanie % miesięcznych oszczędności (0% → 0 pkt, 20%+ → 25 pkt) |
| Postęp celów | 25 | % aktywnych celów oszczędnościowych realizowanych terminowo |
| Stan zadłużenia | 25 | Proporcjonalne odliczenie za przeterminowane długi |

> **„Za mało danych"** pojawia się, gdy mniej niż dwa składniki mają dane (np. zupełnie nowe konto bez budżetów, celów, długów ani przychodów).

Wynik jest obliczany wyłącznie na urządzeniu — bez połączenia z internetem ani wywołań AI.

## Widget grywalizacji

Ponizej szybkich akcji kompaktowa karta pokazuje Twoj postep w grywalizacji:

- **Poziom** — Twoj aktualny poziom z paskiem postepu XP do nastepnego poziomu
- **Seria** — licznik Twojej codziennej serii sledzenia z emoji ognia lub platka sniegu

Dotknij te karte, aby otworzyc pelny ekran **Osiagniec** ze wszystkimi odznakami, szczegolami serii i filtrami kategorii.

> Zobacz [Osiagniecia i Grywalizacja](./13-gamification.md), aby dowiedziec sie wiecej o XP, poziomach i osiagnieciach.

## Karta budzetu miesiecznego

- Pokazuje biezace wydatki w stosunku do budzetu miesiecznego (np. **2 846,83 zl z 20 000,00 zl**)
- Pasek postepu z kodowaniem kolorami: zielony (pod kontrola), zolty (zblizasz sie do limitu), czerwony/pomaranczowy (blisko lub ponad budzet)
- Wyswietla **procent wykorzystania** (np. 86% wykorzystano)
- Dotknij karte, aby przejsc do zakladki **Budzety** po szczegoly

> **Uwaga:** Jezeli nie masz ustawionego budzetu miesiecznego, zobaczysz podpowiedz, aby go utworzyc.

## Przychody i wydatki

![Pulpit przewiniety — przychody, wydatki, portfel](../img/home-2.jpg)

Polaczona karta z miesiecznymi sumami obok siebie:

- **Przychody** (po lewej, na zielono) — laczne przychody za biezacy miesiac (np. **+2 482,52 $**). Dotknij, aby przejsc do zakladki **Transakcje** (widok Przychody)
- **Wydatki** (po prawej) — laczne wydatki za biezacy miesiac (np. **-4 838,99 $**). Dotknij, aby przejsc do zakladki **Transakcje** (widok Wydatki)

## Zysk netto

Ponizej kart przychodow i wydatkow widget **Zysk netto** pokazuje, ile pieniedzy naprawde zaoszczedziles lub straciles w tym miesiacu, i sledzi trend z ostatnich 6 miesiecy jako wykres liniowy:

- **Zysk netto biezacego miesiaca** — wyswietlany nad wykresem na zielono (dodatni) lub czerwono (ujemny)
- **Trend 6-miesiczny** — wykres liniowy miesicznego zysku netto (przychody − wydatki) z ostatnich 6 miesiecy
- Dotknij punktu danych, aby zobaczyc dokladna wartosc za dany miesiac

> **Wzor:** Zysk netto = Laczne przychody − Laczne wydatki (oba przeliczone na walute bazowa)

## Kapital netto

Widget **Kapital netto** pokazuje Twoj laczny majatek netto we wszystkich portfelach walutowych, przeliczony na walute bazowa:

- **Laczny kapital netto** — suma wszystkich sald portfela przeliczona na walute ustawien, na zielono (dodatni) lub czerwono (ujemny)
- **Podzial wedlug walut** — biezace saldo kazdej waluty jest wymienione ponizej sumy

> **Uwaga:** Widget Kapital netto pojawia sie dopiero po ustawieniu sald poczatkowych portfela. Zobacz [Portfel i wymiana walut](./10-wallet-and-exchange.md), aby je skonfigurowac.

## Karta Tropiciela wydatkow

Ponizej sekcji zobowiazan karta **Tropiciel wydatkow** pokazuje podsumowanie Twojego miesiecznego audytu wydatkow:

- **Laczne potencjalne oszczednosci** — ile mozesz zaoszczedzic miesiecznie
- **3 glowne odkrycia** — szybka lista z kropkami waznosci i kwotami oszczednosci
- **Zobacz pelny raport** — dotknij, aby otworzyc szczegolowy ekran Tropiciela wydatkow

Ta karta wymaga subskrypcji **Pro lub Business**. Uzytkownicy planu darmowego zobacza zachete do ulepszenia.

> Zobacz [Tropiciel wydatkow](./19-fat-finder.md) — pelny przewodnik po funkcji.

## Kalendarz

Widget **Kalendarz** wyświetla siatkę miesięczną z kolorowymi kropkami oznaczającymi dni z transakcjami:

- **Zielona kropka** — tego dnia zarejestrowano przychód
- **Czerwona kropka** — tego dnia zarejestrowano wydatek
- **Dziś** wyróżniony jest pomarańczowym kółkiem
- **Nawigacja po miesiącach** — strzałki w lewo/prawo do przełączania między miesiącami

Pod siatką kalendarza wyświetlane jest podsumowanie:

- **Przychody** — łączne przychody za wybrany miesiąc (przeliczone na walutę bazową)
- **Wydatki** — łączne wydatki za wybrany miesiąc
- **Zysk netto** — przychody minus wydatki, na zielono jeśli dodatni, na czerwono jeśli ujemny

Dotknij **Dotknij, aby zobaczyć szczegóły**, aby otworzyć pełny ekran Kalendarza z trzema zakładkami:

| Zakładka | Zawartość |
|---|---|
| **Kategorie** | Podział przychodów i wydatków wg kategorii — każdy wiersz pokazuje ikonę kategorii, nazwę, procent i kwotę. Zysk netto na dole |
| **Konta** | Bieżące saldo każdego portfela walutowego z procentem od sumy |
| **Transakcje** | Chronologiczna lista wszystkich transakcji za miesiąc. Dotknij dnia w kalendarzu, aby przefiltrować po konkretnym dniu; dotknij ponownie, aby anulować filtr |

> **Wskazówka:** Wszystkie kwoty w Kalendarzu są automatycznie przeliczane na walutę bazową, więc widzisz dokładne sumy nawet przy wielu walutach.

## Salda portfela

- Poziomo przewijane karty pokazujace saldo w kazdej walucie (np. **EUR 16 723,00**, **PLN 2 192,89**, **USD 56...**)
- Dotknij **Zobacz wszystko**, aby przejsc do pelnego widoku Portfela ze szczegolowym podzialem
- Jezeli nie masz ustawionych sald, zobaczysz zachete do dodania salda poczatkowego

## Odswiezanie

Przeciagnij w dol w dowolnym miejscu na Pulpicie, aby odswiezyc wszystkie dane i zsynchronizowac z serwerem.

## FAQ

- **P: Dlaczego Pulpit pokazuje 0 dla wszystkiego?**
  **O:** Nie dodales jeszcze zadnych wydatkow ani przychodow. Uzyj przyciskow szybkich akcji, aby dodac swoja pierwsza transakcje.

- **P: Czy moge dostosowac wyglad Pulpitu?**
  **O:** Tak. Przejdz do **Ustawienia → Widgety pulpitu** i wlacz lub wylacz poszczegolne sekcje. Twoje preferencje sa zapisywane i zachowywane po ponownym uruchomieniu. Możesz też przeciągać widgety, aby je przestawiać. Pasek szybkich akcji można dostosować w ten sam sposób — otwórz sekcję **Szybkie akcje** w Ustawienia → Widgety pulpitu, aby pokazać, ukryć lub przestawić jego przyciski.

---

*Zobacz takze: [Wydatki i przychody](./03-expenses-and-income.md) | [Portfel i wymiana walut](./10-wallet-and-exchange.md) | [Tropiciel wydatkow](./19-fat-finder.md) | [Analizy](./06-analytics.md)*
