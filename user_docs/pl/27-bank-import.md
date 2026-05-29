# Importowanie transakcji z banku

> Importuj transakcje z wyciągu CSV lub PDF swojego banku. Obsługiwane: mBank, PKO BP, Erste Bank, Alior Bank, Wise oraz dowolny bank przez uniwersalny mapper kolumn.

## Obsługiwane banki

- **mBank** — eksport CSV
- **PKO BP** — eksport CSV
- **Erste Bank** — wyciąg PDF
- **Alior Bank** — wyciąg PDF
- **Wise** — eksport CSV (wielowalutowy, konwersje wykrywane automatycznie)
- **Inny** — dowolny bank, przez uniwersalny mapper kolumn (CSV)

## Jak importować

1. Przejdź do **Ustawienia → Import transakcji**
2. Wybierz swój bank z listy (lub **Inny (CSV)**, jeśli go nie ma)
3. Wybierz plik wyeksportowany z banku
4. Aplikacja pokazuje podgląd — każdy wiersz oznaczony jako wydatek, dochód lub wymiana waluty
5. Odznacz niepotrzebne wiersze i kliknij **Importuj**

Aplikacja pomija wiersze, które już istnieją w koncie, dopasowując po dacie, kwocie i walucie.

## Gdzie znaleźć eksport w swoim banku

- **mBank**: Bankowość internetowa → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)
- **Wise**: wise.com → Transactions → Statements and Reports → wybierz zakres dat → CSV → wybierz walutę → Pobierz

> **Wskazówka dla Wise:** Wise generuje jeden CSV na każde saldo walutowe. Importuj każdą walutę osobno. Do 469 dni na eksport.

## Wise — konwersje walut i opłaty

Przy konwersji walut w Wise (np. 100 USD → EUR) powstają dwa wiersze. Aplikacja automatycznie wykrywa te pary i tworzy jeden rekord **Wymiany walut** (Portfel → Wymiany).

Opłaty Wise z kolumny `Total fees` są automatycznie wliczane w kwotę wydatku.

## Co jest importowane

Każdy wiersz staje się Wydatkiem, Dochodem lub Wymianą walut. Kategorie są sugerowane automatycznie dla popularnych sklepów. Każdy wiersz jest oznaczony unikalnym ID — ponowny import tego samego pliku jest bezpieczny.

## „Inny" — uniwersalny mapper

Jeśli Twojego banku nie ma na liście, wybierz **Inny (CSV)**. Aplikacja pokaże podgląd pliku i poprosi o wskazanie kolumn z datą, kwotą i opisem. Zapisz to mapowanie — kolejny CSV z takim samym układem kolumn zostanie zaimportowany automatycznie.

## Historia importów i Cofnięcie

Sekcja **Poprzednie importy** na dole **Ustawienia → Import transakcji** pokazuje ostatnie 20 importów.

Aby cofnąć import, dotknij **strzałki cofania** (↩) po prawej. Wszystkie transakcje z tego importu zostaną usunięte, a blokada duplikatów zostanie wyczyszczona.

- Cofnięcie jest dostępne przez **30 dni** od importu.

## Nie widzisz swojego banku?

Na dole **Ustawienia → Import transakcji** jest karta **„Nie widzisz swojego banku?"**. Dotknij, podaj nazwę banku i załącz przykładowy wyciąg.

## Kodowanie

Dla CSV aplikacja automatycznie wykrywa UTF-8 i Windows-1250. Wyciągi PDF są odczytywane bezpośrednio.

---

*Zobacz też: [Wydatki i dochody](./03-expenses-and-income.md) | [Portfel i wymiana](./10-wallet-and-exchange.md) | [Ustawienia](./11-settings.md)*
