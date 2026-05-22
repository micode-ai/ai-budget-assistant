# Import z Wise

> Wczytaj całą historię transakcji Wise do aplikacji w jednym kroku. Prześlij wyciąg CSV, a aplikacja automatycznie utworzy odpowiednie wydatki, przychody i przewalutowania.

## Przegląd

Jeśli korzystasz z Wise, **Import z Wise** pozwala wczytać cały wyciąg do twojego konta w jednym kroku. Koniec z wpisywaniem transakcji jedna po drugiej — pobierz CSV z Wise, przekaż go aplikacji i przejrzyj, co zostanie utworzone, zanim zatwierdzisz.

Import obejmuje trzy rodzaje wpisów:

- **Wydatki** — pieniądze, które wyszły z twojego salda Wise (obciążenia)
- **Przychody** — pieniądze, które wpłynęły (uznania)
- **Przewalutowania** — gdy zamieniałeś między saldami wewnątrz Wise (np. USD → EUR)

Każda zaimportowana transakcja jest oznaczana, dzięki czemu aplikacja wie, że pochodzi z Wise — jeśli prześlesz ten sam wyciąg dwukrotnie, duplikaty zostaną wykryte i pominięte automatycznie.

## Krok 1 — Wyeksportuj CSV z Wise

1. Otwórz Wise (wersja webowa na **wise.com** lub aplikacja mobilna Wise).
2. Przejdź do **Transactions → Statements and Reports**.
3. Wybierz **zakres dat** (do 469 dni na plik).
4. Wybierz format **CSV** i wskaż walutę / saldo, które chcesz.
5. Pobierz plik na telefon.

> **Wskazówka:** Wise generuje jeden CSV na walutę. Jeśli chcesz zaimportować kilka walut, powtórz eksport dla każdej z nich i importuj je kolejno.

## Krok 2 — Zaimportuj w aplikacji

1. Otwórz aplikację i przejdź do **Ustawienia → Import z Wise**.
2. Dotknij **Wybierz plik CSV** i wskaż pobrany plik.
3. Aplikacja przetwarza plik (zwykle poniżej sekundy) i wyświetla podgląd.

## Krok 3 — Sprawdź i zatwierdź

Podgląd pokazuje każdą transakcję z CSV wraz z polem wyboru.

- **Wydatki** są oznaczone czerwoną ikoną w dół, **przychody** zieloną ikoną w górę, a **przewalutowania** ikoną wymiany pokazującą obie strony operacji (np. `120.00 USD → 109.50 EUR`).
- Przy znanych sprzedawcach (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix itp.) pojawia się mała etykieta z **sugerowaną kategorią**. Jeśli w aktywnym koncie istnieje już kategoria o tej samej nazwie, zostanie dołączona automatycznie.
- Wiersze już zaimportowane w poprzednim wczytaniu są **przygaszone i oznaczone „Już zaimportowano"** — nie można ich ponownie wybrać, co chroni cię przed duplikatami.
- Odznacz to, czego nie chcesz importować (np. przelewy między swoimi kontami).

Gdy wybór jest gotowy, dotknij **Importuj N wierszy**. Aplikacja zapisuje wszystko w jednej operacji — albo zostaną utworzone wszystkie wybrane wiersze, albo żaden.

## Co zostanie zapisane

| Pole | Skąd pochodzi |
|---|---|
| Data | Kolumna `Date` |
| Kwota | `Amount` (wartość bezwzględna) + uwzględnione `Total fees` |
| Waluta | Kolumna `Currency` |
| Opis | `Description`, w razie braku `Merchant` lub `Payment Reference` |
| Kategoria | Sugerowana na podstawie sprzedawcy, jeśli rozpoznano; w przeciwnym razie brak |
| Źródło | Oznaczone jako `import`, by filtrować w analizach |

## Przewalutowania

Gdy ten sam przelew Wise dotyczy dwóch walut (np. zamieniasz 100 USD na euro), Wise generuje dwa wiersze — obciążenie w USD i uznanie w EUR. Aplikacja rozpoznaje takie pary po wspólnym `Payment Reference` i tworzy pojedynczy wpis **Wymiana walut** zamiast dwóch niezależnych transakcji. Wymiana pojawia się w **Portfel → Wymiany** z prawidłowym kursem.

## Powtórny import

Ponowne przesłanie tego samego CSV jest bezpieczne. Każdy wiersz niesie swój `TransferWise ID` z Wise, a aplikacja odmawia utworzenia drugiego wpisu dla już zaimportowanego ID. To oznacza, że:

- Możesz ponownie wyeksportować szerszy zakres i wczytać go — utworzone zostaną tylko nowe wiersze.
- Możesz przerwać podgląd w połowie i zacząć od nowa później — wiersze, które już zatwierdziłeś, są zapamiętane.

## FAQ

- **P: Czy działa to z innymi bankami?**
  **O:** Obecnie obsługiwane są tylko eksporty CSV z Wise. Inne banki używają innych kolumn. Zgłoś prośbę o funkcję, jeśli chcesz, by dodać inny bank.

- **P: Czy mogę zaimportować wyciąg PDF lub XLSX?**
  **O:** Jeszcze nie. Eksportuj wyciągi Wise w formacie CSV.

- **P: Czy plik jest gdzieś przechowywany w sposób, który powinien mnie martwić?**
  **O:** CSV jest wysyłany do serwera AI Budget Assistant, przetwarzany w pamięci i usuwany zaraz po wygenerowaniu podglądu. Zapisywane są tylko zatwierdzone, ustrukturyzowane wiersze — nie oryginalny plik.

- **P: Co dzieje się z opłatami pobranymi przez Wise?**
  **O:** Wise raportuje opłaty w osobnej kolumnie `Total fees`. Aplikacja dolicza je do tego samego wydatku, tak by suma odpowiadała temu, co rzeczywiście opuściło twoje saldo.

- **P: Zaimportowałem niewłaściwe wiersze — czy mogę cofnąć?**
  **O:** Tak. Zaimportowane wiersze to zwykłe wydatki/przychody — otwórz każdy z nich i usuń jak dowolną inną transakcję. Po usunięciu możesz później ponownie zaimportować ten sam wiersz.

- **P: Mój CSV nie ma nagłówków / ma inny format. Co teraz?**
  **O:** Upewnij się, że eksportowałeś z **Transactions → Statements and Reports → CSV**. Starszy format „Activity Export" jest inny i nie jest obsługiwany.

- **P: Czy moje kategorie z Wise zostaną przeniesione?**
  **O:** Własna kategoryzacja Wise jest częściowo używana do sugerowania kategorii dla znanych sprzedawców. Aplikacja nie tworzy nowych kategorii automatycznie — jeśli nie ma dopasowania, wiersz zostanie zaimportowany bez kategorii i możesz go skategoryzować później.

---

*Zobacz też: [Wydatki i przychody](./03-expenses-and-income.md) | [Portfel i wymiana](./10-wallet-and-exchange.md) | [Konta](./09-accounts.md) | [Ustawienia](./11-settings.md)*
