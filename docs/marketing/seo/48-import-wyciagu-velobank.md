---
title: "Historia rachunku VeloBank (też ex-Citi): pobierz i importuj"
meta_description: "Jak pobrać historię rachunku z VeloBanku w PDF, także po przejściu z Citi Handlowy, i dodać ją do budżetu: co działa, co jest płatne i czego unikać."
target_keyword: "historia rachunku velobank"
slug: "import-wyciagu-velobank"
pair: "import-velobank"
lang: "pl"
date: "2026-11-18"
---

# Jak pobrać historię rachunku z VeloBanku i dodać ją do budżetu

Historię rachunku z VeloBanku pobierzesz w bankowości internetowej lub w aplikacji: otwórz zakładkę **Historia**, ustaw okres i wybierz **Drukuj historię**. Dostaniesz plik PDF. W AI Budget Assistant wgrasz go przez **Ustawienia → Importuj transakcje → Rozpoznaj automatycznie (dowolny bank)**. VeloBank nie ma w aplikacji osobnego czytnika, więc PDF odczytuje AI, a to funkcja planu Pro.

Ten poradnik dotyczy też byłych klientów Citi Handlowy: bankowość detaliczna Citi przeszła do VeloBanku, który zakończył integrację w czerwcu 2026 roku.

## Jak pobrać historię rachunku z VeloBanku?

Według pomocy VeloBanku (stan na listopad 2026):

1. Zaloguj się do bankowości internetowej albo aplikacji mobilnej.
2. Otwórz zakładkę **Historia** albo przycisk **Historia** w oknie rachunku.
3. Zmień okres, jeśli potrzebujesz. Domyślnie to ostatni miesiąc.
4. Kliknij **Drukuj historię** w prawym dolnym rogu i zapisz plik PDF.

Jeśli przycisku **Drukuj historię** nie widać, zaznacz w filtrze tylko jeden rachunek. Historię w PDF albo na papierze może też przysłać konsultant infolinii.

W pomocy VeloBanku dla klientów indywidualnych nie znaleźliśmy eksportu historii do CSV ani XLS. Formaty MT940 i XML są opisane tylko dla klientów firmowych.

## Jak zaimportować PDF z VeloBanku krok po kroku?

1. **Pobierz historię w PDF**, jak wyżej. Nie rób zrzutu ekranu ani skanu, bo aplikacja potrzebuje tekstu w pliku.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **Rozpoznaj automatycznie (dowolny bank)** i wskaż plik.
4. Za pierwszym razem aplikacja zapyta o zgodę na odczyt przez AI i pokaże, co zostanie wysłane: pierwsze dwadzieścia linii tekstu z pliku. Zgoda jest jednorazowa dla całego konta.
5. Sprawdź podgląd: daty, kwoty, opisy i kategorie. Odznacz zbędne wiersze i dotknij **Importuj**.

## Co warto wiedzieć przed importem?

| Kwestia | Jak jest |
|---|---|
| Format | PDF z historii rachunku |
| Czytnik | Odczyt przez AI, bo VeloBank nie ma osobnego czytnika w aplikacji |
| Plan | Odczyt PDF przez AI wymaga planu Pro |
| Kontrola kompletności | Aplikacja porównuje sumę operacji z saldem początkowym i końcowym. Jeśli w pliku nie ma sald, pokaże ostrzeżenie, a ty sprawdź kilka pozycji z oryginałem |
| Duplikaty | Aplikacja porównuje datę, kwotę i walutę z transakcjami, które już masz, i odznacza powtórki |
| Cofnięcie | Cały import cofniesz w historii importów przez 30 dni |

Bez planu Pro PDF z VeloBanku się nie zaimportuje. Wtedy zostaje ręczne dodawanie transakcji albo przechwytywanie powiadomień bankowych na Androidzie, opisane w artykule [Aplikacja sama zapisuje wydatki](/blog/pl/automatyczne-zapisywanie-wydatkow/).

## A co z dawnymi wyciągami z Citi Handlowy?

Nie znaleźliśmy oficjalnej informacji, czy historię sprzed przeniesienia rachunku z Citi da się pobrać w VeloBanku. Jeśli masz zapisane stare wyciągi PDF z Citibank Online z warstwą tekstową, zaimportujesz je tą samą drogą: **Rozpoznaj automatycznie (dowolny bank)** i odczyt przez AI. Jak działa ten odczyt i co dzieje się z danymi, wyjaśniamy w artykule [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Aplikację wypróbujesz na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Historia rachunku z VeloBanku

**Czy VeloBank pozwala pobrać historię rachunku w CSV?**

W pomocy VeloBanku dla klientów indywidualnych opisany jest tylko PDF przez przycisk „Drukuj historię”. CSV, MT940 i XML są opisane w bankowości firmowej VeloBiznes.

**Czy import historii z VeloBanku jest darmowy?**

Nie. VeloBank daje PDF, a PDF banku bez własnego czytnika w aplikacji odczytuje AI, co jest funkcją planu Pro. Darmowy jest import plików CSV i XLSX.

**Gdzie jest przycisk „Drukuj historię”?**

W prawym dolnym rogu ekranu historii. Jeśli go nie widać, zaznacz w filtrze tylko jeden rachunek.

**Byłem klientem Citi Handlowy. Czy ten poradnik mnie dotyczy?**

Tak. Bankowość detaliczna Citi Handlowy przeszła do VeloBanku, więc historię pobierasz już w kanałach VeloBanku.

**Czy mogę cofnąć import?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu.
