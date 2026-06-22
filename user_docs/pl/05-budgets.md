# Budżety

> Ustalaj limity wydatków i śledź postępy w czasie rzeczywistym. Twórz budżety dla konkretnych kategorii lub rozdzielaj budżet między wiele kategorii, z konfigurowalnymi okresami i automatycznymi progami alertów.

## Przegląd

Budżety pomagają kontrolować wydatki poprzez ustalanie limitów na określone okresy. Aplikacja śledzi Twoje wydatki w stosunku do tych limitów i powiadamia Cię, gdy zbliżasz się do limitu lub go przekraczasz.

![Szczegóły budżetu z podziałem na kategorie](../img/budgets.jpg)

## Lista budżetów

Zakładka **Budżety** wyświetla wszystkie aktywne budżety:

- **Nazwa budżetu** i okres (Dzienny, Tygodniowy, Miesięczny, Roczny, Własny)
- **Pasek postępu** — wizualny wskaźnik wydatków w stosunku do limitu
- **Kwota wydana** z całkowitego budżetu (np. "2 846 zł z 20 000 zł")
- **Znacznik statusu**:
  - **W normie** (zielony) — wydatki mieszczą się w limicie
  - **Przekroczono budżet** (czerwony) — wydatki przekroczyły limit
- Kwota **pozostało** lub kwota przekroczenia

> **Uwaga:** Jeżeli nie masz jeszcze żadnych budżetów, zobaczysz komunikat: "Utwórz budżet, aby zacząć śledzić swoje limity wydatków."

## Tworzenie budżetu

### Krok po kroku

1. Dotknij **Utwórz budżet** w zakładce Budżety (lub przycisk **+**)
2. Wprowadź **Nazwę budżetu** (np. "Miesięczne zakupy spożywcze")
3. Wybierz **Walutę**
4. Wybierz **Tryb budżetu**:
   - **Ogólny** — jedna łączna kwota, opcjonalnie powiązana z jedną kategorią
   - **Według kategorii** — podziel budżet między wiele kategorii, każda z własnym limitem
5. Wprowadź **Kwotę** (tryb Ogólny) lub dodaj kategorie z kwotami (tryb Według kategorii)
6. Wybierz **Okres**:
   - **Dzienny** — resetuje się codziennie
   - **Tygodniowy** — resetuje się co tydzień
   - **Miesięczny** — resetuje się co miesiąc
   - **Roczny** — resetuje się co rok
7. Ustaw próg **Powiadom przy** (domyślnie: 80%) — otrzymasz powiadomienie, gdy wydatki osiągną ten procent
8. Dotknij **Utwórz budżet**

### Tryb „Według kategorii"

W trybie **Według kategorii** możesz ustawić limit wydatków dla każdej kategorii:

- Dotknij **Dodaj kategorię**, aby wybrać kategorię z listy
- Wprowadź kwotę dla każdej kategorii
- Całkowity budżet równa się sumie wszystkich kategorii
- Możesz dodać dowolną liczbę kategorii

## Szczegóły budżetu

Dotknij dowolny budżet, aby zobaczyć pełne szczegóły:

- **Wizualizacja postępu** — pasek pokazujący wydatki w stosunku do limitu
- **Status** — W normie lub Przekroczono budżet
- **Podział na kategorie** — dla budżetów z wieloma kategoriami widoczny jest postęp każdej:
  - Kolorowa kropka + nazwa kategorii
  - Wydano / przydzielono
  - Pasek postępu kategorii (zielony/żółty/czerwony)
- **Okres** — zakres czasowy budżetu
- **Próg powiadomienia** — punkt wyzwalania powiadomienia (np. 80%)
- **Pozostało dni** — ile dni pozostało w bieżącym okresie
- **Prognozowana suma** — szacowane całkowite wydatki do końca okresu
- **Aktywny/Nieaktywny** — aktualny status budżetu

### Akcje:
- **Edytuj** (ikona ołówka) — zmodyfikuj nazwę, kwotę, kategorie, okres lub próg powiadomienia
- **Usuń** — usuń budżet (z potwierdzeniem)

## Historia wydatków

Karta **Historia** pokazuje, jak przestrzegałeś budżetu przez ostatnie 6 okresów. Dostępna dla wszystkich typów okresów z wyjątkiem Niestandardowego.

- **Wykres słupkowy** — każda grupa pokazuje dwa słupki: rzeczywiste wydatki (kolorowy) i limit budżetu (szary) za dany okres.
  - Zielony słupek — wydatki w granicach limitu
  - Czerwony słupek — limit przekroczony
- **Podsumowanie zgodności** — np. „Przekroczono 3 z 6 okresów" lub „Śr. oszczędności: 42 zł"
- **Średnia nadwyżka** — jeśli limit był przekraczany, pokazuje średnią kwotę przekroczenia

> **Wskazówka:** Używaj karty historii, aby wykryć powtarzające się wzorce nadmiernych wydatków. Jeśli widzisz 3–4 czerwone słupki z rzędu, rozważ podwyższenie limitu lub zmianę nawyków w tej kategorii.

## Edytowanie budżetu

Dotknij **ikony ołówka** na ekranie szczegółów budżetu, aby przejść do trybu edycji:

- Zmień nazwę budżetu, walutę, okres lub próg powiadomienia
- Przełącz między trybami **Ogólny** i **Według kategorii**
- W trybie Według kategorii: dodawaj, usuwaj lub zmieniaj kwoty kategorii
- Dotknij **Zapisz**, aby zastosować zmiany, lub **Anuluj**, aby je odrzucić

## Alerty budżetowe

Aplikacja automatycznie monitoruje Twoje budżety i wysyła powiadomienia:

- **Alert progowy** — gdy wydatki osiągną ustawiony procent alertu (np. 80%)
- **Alert przekroczenia budżetu** — gdy wydatki przekroczą 100%
- Kolor paska postępu zmienia się dynamicznie:
  - Zielony — poniżej 80% wykorzystania
  - Żółty/Pomarańczowy — 80–100% wykorzystania
  - Czerwony — powyżej 100% wykorzystania

> **Wskazówka:** Karta Budżetu miesięcznego na Pulpicie pokazuje status Twojego głównego budżetu na pierwszy rzut oka.

## FAQ

- **P: Czy mogę mieć wiele budżetów jednocześnie?**
  **O:** Tak! Możesz tworzyć tyle budżetów, ile potrzebujesz — dla różnych kategorii, okresów lub ogólnych wydatków.

- **P: Jaka jest różnica między trybem Ogólnym a Według kategorii?**
  **O:** Ogólny ustawia jeden łączny limit (opcjonalnie dla jednej kategorii). Według kategorii pozwala ustawić osobny limit dla każdej kategorii — przydatne, gdy chcesz śledzić artykuły spożywcze, transport i rozrywkę osobno w ramach jednego budżetu.

- **P: Co dzieje się, gdy okres budżetu się kończy?**
  **O:** Budżet automatycznie resetuje się na nowy okres. Dane o poprzednich wydatkach są przechowywane w Analityce.

- **P: Czy budżet śledzi wydatki we wszystkich walutach?**
  **O:** Każdy budżet jest powiązany z jedną walutą. Tylko wydatki w tej walucie są wliczane do budżetu.

---

*Zobacz także: [Pulpit](./02-dashboard.md) | [Analityka](./06-analytics.md)*
