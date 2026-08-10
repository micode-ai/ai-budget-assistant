# Importowanie transakcji z banku

> Importuj transakcje z wyciągu CSV, XLSX lub PDF swojego banku. Obsługiwane: mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise oraz dowolny bank przez uniwersalny mapper kolumn.

## Obsługiwane banki

- **mBank** — eksport CSV
- **PKO BP** — eksport CSV
- **Erste Bank** — wyciąg PDF
- **Alior Bank** — wyciąg PDF
- **Revolut** — eksport CSV
- **Wise** — eksport CSV (wielowalutowy, konwersje wykrywane automatycznie)
- **Inny** — dowolny bank, przez uniwersalny mapper kolumn (CSV)
- **Arkusze** — wyciągi XLSX też działają; aplikacja czyta pierwszy arkusz

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
- **Revolut**: aplikacja Revolut → Statements → wybierz zakres dat → CSV → Pobierz
- **Wise**: wise.com → Transactions → Statements and Reports → wybierz zakres dat → CSV → wybierz walutę → Pobierz

> **Wskazówka dla Wise:** Wise generuje jeden CSV na każde saldo walutowe. Importuj każdą walutę osobno. Do 469 dni na eksport.

## Wise — konwersje walut i opłaty

Przy konwersji walut w Wise (np. 100 USD → EUR) powstają dwa wiersze. Aplikacja automatycznie wykrywa te pary i tworzy jeden rekord **Wymiany walut** (Portfel → Wymiany).

Opłaty Wise z kolumny `Total fees` są automatycznie wliczane w kwotę wydatku.

## Co jest importowane

Każdy wiersz staje się Wydatkiem, Dochodem lub Wymianą walut. Kategorie są sugerowane automatycznie dla popularnych sklepów. Każdy wiersz jest oznaczony unikalnym ID — ponowny import tego samego pliku jest bezpieczny.

**Schludniejsze nazwy sprzedawców.** Znane sieci sklepów są rozpoznawane automatycznie, dzięki czemu wiersz z wyciągu taki jak `BIEDRONKA 1234 WARSZAWA` jest zapisywany po prostu jako **Biedronka**. Jeden sklep jest wtedy widoczny w analityce jako jeden sprzedawca, a nie dziesiątki oddzielnych wpisów.

## „Inny" — uniwersalny mapper

Jeśli Twojego banku nie ma na liście, wybierz **Inny (CSV)**. Aplikacja pokaże podgląd pliku i poprosi o wskazanie kolumn z datą, kwotą i opisem. Zapisz to mapowanie — kolejny CSV z takim samym układem kolumn zostanie zaimportowany automatycznie.

## Gdy nic nie rozpoznaje Twojego wyciągu

Jeśli żaden z powyższych banków nie pasuje, a plik nie ma prostego układu kolumn, który aplikacja mogłaby sama odgadnąć, może poprosić model AI o rozpoznanie kolumn za Ciebie — która jest datą, która kwotą i tak dalej.

**Zanim cokolwiek zostanie wysłane, zostaniesz zapytany raz.** Za pierwszym razem dla danego konta zobaczysz ekran wyjaśniający, co opuszcza Twoje urządzenie: dla CSV lub arkusza — tylko wiersz nagłówka plus do 10 przykładowych wierszy, nigdy cały plik. Dla wyciągu PDF — pierwsze 20 linijek wyodrębnionego tekstu. Decydujesz raz na konto; potem aplikacja pamięta Twój wybór.

- **Zaakceptuj**, a plik zostanie odczytany ponownie z kolumnami ustalonymi przez model.
- **Odrzuć**, a trafisz od razu do opisanego wyżej ręcznego mappera. Odrzucenie następuje, zanim cokolwiek zostanie przeanalizowane, więc nie ma jeszcze czego wypełnić — mapujesz kolumny tak samo, jak w przypadku każdego innego nieobsługiwanego banku.

**Wynik jest pokazany, a nie zakładany.** Gdy dopasowanie przez AI się powiedzie, podgląd pokazuje rząd „chipów" nad transakcjami — coś w rodzaju `Data → Data operacji`, `Kwota → Kwota` — razem z odgadniętą nazwą banku. To najlepsza próba, nie pewność: dotknij tego rzędu w dowolnej chwili, aby otworzyć mapper i poprawić źle rozpoznaną kolumnę.

**Kilka rzeczy jest oznaczanych do sprawdzenia, a nie po cichu zakładanych:**
- Jeśli plik w ogóle nie ma kolumny z walutą, każdy wiersz jest odczytywany w walucie Twojego konta, o czym informuje powiadomienie — dotknij go, aby zmienić walutę przed importem; zmiana obejmuje cały plik.
- Odczytanie liczb z PDF trudniej zweryfikować niż z CSV, więc aplikacja próbuje potwierdzić, że znalezione kwoty sumują się do salda końcowego wyciągu. Gdy nie może tego potwierdzić, zobaczysz powiadomienie z prośbą o sprawdzenie listy. To nie błąd — to po prostu normalna sytuacja, gdy wyciąg nie drukuje salda bieżącego do porównania albo gdy sprawdzenie się nie zgadza.

**Wyciągi PDF wymagają planu Pro.** Odczyt PDF przez AI wymaga więcej obliczeń niż CSV, więc jest to funkcja Pro — konto darmowe zobaczy tam ekran podniesienia planu zamiast komunikatu o błędzie.

Banki wymienione wyżej (mBank, PKO BP, Erste, Alior, Revolut, Wise) nie są tym objęte — importują się dokładnie tak, jak opisano wcześniej na tej stronie.

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
