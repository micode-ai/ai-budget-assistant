---
title: "Import wyciągu PDF z Alior Banku do budżetu"
meta_description: "Jak zaimportować wyciąg PDF z Alior Banku do aplikacji budżetowej: pobranie wyciągu, import, kategorie i brak duplikatów przy ponownym imporcie."
target_keyword: "import wyciągu alior bank pdf"
slug: "import-wyciagu-alior-bank"
pair: "import-alior"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu PDF z Alior Banku do budżetu

Aby zaimportować wyciąg z Alior Banku, pobierz z bankowości internetowej wyciąg z rachunku w formacie PDF, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Alior Bank (PDF) i wskaż plik. Aplikacja odczyta tekst z PDF, wyciągnie operacje, podpowie kategorie i odznaczy to, co już masz.

Alior nie daje prostego CSV do wyciągu, dlatego aplikacja ma osobny czytnik tekstowych PDF. Dedykowany czytnik nie wymaga planu Pro.

## Jak pobrać wyciąg z Alior Banku?

Zaloguj się do bankowości internetowej Alior na komputerze, otwórz sekcję wyciągów z rachunku, wybierz okres i pobierz wyciąg w formacie PDF. Dokładnej nazwy przycisków nie udało się nam potwierdzić na stronach banku, a serwis bywa zmieniany. Ważne, by był to oryginalny PDF z banku, który zatytułowano „Wyciąg z rachunku bankowego”, a nie zrzut ekranu ani skan.

## Jak zaimportować wyciąg PDF krok po kroku?

1. **Pobierz wyciąg PDF** z bankowości internetowej.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **Alior Bank (PDF)** albo **Rozpoznaj automatycznie (dowolny bank)** — wyciąg zostanie rozpoznany po nazwie banku w tekście.
4. Wskaż plik. Po chwili zobaczysz podgląd z operacjami.
5. Sprawdź daty, kwoty i kategorie, odznacz zbędne wiersze i dotknij **Importuj**.

## Co aplikacja czyta z wyciągu Alior?

| Element | Jak jest traktowany |
|---|---|
| Format | PDF z warstwą tekstową (nie skan) |
| Układ | Każda operacja to data księgowania, data operacji i linia z opisem, kwotą ze znakiem oraz saldem |
| Data | Data operacji |
| Kwota | Ze znakiem: ujemna to wydatek (obciążenie), dodatnia to dochód (uznanie) |
| Waluta | PLN |
| Sprzedawca | Z linii pod operacją (kontrahent, karta, lokalizacja), po odcięciu numerów kont i kart |

Typowe problemy: skan lub zdjęcie wyciągu nie ma warstwy tekstowej i nie zostanie odczytane, a wyciąg w walucie innej niż PLN nie zostanie poprawnie oznaczony, bo czytnik przypisuje złote. Przed zatwierdzeniem porównaj kilka pozycji z papierowym lub ekranowym wyciągiem.

## Co jeśli wyciąg nie zostanie rozpoznany?

Gdy układ wyciągu zmieni się lub aplikacja go nie rozpozna, może spróbować odczytu przez AI. To funkcja planu Pro, a do analizy wysyłane jest pierwsze 20 linijek tekstu, po wcześniejszej zgodzie. Aplikacja próbuje też potwierdzić, że znalezione kwoty sumują się do salda końcowego, a gdy nie może, pokazuje ostrzeżenie. Szerzej w artykule [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator z daty, kwoty i opisu, więc ponowny import tego samego wyciągu niczego nie dubluje. Aplikacja porównuje też datę, kwotę i walutę z istniejącymi transakcjami i odznacza powtórki. Dwa identyczne zakupy tego samego dnia zostają osobnymi transakcjami. Import cofniesz w historii importów w ciągu 30 dni.

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Aplikację wypróbujesz na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu PDF z Alior Banku

**Czy wyciąg PDF z Alior Banku da się zaimportować bez planu Pro?**

Tak. Alior ma dedykowany czytnik PDF, który nie jest ograniczony planem. Plan Pro jest potrzebny dopiero wtedy, gdy PDF czyta AI, czyli przy wyciągach z banków bez dedykowanego czytnika.

**Czy mogę zaimportować skan wyciągu z Aliora?**

Nie. Czytnik potrzebuje tekstu w PDF, a skan jest obrazem. Pobierz oryginalny wyciąg z bankowości internetowej.

**Dlaczego wszystkie transakcje z Aliora są w złotych?**

Bo dedykowany czytnik zapisuje kwoty w PLN. Wyciągu z rachunku walutowego nie importuj tym czytnikiem bez sprawdzenia, a po imporcie porównaj pozycje z oryginałem.

**Skąd aplikacja bierze nazwę sklepu?**

Z linii pod operacją na wyciągu, w której Alior drukuje kontrahenta lub lokalizację. Numery kont i kart są odcinane, a znane sieci ujednolicane do jednej nazwy.

**Czy mogę cofnąć import z Aliora?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu.
