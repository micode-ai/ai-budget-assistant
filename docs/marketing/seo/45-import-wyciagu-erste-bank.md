---
title: "Wyciąg z Erste (ex-Santander): pobierz i dodaj do budżetu"
meta_description: "Jak pobrać eWyciąg PDF lub historię CSV z Erste Bank Polska (dawniej Santander) i zaimportować je do budżetu: kategorie, wpływy, wydatki, bez duplikatów."
target_keyword: "jak pobrać wyciąg z erste"
slug: "import-wyciagu-erste-bank"
pair: "import-erste"
lang: "pl"
date: "2026-10-07"
---

# Jak pobrać wyciąg z Erste Banku (dawniej Santander) i dodać go do budżetu

Aby zaimportować wyciąg z Erste Bank Polska, pobierz wyciąg w formacie PDF z bankowości internetowej, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Erste Bank (PDF) i wskaż plik. Aplikacja odczyta tabelę z kolumnami wpływy i wydatki, podpowie kategorie i odznaczy transakcje, które już masz.

Erste Bank Polska to dawny Santander Bank Polska, więc ten poradnik dotyczy też klientów, którzy pamiętają bankowość Santandera. Erste udostępnia wyciągi jako tekstowy PDF, a aplikacja ma dla niego osobny czytnik. Nie wymaga on planu Pro.

## Jak pobrać wyciąg z Erste Bank?

Według pomocy banku (stan na listopad 2026) eWyciąg pobierzesz tak:

- **W bankowości internetowej:** w górnym menu **Poczta** → zakładka **eWyciągi**. Albo **Twoje produkty** → **Więcej** przy rachunku → **eWyciąg**. Wybierz wyciąg, format **PDF** i kliknij **Pobierz**.
- **W aplikacji mobilnej:** w dolnym menu **Kontakt** → **Poczta** → zakładka **eWyciągi**. W aplikacji wyciąg jest tylko w PDF.

W bankowości internetowej eWyciąg jest też w formatach HTML, CSV i XML, ale do importu wybierz PDF, bo dla niego aplikacja ma czytnik.

### Historia rachunku w CSV

Zamiast miesięcznego wyciągu możesz pobrać historię z dowolnego okresu: **Twoje produkty** → **Historia**, ustaw filtry (daty, wpływy lub wydatki) i zapisz ją w formacie CSV. Taki plik wgrasz przez **Rozpoznaj automatycznie (dowolny bank)**. Za pierwszym razem aplikacja zapyta o zgodę na rozpoznanie kolumn przez AI (wysyła tylko nagłówek i do dziesięciu przykładowych wierszy), a ty sprawdzisz w podglądzie, która kolumna jest datą, kwotą i opisem. Import CSV nie wymaga planu Pro.

## Jak zaimportować wyciąg PDF krok po kroku?

1. **Pobierz wyciąg PDF** z bankowości internetowej.
2. W aplikacji wejdź w **Ustawienia → Importuj transakcje**.
3. Wybierz **Erste Bank (PDF)** albo **Rozpoznaj automatycznie (dowolny bank)** — wyciąg zostanie rozpoznany po nazwie banku lub układzie kolumn.
4. Wskaż plik i poczekaj na podgląd.
5. Sprawdź daty, kwoty i kategorie, odznacz zbędne wiersze i dotknij **Importuj**.

## Co aplikacja czyta z wyciągu Erste?

| Element | Jak jest traktowany |
|---|---|
| Format | PDF z warstwą tekstową (nie skan) |
| Układ | Tabela: data księgowania, data operacji, opis, wpływy, wydatki, saldo |
| Zakres czytania | Od wiersza „Saldo początkowe” do „Saldo końcowe”; nagłówki i stopki stron są pomijane |
| Kwota | Wpływ to dochód, wydatek to wydatek |
| Data | Data operacji |
| Waluta | PLN |
| Sprzedawca | Przy płatnościach kartą z fragmentu po słowach „PŁATNOŚĆ KARTĄ … PLN”, przy przelewach z opisu |

Typowe problemy: jedna operacja zajmuje kilka linii tekstu, więc opis bywa długi; skan nie ma tekstu i nie zadziała; a wyciąg walutowy zostanie odczytany jako PLN. Warto porównać kilka pozycji z oryginałem przed zatwierdzeniem.

## Co jeśli wyciąg nie zostanie rozpoznany?

Gdy układ wyciągu się zmieni, aplikacja może spróbować odczytu przez AI. To funkcja planu Pro, wymaga zgody (wysyłane jest pierwsze 20 linijek tekstu) i jest dodatkowo sprawdzana pod kątem zgodności sumy operacji z saldem końcowym. Szerzej w artykule [Co zrobić, gdy twojego banku nie ma na liście](/blog/pl/import-wyciagu-z-dowolnego-banku/).

## Jak uniknąć duplikatów?

Każdy wiersz dostaje identyfikator z daty, kwoty i opisu, więc ponowny import tego samego wyciągu niczego nie dubluje. Aplikacja porównuje też datę, kwotę i walutę z istniejącymi transakcjami i odznacza powtórki. Dwa identyczne zakupy tego samego dnia zostają osobnymi transakcjami. Całość cofniesz w historii importów w ciągu 30 dni.

Ogólny przewodnik: [Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Aplikację wypróbujesz na [ai-budget.pl](https://ai-budget.pl).

## FAQ: Import wyciągu PDF z Erste Bank Polska

**Czy import PDF z Erste wymaga planu Pro?**

Nie. Erste ma dedykowany czytnik PDF dostępny bez planu Pro. Płatny jest dopiero odczyt PDF przez AI, używany dla banków bez własnego czytnika.

**Czy Erste Bank udostępnia CSV?**

Tak. Historię rachunku (**Twoje produkty** → **Historia**) zapiszesz w CSV, a eWyciąg w bankowości internetowej jest też w CSV, HTML i XML. Plik CSV wgraj przez „Rozpoznaj automatycznie (dowolny bank)”. Dla wyciągu PDF aplikacja ma osobny czytnik.

**Czy to ten sam bank co Santander?**

Tak. Santander Bank Polska działa teraz pod marką Erste Bank Polska, a dawne adresy santander.pl przekierowują na erste.pl. Wyciągi pobierasz już w bankowości Erste.

**Czy skan wyciągu z Erste się zaimportuje?**

Nie. Czytnik potrzebuje tekstu w PDF, a skan jest obrazem. Pobierz oryginalny wyciąg z bankowości internetowej.

**Skąd aplikacja bierze nazwę sklepu przy płatności kartą?**

Z opisu operacji, z fragmentu po słowach „PŁATNOŚĆ KARTĄ”, kwocie i walucie PLN. Znane sieci są dodatkowo ujednolicane do jednej nazwy.

**Czy mogę cofnąć import z Erste?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu.
