---
title: "Import wyciągu mBank do aplikacji budżetowej"
meta_description: "Jak zaimportować wyciąg CSV z mBanku do budżetu: eksport historii, import w aplikacji, podgląd z kategoriami i bezpieczny ponowny import bez duplikatów."
target_keyword: "import wyciągu mbank"
slug: "import-wyciagu-mbank"
pair: "import-mbank"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu z mBanku: CSV do budżetu krok po kroku

Aby zaimportować wyciąg z mBanku, wyeksportuj historię operacji do pliku CSV w bankowości internetowej, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → mBank i wskaż plik. Aplikacja pominie nagłówek banku, odczyta operacje, podpowie kategorie i odznaczy transakcje, które już masz.

mBank to jeden z banków, dla których czytnik został napisany i sprawdzony na prawdziwym eksporcie, więc import zwykle przebiega bez żadnych ręcznych poprawek.

## Jak wyeksportować historię z mBanku?

Zaloguj się do bankowości internetowej mBanku na komputerze, otwórz historię operacji wybranego rachunku, ustaw zakres dat i poszukaj opcji eksportu do pliku CSV. Dokładna nazwa przycisku zależy od wersji serwisu, więc jeśli widzisz kilka formatów, wybierz CSV, a nie PDF.

Pobierz od razu dłuższy okres, na przykład trzy miesiące. Nakładające się zakresy nie szkodzą, bo duplikaty są wykrywane.

## Jak zaimportować plik z mBanku?

1. **Pobierz plik CSV** z historii operacji mBanku.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **mBank** (lub **Rozpoznaj automatycznie (dowolny bank)** — nagłówek „mBank S.A.” w pliku wystarczy do rozpoznania).
4. Wskaż plik. Aplikacja pokaże podgląd z datą, kwotą, opisem i podpowiedzianą kategorią każdej operacji.
5. Odznacz niepotrzebne wiersze, popraw kategorie i dotknij **Importuj**.

W podglądzie zobaczysz licznik „Wybrano” oraz „Już zaimportowano”. Wiersze oznaczone jako już zaimportowane są domyślnie odznaczone.

## Co aplikacja czyta z pliku mBanku?

| Element | Jak jest traktowany |
|---|---|
| Format | CSV, separator średnik; kodowanie UTF-8 lub Windows-1250 wykrywane automatycznie |
| Początek pliku | Wiele wierszy z danymi banku i podsumowaniem; aplikacja szuka wiersza nagłówka z kolumnami `#Data operacji` i `#Kwota` i czyta dopiero od niego |
| Kolumny | Data księgowania, Data operacji, Opis operacji, Tytuł, Nadawca/Odbiorca, Numer konta, Numer karty, Kwota |
| Kwota | Jedna kolumna ze znakiem: ujemna to wydatek, dodatnia to dochód |
| Waluta | Z linii `#Waluta` na początku pliku; gdy jej nie ma, przyjmowany jest PLN |
| Sprzedawca | Przy płatnościach kartą z kolumny Tytuł, przy przelewach z kolumny Nadawca/Odbiorca |

Typowe problemy: plik zapisany ponownie w arkuszu kalkulacyjnym (zmienia kodowanie i separatory) oraz eksport z kilku rachunków naraz. Importuj oryginalny plik prosto z banku i jeden rachunek na raz.

## Jak działają kategorie i nazwy sprzedawców?

Aplikacja rozpoznaje popularne sieci i zapisuje je pod jedną nazwą, więc `ZABKA ZF351 K.1` i inne warianty tego samego sklepu trafiają do jednego sprzedawcy w analityce. Kategoria jest podpowiadana na podstawie nazwy sklepu, a gdy raz ją poprawisz, aplikacja zapamięta wybór dla tego sprzedawcy przy kolejnych importach.

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator zbudowany z daty, kwoty i opisu, więc drugi import tego samego pliku niczego nie dubluje. Dodatkowo aplikacja porównuje datę, kwotę i walutę z tym, co masz już w koncie, także z wydatkami dodanymi ręcznie. Dwa takie same zakupy tego samego dnia zostają zachowane jako dwie transakcje. Jeśli import ci się nie spodoba, cofniesz go w historii importów w ciągu 30 dni.

Szerzej o mechanizmie: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Gdy plik jest w innym układzie, pomoże [import wyciągu z dowolnego banku](/blog/pl/import-wyciagu-z-dowolnego-banku/). Wypróbuj aplikację za darmo na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu z mBanku

**W jakim formacie wyeksportować historię z mBanku?**

W CSV. To format, który czytnik mBanku obsługuje bezpośrednio: średniki jako separator, wiersze z danymi banku na początku i kolumny z krzyżykiem w nazwach, jak `#Data operacji` czy `#Kwota`. PDF z mBanku nie jest do tego przeznaczony.

**Czy aplikacja potrzebuje dostępu do mojego konta w mBanku?**

Nie. Wgrywasz plik, który sam pobrałeś. Nie podajesz loginu ani hasła, a aplikacja widzi tylko operacje z tego pliku.

**Czy ponowny import tego samego wyciągu zdubluje transakcje?**

Nie. Rozpoznane powtórki są odznaczone w podglądzie jako już zaimportowane. Możesz więc co miesiąc wgrywać świeży wyciąg, nawet jeśli zachodzi na poprzedni.

**Dlaczego aplikacja pominęła część wierszy?**

Pomijane są wiersze bez rozpoznawalnej daty lub kwoty, na przykład stopka z informacją prawną na końcu pliku. W podglądzie zobaczysz baner z liczbą pominiętych wierszy. Jeśli brakuje prawdziwych operacji, sprawdź, czy plik nie został zmieniony w arkuszu.

**Czy mogę cofnąć import z mBanku?**

Tak, przez 30 dni od importu, w historii importów na dole ekranu importu. Cofnięcie usuwa transakcje z tego importu i pozwala wgrać plik ponownie.
