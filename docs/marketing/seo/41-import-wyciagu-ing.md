---
title: "Import wyciągu z ING Banku Śląskiego do budżetu"
meta_description: "Jak zaimportować historię z ING Banku Śląskiego (CSV) do aplikacji budżetowej: eksport, import z autorozpoznaniem, podgląd i ochrona przed duplikatami."
target_keyword: "import wyciągu ing"
slug: "import-wyciagu-ing"
pair: "import-ing"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu z ING Banku Śląskiego do budżetu

Aby zaimportować historię z ING Banku Śląskiego, pobierz operacje z bankowości internetowej w formacie CSV, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Rozpoznaj automatycznie (dowolny bank). Aplikacja spróbuje rozpoznać układ pliku ING, a gdy się nie uda, odczyta kolumny z pomocą AI lub zapyta cię o nie.

Uczciwie: czytnik ING istnieje w aplikacji, ale nie został jeszcze potwierdzony na prawdziwych eksportach z banku. Dlatego nie ma osobnego wiersza „ING” na liście, a najlepszą drogą jest autorozpoznanie.

## Jak wyeksportować historię z ING?

Zaloguj się do bankowości internetowej ING na komputerze, otwórz historię transakcji wybranego rachunku, ustaw zakres dat i poszukaj opcji pobrania historii do pliku CSV. Nie weryfikowaliśmy dokładnej nazwy przycisku na stronach banku, a serwis bywa zmieniany, więc wybierz CSV, jeśli bank oferuje kilka formatów.

## Jak zaimportować plik z ING krok po kroku?

1. **Pobierz plik CSV** z historii transakcji.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Dotknij **Rozpoznaj automatycznie (dowolny bank)** i wskaż plik.
4. Jeśli układ zostanie rozpoznany, zobaczysz komunikat „Wykryto” z nazwą banku. Jeśli nie, aplikacja zapyta: „Z jakiego banku pochodzi ten plik?”, a przy nieznanym układzie zaproponuje odczyt kolumn przez AI.
5. Sprawdź podgląd, popraw kategorie i dotknij **Importuj**.

## Co czyta dedykowany czytnik ING?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV, separator średnik |
| Rozpoznanie | Po kolumnach „Dane kontrahenta” i „Kwota transakcji (waluta rachunku)” |
| Kolumny | Data transakcji, Data księgowania, Dane kontrahenta, Tytuł, Nr rachunku, Kwota transakcji, Waluta, Saldo po transakcji |
| Kwota | Jedna kolumna ze znakiem; polski zapis z przecinkiem i spacją jako separatorem tysięcy |
| Sprzedawca | Z kolumny Dane kontrahenta, opis z kolumny Tytuł |
| Status | Niepotwierdzony na prawdziwych eksportach, nie ma go na liście banków |

Typowe problemy: dodatkowe wiersze przed nagłówkiem, inne nazwy kolumn niż w dawnych eksportach i plik zapisany ponownie w arkuszu. Jeśli którykolwiek z nich dotyczy twojego pliku, import nie przepadnie: AI rozpozna, która kolumna to data, kwota i opis, a ty zobaczysz wynik jako rząd chipów, który możesz poprawić.

## Co jeśli plik z ING nie zostanie rozpoznany?

Wtedy aplikacja pyta raz o zgodę na odczyt AI. Do analizy wysyłany jest tylko wiersz nagłówka i do 10 przykładowych wierszy, nigdy cały plik. Rozpoznanie kolumn robi model, a samą kwotę i datę odczytuje już zwykły kod, więc model nie wymyśla liczb. Jeśli odmówisz, przypiszesz kolumny ręcznie w mapperze i możesz zapisać mapowanie na przyszłość. Szczegóły opisaliśmy w artykule [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator z daty, kwoty i opisu, więc ponowny import tego samego pliku niczego nie dubluje. Aplikacja porównuje też datę, kwotę i walutę z transakcjami, które masz już w koncie, i odznacza powtórki. Identyczne zakupy tego samego dnia zostają jako osobne transakcje. Import cofniesz w historii importów w ciągu 30 dni.

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Aplikacja jest darmowa na start: [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu z ING

**Czy AI Budget Assistant obsługuje ING Bank Śląski?**

Tak, ale z zastrzeżeniem. Dedykowany czytnik ING jest w aplikacji, lecz nie sprawdziliśmy go jeszcze na prawdziwych eksportach z banku. Gdy rozpoznanie zawiedzie, odczyt kolumn przez AI albo ręczny mapper łapią formaty, których czytnik nie obsłużył.

**Dlaczego nie widzę ING na liście banków?**

Bo na liście są tylko banki potwierdzone na prawdziwych plikach. ING możesz zaimportować przez opcję „Rozpoznaj automatycznie (dowolny bank)”, która najpierw próbuje dedykowanych czytników.

**Czy AI zobaczy całą historię moich transakcji?**

Nie. Przy odczycie kolumn do zewnętrznego dostawcy AI trafia tylko wiersz nagłówka i do 10 przykładowych wierszy. Pytamy o zgodę raz na konto, a po odmowie możesz zmapować kolumny samodzielnie.

**Czy plik PDF z ING też da się zaimportować?**

Nie przez dedykowany czytnik, bo ten działa na CSV. Wyciąg PDF z nierozpoznanego banku może przeczytać AI, ale jest to funkcja planu Pro, a do wyniku warto się przyjrzeć w podglądzie. Dla ING najlepszy jest CSV.

**Czy mogę cofnąć import z ING?**

Tak, w historii importów na dole ekranu importu, przez 30 dni. Po cofnięciu możesz zaimportować plik ponownie.
