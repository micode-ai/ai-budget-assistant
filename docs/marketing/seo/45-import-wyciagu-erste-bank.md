---
title: "Import wyciągu PDF z Erste Bank Polska do budżetu"
meta_description: "Jak zaimportować wyciąg PDF z Erste Bank Polska do aplikacji budżetowej: pobranie wyciągu, import, kolumny wpływy i wydatki, kategorie i brak duplikatów."
target_keyword: "import wyciągu erste bank pdf"
slug: "import-wyciagu-erste-bank"
pair: "import-erste"
lang: "pl"
date: "2026-10-07"
---

# Import wyciągu PDF z Erste Bank Polska do budżetu

Aby zaimportować wyciąg z Erste Bank Polska, pobierz wyciąg w formacie PDF z bankowości internetowej, a w AI Budget Assistant wybierz Ustawienia → Importuj transakcje → Erste Bank (PDF) i wskaż plik. Aplikacja odczyta tabelę z kolumnami wpływy i wydatki, podpowie kategorie i odznaczy transakcje, które już masz.

Erste udostępnia wyciągi jako tekstowy PDF, więc aplikacja ma dla niego osobny czytnik. Nie wymaga on planu Pro.

## Jak pobrać wyciąg z Erste Bank?

Zaloguj się do bankowości internetowej Erste, otwórz sekcję wyciągów, wybierz okres i pobierz wyciąg PDF. Dokładnych nazw menu nie udało się nam potwierdzić na stronach banku, więc szukaj wyciągu w formie PDF, takiego, w którym na górze są dane wyciągu, a dalej tabela z saldem początkowym i końcowym.

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

Aplikacja obsługuje Erste przez wyciąg PDF i tego formatu używaj. Jeśli masz inny plik, wybierz „Rozpoznaj automatycznie (dowolny bank)”, a w razie potrzeby ręczny mapper.

**Czy skan wyciągu z Erste się zaimportuje?**

Nie. Czytnik potrzebuje tekstu w PDF, a skan jest obrazem. Pobierz oryginalny wyciąg z bankowości internetowej.

**Skąd aplikacja bierze nazwę sklepu przy płatności kartą?**

Z opisu operacji, z fragmentu po słowach „PŁATNOŚĆ KARTĄ”, kwocie i walucie PLN. Znane sieci są dodatkowo ujednolicane do jednej nazwy.

**Czy mogę cofnąć import z Erste?**

Tak, w historii importów na dole ekranu importu, przez 30 dni od importu.
