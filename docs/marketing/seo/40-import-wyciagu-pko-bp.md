---
title: "Eksport historii z PKO BP do CSV i import do budżetu"
meta_description: "Eksport historii z PKO BP do CSV i import do aplikacji budżetowej: kroki, odczyt kolumn, sprzedawcy z płatności kartą i ochrona przed duplikatami."
target_keyword: "eksport historii pko csv"
slug: "import-wyciagu-pko-bp"
pair: "import-pko"
lang: "pl"
date: "2026-10-07"
---

# Eksport historii z PKO BP do CSV i import do budżetu

Aby zaimportować historię z PKO BP, wyeksportuj operacje z bankowości internetowej do pliku CSV, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → PKO BP i wskaż plik. Aplikacja odczyta kwoty ze znakiem, wyciągnie nazwy sklepów z płatności kartą, podpowie kategorie i pominie to, co już zaimportowałeś.

Czytnik PKO BP powstał na prawdziwym eksporcie, więc obsługuje jego specyficzny układ, w którym szczegóły operacji są rozrzucone po kilku kolumnach bez nazw.

## Jak wyeksportować historię z PKO BP?

Zaloguj się do bankowości internetowej PKO BP na komputerze, otwórz historię operacji wybranego rachunku, ustaw zakres dat i poszukaj opcji pobrania lub eksportu historii do pliku CSV. Dokładna nazwa opcji zależy od wersji serwisu, więc jeśli bank oferuje kilka formatów, wybierz CSV.

Pobierz od razu dłuższy okres, na przykład trzy miesiące, bo nakładające się zakresy nie powodują duplikatów.

## Jak zaimportować plik z PKO BP?

1. **Pobierz plik CSV** z historii operacji.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **PKO BP** (albo **Rozpoznaj automatycznie (dowolny bank)** — układ pliku zostanie rozpoznany po kolumnach „Data operacji”, „Kwota” i „Typ transakcji”).
4. Wskaż plik i poczekaj na podgląd.
5. Sprawdź wiersze i kategorie, odznacz zbędne i dotknij **Importuj**.

## Co aplikacja czyta z pliku PKO BP?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV rozdzielany przecinkami, wszystkie pola w cudzysłowie, nagłówek w pierwszym wierszu |
| Kolumny | Data operacji, Data waluty, Typ transakcji, Kwota, Waluta, Saldo po transakcji, Opis transakcji oraz dodatkowe kolumny bez nazw |
| Kwota | Jedna kolumna ze znakiem, np. `-64.10` lub `+6600.00`, z kropką dziesiętną |
| Data | Z kolumny Data operacji |
| Waluta | Z kolumny Waluta, w razie braku PLN |
| Sprzedawca | Z dodatkowych kolumn: adres lokalizacji przy płatności kartą, nazwa odbiorcy lub nadawcy przy przelewie, w ostateczności tytuł lub typ transakcji |

Typowe problemy: tytuł płatności kartą bywa tylko ciągiem cyfr, więc nazwa sklepu pochodzi z pola lokalizacji. Jeśli ten sam sklep wygląda inaczej w różnych wierszach, popraw kategorię raz, a aplikacja zapamięta wybór.

## Jak uniknąć duplikatów?

Każdy wiersz dostaje unikalny identyfikator z daty, kwoty i opisu, więc ten sam plik zaimportowany po raz drugi niczego nie zdubluje. Dodatkowo aplikacja porównuje datę, kwotę i walutę z transakcjami, które masz już w koncie, także dodanymi ręcznie lub z paragonu. Wiersze uznane za znane są odznaczone i opisane jako „Już zaimportowano”. Dwa identyczne zakupy tego samego dnia pozostają dwiema transakcjami. Cały import możesz cofnąć w historii importów w ciągu 30 dni.

Więcej ogólnych wskazówek znajdziesz w poradniku [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Jeśli plik z PKO wygląda inaczej niż opisano, przeczytaj [import wyciągu z dowolnego banku](/blog/pl/import-wyciagu-z-dowolnego-banku/). Aplikację wypróbujesz za darmo na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import historii z PKO BP

**Jak wyeksportować historię z PKO BP do CSV?**

W bankowości internetowej otwórz historię operacji rachunku, wybierz zakres dat i skorzystaj z opcji eksportu lub pobrania historii do CSV. Dokładne nazwy przycisków mogą się zmieniać, więc szukaj formatu CSV na liście dostępnych formatów.

**Czy aplikacja czyta kwoty z PKO ze znakiem plus i minus?**

Tak. Plik PKO ma jedną kolumnę Kwota ze znakiem. Ujemna to wydatek, dodatnia to dochód, a kropka dziesiętna jest obsługiwana bez żadnych ustawień.

**Skąd aplikacja bierze nazwę sklepu przy płatnościach kartą?**

Z dodatkowych kolumn pliku, w których PKO zapisuje lokalizację operacji, na przykład adres sklepu. Znane sieci są dodatkowo ujednolicane do jednej nazwy.

**Czy import z PKO BP zdubluje transakcje, które dodałem ręcznie?**

Nie powinien. Aplikacja porównuje datę, kwotę i walutę z istniejącymi wydatkami i dochodami, także ręcznymi, i odznacza powtórki w podglądzie. Warto jednak rzucić okiem na podgląd, zanim klikniesz Importuj.

**Czy mogę cofnąć import?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu. Po cofnięciu możesz wgrać ten sam plik jeszcze raz.
