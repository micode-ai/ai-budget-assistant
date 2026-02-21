# Eksport i raporty

> Generuj raporty PDF, Excel i CSV swoich finansow. Przegladaj miesieczne podsumowania wydatkow, twórz zaszyfrowane kopie zapasowe i otrzymuj automatyczne podsumowania e-mail.

## Przeglad

Ekran **Eksport i raporty** umozliwia generowanie raportow finansowych, przegladanie miesiecznych podsumowań, pobieranie/udostepnianie raportow i zarzadzanie kopiami zapasowymi danych. Uzyskaj dostep z zakladki Analityka za pomoca przycisku **Eksportuj raport** lub z **Ustawienia** > **Raporty i e-mail** > **Generuj raport**.

## Formaty raportow

Dostepne sa trzy formaty eksportu:

| Format | Opis | Dostepnosc |
|---|---|---|
| **CSV** | Wartosci rozdzielane przecinkami, kompatybilne z Excel i Google Sheets | Wszystkie plany |
| **PDF** | Sformatowany raport z podsumowaniem, podzialem na kategorie i lista transakcji | Pro i Business |
| **Excel** | Skoroszyt wieloarkuszowy z arkuszami Podsumowanie, Wydatki i Przychody | Pro i Business |

## Generowanie raportu

1. Wybierz **format** (CSV, PDF lub Excel)
2. Wybierz **okres czasu** (Ostatni tydzien, Ten miesiac, Ostatni kwartal, Ten rok)
3. Dotknij **Generuj**
4. Raport generuje sie i otwiera sie natychmiast przez systemowy arkusz udostepniania — zapisz lub wysli go stamtad
5. Raport pojawi sie takze w **Ostatnich raportach** w celu pozniejszego dostepu

Raporty sa przechowywane przez 7 dni, a nastepnie automatycznie usuwane.

## Podsumowanie miesieczne (Pro+)

Migawka aktywnosci finansowej biezacego miesiaca:

- **Lacznie przychodow** i **Lacznie wydatkow**
- **Stopa oszczednosci** — procent zaoszczedzonego dochodu
- **Glowne kategorie** — Twoje najwieksze kategorie wydatkow z kwotami
- Dane sa buforowane przez 7 dni i odswiezaja sie automatycznie

## Ostatnie raporty

Lista ostatnio wygenerowanych raportow pokazujaca:

- Ikona formatu (CSV/PDF/Excel)
- Nazwa pliku i data utworzenia
- Rozmiar pliku
- Przycisk **Pobierz** — zapisuje plik bezposrednio na urzadzeniu (Android: wybierz folder przez SAF; iOS: zapisz w Plikach)
- Przycisk **Udostepnij** — otwiera systemowy arkusz udostepniania, aby wyslac raport e-mailem, przez komunikator lub inne aplikacje

## Kopia zapasowa danych

Dostepne na **wszystkich planach**:

- **Eksportuj kopie zapasowa** — tworzy pelna kopie zapasowa JSON danych Twojego konta (wydatki, przychody, budzety, kategorie, tagi, projekty, portfele itp.)
- **Przywroc kopie zapasowa** — importuj wczesniej wyeksportowana kopie zapasowa
- Jesli szyfrowanie jest wlaczone, zaszyfrowane pola sa uwzgledniane w kopii zapasowej w stanie niezmienionym

Uzyskaj dostep do kopii zapasowej z **Ustawienia** > **Raporty i e-mail**.

## Raporty e-mail

Automatyczne podsumowania e-mail dostarczane do Twojej skrzynki odbiorczej:

| Funkcja | Opis | Wymagany plan |
|---|---|---|
| **Tygodniowe podsumowanie e-mail** | Tygodniowy przeglad wydatkow z glownymi kategoriami | Business |
| **Miesieczny raport e-mail** | Miesieczne podsumowanie z porownaniem miesiac do miesiaca | Pro i Business |

Skonfiguruj te opcje w **Ustawienia** > **Raporty i e-mail**:

- Przelacz tygodniowe/miesieczne e-maile wlacz/wylacz
- Wybierz dzien tygodnia dla raportow tygodniowych (domyslnie poniedzialek)

## Szyfrowanie i raporty

- **Poziom 0** (bez szyfrowania) — wszystkie dane wyswietlane poprawnie w raportach
- **Poziom 1** (szyfrowanie tekstu) — kwoty wyswietlaja sie poprawnie; nazwy kategorii i opisy moga pojawiac sie puste w raportach generowanych na serwerze. Podsumowanie miesieczne rozwiazuje nazwy kategorii z danych lokalnych urzadzenia
- **Poziom 2** (pelne szyfrowanie) — raporty sa niedostepne (kwoty sa zaszyfrowane po stronie serwera)

## FAQ

- **P: Dlaczego widze puste nazwy kategorii w moim raporcie PDF?**
  **O:** Jesli masz wlaczone E2EE (Poziom 1), nazwy kategorii sa zaszyfrowane na serwerze. Raport generowany na serwerze nie moze ich odszyfrowac. Kwoty pozostaja dokladne.

- **P: Jak dlugo sa przechowywane raporty?**
  **O:** Raporty sa automatycznie usuwane po 7 dniach. Pobierz je niezwlocznie po wygenerowaniu.

- **P: Czy moge eksportowac dane ze wspolnego konta?**
  **O:** Tak, kazdy czlonek konta moze generowac raporty i kopie zapasowe dla wspolnego konta.

- **P: Co jest uwzglednione w kopii zapasowej?**
  **O:** Wszystko: wydatki, przychody, budzety, kategorie, tagi, projekty, portfele, transfery i wymiany walut dla biezacego konta.

---

*Zobacz takze: [Analityka](./06-analytics.md) | [Ustawienia](./11-settings.md) | [Plany subskrypcji](./12-subscription.md) | [Szyfrowanie](./15-encryption.md)*
