---
title: "Import wyciągu z Banku Millennium do budżetu"
meta_description: "Jak zaimportować historię z Banku Millennium (CSV) do aplikacji budżetowej: eksport, autorozpoznanie, kolumny Obciążenie i Uznanie, bez duplikatów."
target_keyword: "import wyciągu millennium"
slug: "import-wyciagu-millennium"
pair: "import-millennium"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu z Banku Millennium do budżetu

Aby zaimportować historię z Banku Millennium, pobierz operacje z bankowości internetowej do pliku CSV, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Rozpoznaj automatycznie (dowolny bank). Aplikacja rozpozna układ z kolumnami Obciążenie i Uznanie albo, gdy to się nie uda, odczyta kolumny z pomocą AI.

Czytnik Millennium jest w aplikacji, ale nie został jeszcze sprawdzony na prawdziwych eksportach, więc nie ma osobnego wiersza na liście banków. Autorozpoznanie to najlepsza droga.

## Jak wyeksportować historię z Millennium?

Zaloguj się do bankowości internetowej Millennium na komputerze, otwórz historię rachunku, wybierz zakres dat i poszukaj opcji pobrania historii do pliku CSV. Nie weryfikowaliśmy dokładnej nazwy przycisku na stronach banku, więc jeśli oferowanych jest kilka formatów, wybierz CSV.

## Jak zaimportować plik z Millennium krok po kroku?

1. **Pobierz plik CSV** z historii rachunku.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Dotknij **Rozpoznaj automatycznie (dowolny bank)** i wskaż plik.
4. Przy rozpoznanym układzie zobaczysz „Wykryto” z nazwą banku. W przeciwnym razie aplikacja zapyta, z jakiego banku jest plik, lub zaproponuje odczyt kolumn przez AI.
5. Sprawdź podgląd, popraw kategorie i dotknij **Importuj**.

## Co czyta dedykowany czytnik Millennium?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV, separator średnik |
| Rozpoznanie | Po kolumnach „Obciążenie” i „Uznanie” w nagłówku |
| Kolumny | Data transakcji, Opis, Obciążenie, Uznanie, Saldo, Waluta |
| Kwoty | Dwie osobne kolumny: Obciążenie to wydatek, Uznanie to dochód; puste pole lub myślnik oznacza brak kwoty |
| Sprzedawca | Brak osobnej kolumny, więc nazwa pochodzi z opisu |
| Status | Niepotwierdzony na prawdziwych eksportach |

Typowe problemy: inny układ kolumn, dodatkowe wiersze przed nagłówkiem lub plik zapisany ponownie w arkuszu. Jeśli aplikacja się potknie, odczyt AI albo ręczny mapper (z opcją rozdzielenia kolumn debetowej i kredytowej) załatwią sprawę, a mapowanie możesz zapisać na przyszłość.

## Co jeśli aplikacja nie rozpozna pliku?

Przy pierwszym takim pliku aplikacja pyta o zgodę na odczyt AI. Wysyłany jest tylko wiersz nagłówka i do 10 przykładowych wierszy, nigdy cały plik. Model wskazuje wyłącznie nazwy kolumn, a kwoty i daty czyta zwykły kod. Wynik widzisz jako rząd chipów, na przykład Data → Data transakcji, i możesz go poprawić. Więcej w artykule [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator z daty, kwoty i opisu, więc ten sam plik zaimportowany ponownie niczego nie dubluje. Aplikacja porównuje też datę, kwotę i walutę z istniejącymi transakcjami i odznacza powtórki. Dwa identyczne zakupy tego samego dnia zostają jako dwie transakcje. Całość cofniesz w historii importów w ciągu 30 dni.

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Wypróbuj aplikację na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu z Banku Millennium

**Czy aplikacja obsługuje Bank Millennium?**

Z zastrzeżeniem. Dedykowany czytnik jest w aplikacji, ale nie sprawdziliśmy go jeszcze na prawdziwym eksporcie. Gdy nie zadziała, odczyt kolumn przez AI i ręczny mapper łapią formaty, których czytnik nie rozpozna.

**Jak aplikacja odróżnia wydatek od dochodu w pliku Millennium?**

Po kolumnach. Kwota w kolumnie Obciążenie jest wydatkiem, a w kolumnie Uznanie dochodem. Wiersz, w którym obie kolumny są puste, jest pomijany.

**Dlaczego nie ma Millennium na liście banków?**

Bo na liście są banki sprawdzone na prawdziwych plikach. Millennium zaimportujesz przez „Rozpoznaj automatycznie (dowolny bank)”, które najpierw próbuje dedykowanych czytników.

**Czy mogę zaimportować wyciąg PDF z Millennium?**

Dedykowany czytnik działa na CSV. PDF z nierozpoznanego banku może przeczytać AI, ale to funkcja planu Pro i wynik warto sprawdzić w podglądzie. Najlepszy jest CSV.

**Czy mogę cofnąć import?**

Tak, w historii importów na dole ekranu importu, przez 30 dni. Potem możesz wgrać plik ponownie.
