# Budzety

> Ustalaj limity wydatkow i sledz postepy w czasie rzeczywistym. Twórz budzety dla konkretnych kategorii lub ogolnych wydatkow, z konfigurowalnymi okresami i automatycznymi progami alertow.

## Przeglad

Budzety pomagaja kontrolowac wydatki poprzez ustalanie limitow na okreslone okresy. Aplikacja sledzi Twoje wydatki w stosunku do tych limitow i powiadamia Cie, gdy zblizasz sie do limitu lub go przekraczasz.

## Lista budzetow

Zakladka **Budzety** wyswietla wszystkie aktywne budzety:

- **Nazwa budzetu** i okres (Dzienny, Tygodniowy, Miesieczny, Roczny, Wlasny)
- **Pasek postepu** -- wizualny wskaznik wydatkow w stosunku do limitu
- **Kwota wydana** z calkowitego budzetu (np. "2 846 zl z 20 000 zl")
- **Znacznik statusu**:
  - **W normie** (zielony) -- wydatki mieszcza sie w limicie
  - **Przekroczono budzet** (czerwony) -- wydatki przekroczyly limit
- Kwota **pozostalo** lub kwota przekroczenia

> **Uwaga:** Jezeli nie masz jeszcze zadnych budzetow, zobaczysz komunikat: "Utworz budzet, aby zaczac sledzic swoje limity wydatkow."

## Tworzenie budzetu

### Krok po kroku

1. Dotknij **Utworz budzet** w zakladce Budzety (lub przycisk **+**)
2. Wprowadz **Nazwe budzetu** (np. "Miesieczne zakupy spozywcze")
3. Wprowadz **Kwote** -- Twoj limit wydatkow
4. Wybierz **Walute**
5. Wybierz **Okres**:
   - **Dzienny** -- resetuje sie codziennie
   - **Tygodniowy** -- resetuje sie co tydzien
   - **Miesieczny** -- resetuje sie co miesiac
   - **Roczny** -- resetuje sie co rok
   - **Wlasny** -- ustaw wlasny zakres dat
6. Opcjonalnie wybierz **Kategorie** -- aby sledzic wydatki tylko w konkretnej kategorii (np. "Jedzenie i restauracje"). Pozostaw puste dla budzetu ogolnego sledzacego wszystkie wydatki
7. Ustaw prog **Powiadom przy** (domyslnie: 80%) -- otrzymasz powiadomienie, gdy wydatki osiagna ten procent
8. Dotknij **Utworz budzet**

## Szczegoly budzetu

Dotknij dowolny budzet, aby zobaczyc pelne szczegoly:

- **Wizualizacja postepu** -- pasek pokazujacy wydatki w stosunku do limitu
- **Status** -- W normie lub Przekroczono budzet
- **Okres** -- zakres czasowy budzetu
- **Kategoria** -- sledzona kategoria (lub "Wszystkie" dla budzetow ogolnych)
- **Prog powiadomienia** -- punkt wyzwalania powiadomienia (np. 80%)
- **Pozostalo dni** -- ile dni pozostalo w biezacym okresie
- **Prognozowana suma** -- szacowane calkowite wydatki do konca okresu na podstawie obecnego tempa
- **Aktywny/Nieaktywny** -- wlacz lub wylacz budzet

### Akcje:
- **Edytuj** -- zmodyfikuj nazwe, kwote lub ustawienia budzetu
- **Usun** -- usun budzet (z potwierdzeniem)

## Alerty budzetowe

Aplikacja automatycznie monitoruje Twoje budzety i wysyla powiadomienia:

- **Alert progowy** -- gdy wydatki osiagna ustawiony procent alertu (np. 80%)
- **Alert przekroczenia budzetu** -- gdy wydatki przekrocza 100%
- Kolor paska postepu zmienia sie dynamicznie:
  - Zielony -- ponizej 70% wykorzystania
  - Zolty/Pomaranczowy -- 70-90% wykorzystania
  - Czerwony -- powyzej 90% wykorzystania

> **Wskazowka:** Karta Budzetu miesiecznego na Pulpicie pokazuje status Twojego glownego budzetu na pierwszy rzut oka.

## FAQ

- **P: Czy moge miec wiele budzetow jednoczesnie?**
  **O:** Tak! Mozesz tworzyc tyle budzetow, ile potrzebujesz -- dla roznych kategorii, okresow lub ogolnych wydatkow.

- **P: Co dzieje sie, gdy okres budzetu sie konczy?**
  **O:** Budzet automatycznie resetuje sie na nowy okres. Dane o poprzednich wydatkach sa przechowywane w Analityce.

- **P: Czy budzet sledzi wydatki we wszystkich walutach?**
  **O:** Kazdy budzet jest powiazany z jedna waluta. Tylko wydatki w tej walucie sa wliczane do budzetu.

---

*Zobacz takze: [Pulpit](./02-dashboard.md) | [Analityka](./06-analytics.md)*
