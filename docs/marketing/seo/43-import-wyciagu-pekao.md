---
title: "Import wyciągu z Banku Pekao do budżetu"
meta_description: "Jak zaimportować historię z Banku Pekao (CSV) do aplikacji budżetowej: eksport, import z autorozpoznaniem, odczyt kolumn i ochrona przed duplikatami."
target_keyword: "import wyciągu pekao"
slug: "import-wyciagu-pekao"
pair: "import-pekao"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu z Banku Pekao do budżetu

Aby zaimportować historię z Banku Pekao, pobierz operacje z bankowości internetowej do pliku CSV, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Rozpoznaj automatycznie (dowolny bank). Aplikacja spróbuje rozpoznać układ Pekao, a w razie niepowodzenia odczyta kolumny z pomocą AI albo pozwoli je wskazać ręcznie.

Czytnik Pekao jest w aplikacji, ale nie został jeszcze potwierdzony na prawdziwych eksportach, dlatego nie ma osobnego wiersza na liście banków.

## Jak wyeksportować historię z Pekao?

Zaloguj się do bankowości internetowej Pekao na komputerze, otwórz historię rachunku, wybierz zakres dat i poszukaj opcji pobrania historii do pliku CSV. Dokładnej nazwy przycisku nie udało się nam potwierdzić na stronach banku, więc jeśli dostępnych jest kilka formatów, wybierz CSV.

## Jak zaimportować plik z Pekao krok po kroku?

1. **Pobierz plik CSV** z historii rachunku.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Dotknij **Rozpoznaj automatycznie (dowolny bank)** i wskaż plik.
4. Rozpoznany układ zobaczysz jako „Wykryto” z nazwą banku. Przy nierozpoznanym aplikacja zapyta o bank albo zaproponuje odczyt kolumn przez AI.
5. Sprawdź podgląd, popraw kategorie i dotknij **Importuj**.

## Co czyta dedykowany czytnik Pekao?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV, separator średnik; kodowanie UTF-8 lub Windows-1250 wykrywane automatycznie |
| Rozpoznanie | Po kolumnach „Data operacji”, „Data waluty” i „Kwota” |
| Kolumny | Data operacji, Data waluty, Opis, Nadawca/Odbiorca, Numer rachunku, Kwota, Waluta, Saldo |
| Kwota | Jedna kolumna ze znakiem; ujemna to wydatek, dodatnia to dochód |
| Sprzedawca | Z kolumny Nadawca/Odbiorca, opis z kolumny Opis |
| Status | Niepotwierdzony na prawdziwych eksportach |

Typowe problemy: nagłówki w innym brzmieniu niż w czytniku, wiersze z podsumowaniem przed tabelą lub plik zapisany ponownie w arkuszu. Układ kolumn Pekao jest podobny do PKO BP, ale aplikacja sprawdza PKO jako pierwszy, więc plik PKO nie zostanie pomylony z Pekao.

## Co jeśli aplikacja nie rozpozna pliku?

Przy pierwszym takim pliku zostaniesz zapytany o zgodę na odczyt AI. Wysyłany jest tylko wiersz nagłówka i do 10 przykładowych wierszy. Model wskazuje nazwy kolumn, a kwoty i daty czyta zwykły kod. Wynik widzisz jako rząd chipów i możesz go poprawić. Po odmowie przypiszesz kolumny w mapperze i zapiszesz mapowanie na przyszłość. Szczegóły: [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator z daty, kwoty i opisu, więc ponowny import tego samego pliku niczego nie dubluje. Aplikacja porównuje też datę, kwotę i walutę z istniejącymi transakcjami i odznacza powtórki. Dwa identyczne zakupy tego samego dnia pozostają osobnymi transakcjami. Import cofniesz w historii importów w ciągu 30 dni.

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Aplikację wypróbujesz na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu z Banku Pekao

**Czy AI Budget Assistant obsługuje Bank Pekao?**

Z zastrzeżeniem. Dedykowany czytnik Pekao jest w aplikacji, ale nie został jeszcze sprawdzony na prawdziwych eksportach. Gdy zawiedzie, odczyt kolumn przez AI i ręczny mapper łapią formaty, których czytnik nie obsłuży.

**Dlaczego Pekao nie ma na liście banków?**

Bo na liście są tylko banki potwierdzone na prawdziwych plikach. Pekao zaimportujesz przez „Rozpoznaj automatycznie (dowolny bank)”.

**Czy aplikacja zobaczy całą moją historię z Pekao?**

Nie. Przy odczycie kolumn przez AI do zewnętrznego dostawcy trafia tylko wiersz nagłówka i do 10 przykładowych wierszy, a o zgodę pytamy raz na konto.

**Czy wyciąg PDF z Pekao się zaimportuje?**

Dedykowany czytnik działa na CSV. PDF z nierozpoznanego banku może odczytać AI, ale to funkcja planu Pro i wynik trzeba sprawdzić w podglądzie. Najlepszy jest CSV.

**Czy mogę cofnąć import z Pekao?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu.
