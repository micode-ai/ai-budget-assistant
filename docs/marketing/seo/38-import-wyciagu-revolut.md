---
title: "Import wyciągu z Revolut do aplikacji budżetowej"
meta_description: "Jak zaimportować wyciąg CSV z Revolut do budżetu: eksport z aplikacji, podgląd, przewalutowania jako wymiana i brak duplikatów przy ponownym imporcie."
target_keyword: "import wyciągu revolut"
slug: "import-wyciagu-revolut"
pair: "import-revolut"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu z Revolut: CSV do budżetu w kilka minut

Aby zaimportować wyciąg z Revolut, wygeneruj w aplikacji Revolut wyciąg konta w formacie CSV, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Revolut i wskaż plik. Zobaczysz podgląd z kategoriami, odznaczone duplikaty i przewalutowania połączone w jedną wymianę. Całość trwa kilka minut.

Revolut jest o tyle wdzięczny w imporcie, że jego CSV ma stały układ kolumn i zawiera walutę każdej operacji. Poniżej znajdziesz, co dokładnie aplikacja z tego pliku czyta i na co uważać.

## Jak wyeksportować wyciąg z Revolut?

W aplikacji Revolut otwórz wyciągi swojego konta (w interfejsie po angielsku to sekcja Statements), wybierz zakres dat i format CSV, a potem pobierz plik na telefon lub komputer. Dokładne nazwy przycisków Revolut zmienia od czasu do czasu, więc jeśli coś wygląda inaczej, szukaj opcji generowania wyciągu i wyboru formatu CSV.

Dobra praktyka: za pierwszym razem pobierz dłuższy okres, na przykład trzy do sześciu miesięcy. Ponowny import nakładających się zakresów jest bezpieczny, bo aplikacja wykrywa transakcje, które już ma.

## Jak zaimportować plik krok po kroku?

1. **Pobierz CSV z Revolut** na urządzenie, na którym działa aplikacja.
2. W AI Budget Assistant wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **Revolut** z listy (albo **Rozpoznaj automatycznie (dowolny bank)** — układ pliku Revolut zostanie rozpoznany po nagłówkach).
4. Wskaż pobrany plik. Aplikacja pokaże podgląd: każdy wiersz jako wydatek, dochód lub wymiana walut, z podpowiedzianą kategorią.
5. Odznacz wiersze, których nie chcesz, popraw kategorie i dotknij **Importuj**.

Gdy plik jest już w podglądzie, u góry zobaczysz licznik „Wybrano” oraz „Już zaimportowano”. Drugi z nich to wiersze, które aplikacja uznała za znane i domyślnie odznaczyła.

## Co aplikacja czyta z pliku Revolut?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV rozdzielany przecinkami, nagłówki w pierwszym wierszu |
| Kolumny | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Data | Z kolumny Started Date (sama data, bez godziny) |
| Kwota | Ze znakiem: ujemna to wydatek, dodatnia to dochód |
| Waluta | Osobno dla każdego wiersza, więc konto wielowalutowe nie miesza walut |
| Stan operacji | Importowane są tylko wiersze o stanie COMPLETED; odrzucone i oczekujące są pomijane |
| Wymiana walut | Dwa wiersze EXCHANGE z tą samą datą i przeciwnymi znakami łączą się w jedną wymianę walut |
| Sprzedawca | Z kolumny Description, z ujednoliconą nazwą dla znanych sieci |

## Co z przewalutowaniami i kontem wielowalutowym?

Konto Revolut często trzyma kilka walut naraz. Gdy wymieniasz złote na euro, w pliku pojawiają się dwa wiersze: wyjście w jednej walucie i wpływ w drugiej. Gdyby policzyć je osobno, budżet pokazałby fałszywy wydatek i fałszywy dochód. Dlatego aplikacja paruje takie wiersze i zapisuje je jako jedną **wymianę walut**, widoczną w Portfelu, a nie w wydatkach.

Wydatki w obcych walutach zostają w swojej walucie. O tym, jak patrzeć na budżet, gdy część życia toczy się w euro, piszemy w poradniku [Budżet w dwóch walutach](/blog/pl/budzet-w-dwoch-walutach/).

## Jak uniknąć duplikatów i co jeśli coś pójdzie nie tak?

Aplikacja chroni cię na dwa sposoby. Po pierwsze, każdy wiersz dostaje unikalny identyfikator zbudowany z daty, kwoty i opisu, więc ten sam plik zaimportowany drugi raz niczego nie dubluje. Po drugie, porównuje datę, kwotę i walutę z transakcjami, które masz już w koncie, także tymi dodanymi ręcznie, i odznacza podejrzane powtórki.

Dwa identycznie opisane zakupy tego samego dnia (na przykład dwie kawy po tej samej cenie) zostają zachowane jako dwie osobne transakcje. Jeśli mimo wszystko import się nie spodoba, w sekcji historii importów na dole ekranu cofniesz go jednym dotknięciem w ciągu 30 dni, a potem możesz wgrać ten sam plik jeszcze raz.

Więcej o samym mechanizmie czytaj w poradniku [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Jeśli Twojego banku nie ma na liście, zajrzyj do artykułu [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Czy to bezpieczne?

Nie podajesz loginu ani hasła do Revolut. Importujesz statyczny plik, który sam pobrałeś, więc aplikacja widzi tylko historię operacji z tego pliku. AI Budget Assistant możesz wypróbować za darmo na [ai-budget.pl](https://ai-budget.pl) lub w [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: Import wyciągu z Revolut

**Jaki format wyciągu z Revolut jest potrzebny?**

CSV. To plik z kolumnami Type, Started Date, Description, Amount, Currency, State i Balance, który Revolut generuje w sekcji wyciągów konta. Pliki PDF też da się przeczytać, ale tylko przez odczyt AI, który jest funkcją planu Pro, więc do regularnego importu wybieraj CSV.

**Czy transakcje odrzucone lub oczekujące też się zaimportują?**

Nie. Aplikacja bierze tylko wiersze o stanie COMPLETED, czyli zrealizowane. Odrzucona płatność kartą nie obniży więc salda w budżecie, a oczekująca pojawi się dopiero w kolejnym wyciągu, gdy zostanie zaksięgowana.

**Czy wymiana walut w Revolut policzy się jako wydatek?**

Nie. Dwa wiersze wymiany o tej samej dacie i przeciwnych znakach są łączone w jedną wymianę walut w Portfelu. Nie zawyża ona ani wydatków, ani dochodów.

**Czy mogę zaimportować ten sam wyciąg dwa razy?**

Możesz, ale nic się nie zdubluje. Powtórzone wiersze są rozpoznawane i odznaczone w podglądzie jako już zaimportowane.

**Czy mogę cofnąć import z Revolut?**

Tak. W historii importów na dole ekranu importu dotknij strzałki cofania przy danym imporcie. Jest to możliwe przez 30 dni, a po cofnięciu możesz zaimportować ten sam plik ponownie.
