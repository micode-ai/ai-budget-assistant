# Szyfrowanie end-to-end

> Chron swoje dane finansowe dzieki szyfrowaniu end-to-end (E2EE). Wszystkie wrazliwe informacje sa szyfrowane na Twoim urzadzeniu przed wyslaniem na serwer — nikt poza Toba (i czlonkami Twojego wspolnego konta) nie moze ich odczytac.

## Przeglad

Szyfrowanie end-to-end zapewnia, ze Twoje opisy, notatki, nazwy kategorii i inne dane tekstowe sa szyfrowane na Twoim urzadzeniu przed synchronizacja. Serwer przechowuje jedynie zaszyfrowane dane i nie moze ich odczytac, nawet jesli baza danych zostanie naruszona.

Kontrolujesz szyfrowanie za pomoca oddzielnego **hasla szyfrowania**, ktore nigdy nie jest wysylane na serwer.

## Konfiguracja szyfrowania

1. Otworz **Ustawienia**
2. Przewin do sekcji **Bezpieczenstwo**
3. Dotknij **Wlacz szyfrowanie**
4. Wprowadz **haslo szyfrowania** (minimum 8 znakow)
   - Jest to oddzielne od Twojego hasla logowania
   - Wybierz silne haslo, ktore mozesz zapamietac
5. Potwierdz haslo
6. Na ekranie wyswietli sie **Klucz odzyskiwania**

> **Wazne:** Zapisz swoj Klucz odzyskiwania natychmiast! Zapisz go lub przechowaj w menedzerze hasel. Format: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. To **jedyny sposob** na odzyskanie danych, jesli zapomnisz hasla szyfrowania.

Po konfiguracji szyfrowanie jest automatycznie wlaczone dla Twojego biezacego konta.

## Odblokowywanie szyfrowania

Po ponownym uruchomieniu aplikacji lub po wygasnieciu sesji szyfrowanie jest zablokowane. Twoje dane sa nadal bezpiecznie przechowywane, ale zaszyfrowane pola beda wyswietlane jako puste, dopoki nie odblokujesz szyfrowania.

Aby odblokowac:

1. Otworz **Ustawienia** > **Bezpieczenstwo**
2. Dotknij **Odblokuj szyfrowanie**
3. Wprowadz swoje haslo szyfrowania
4. Twoje dane staja sie ponownie czytelne

## Co jest szyfrowane

Szyfrowanie dziala w dwoch poziomach:

### Poziom 1 — Pola tekstowe (domyslnie)

| Dane | Zaszyfrowane |
|---|---|
| Opisy i notatki wydatkow | Tak |
| Nazwy lokalizacji | Tak |
| Dane paragonow | Tak |
| Nazwy kategorii | Tak |
| Nazwy tagow | Tak |
| Nazwy i opisy projektow | Tak |
| Nazwy budzetow | Tak |
| Kwoty, daty, waluty | Nie — pozostaja jako tekst jawny |

**Funkcje serwera** (analityka, alerty budzetowe, wnioski AI) nadal dzialaja, poniewaz kwoty i daty pozostaja dostepne.

### Poziom 2 — Pelne szyfrowanie (opcjonalne)

Wszystko z Poziomu 1, plus:

| Dane | Zaszyfrowane |
|---|---|
| Kwoty (wydatki, przychody, budzety) | Tak |
| Ceny i kursy wymiany | Tak |
| Salda portfela | Tak |

> **Uwaga:** Przy Poziomie 2 analityka po stronie serwera i funkcje AI sa niedostepne, poniewaz serwer nie moze odczytac kwot. Cala analityka jest obliczana lokalnie na Twoim urzadzeniu.

## Odzyskiwanie

Jesli zapomnisz hasla szyfrowania, ale masz Klucz odzyskiwania:

1. Otworz **Ustawienia** > **Bezpieczenstwo**
2. Dotknij **Odzyskaj**
3. Wprowadz swoj Klucz odzyskiwania
4. Ustaw nowe haslo szyfrowania
5. Zostanie wygenerowany nowy Klucz odzyskiwania — zapisz go ponownie

## Resetowanie szyfrowania

Jesli utracisz zarowno haslo szyfrowania, jak i Klucz odzyskiwania:

1. Otworz **Ustawienia** > **Bezpieczenstwo**
2. Dotknij **Resetuj szyfrowanie** (czerwony przycisk)
3. Potwierdz akcje

> **Ostrzezenie:** Wczesniej zaszyfrowane dane na serwerze staja sie **trwale nieczytelne**. Dane lokalne na Twoim urzadzeniu nie sa naruszone. Mozesz ponownie skonfigurowac szyfrowanie z nowym haslem.

## Konta wspolne

Gdy szyfrowanie jest wlaczone dla wspolnego konta:

- **Wlasciciel konta** musi przyznac klucze szyfrowania kazdemu czlonkowi
- Nowi czlonkowie moga widziec metadane (kwoty, daty, kategorie), ale **nie moga odczytac zaszyfrowanych pol tekstowych**, dopoki wlasciciel nie przyzna dostepu
- Przyznawanie kluczy odbywa sie, gdy wlasciciel otworzy aplikacje i zatwierdzi oczekujacych czlonkow
- Gdy czlonek jest **usuniety** z wspolnego konta, klucze sa rotowane ze wzgledow bezpieczenstwa — usuniety czlonek nie moze juz odszyfrowac nowych danych

## Wplyw na funkcje aplikacji

| Funkcja | Poziom 1 (Tekst) | Poziom 2 (Pelne) |
|---|---|---|
| Analityka i wykresy | W pelni dziala | Obliczane lokalnie |
| Alerty budzetowe | W pelni dziala | Niedostepne |
| Czat AI | Czesciowo (bez opisow) | Niedostepne |
| Wnioski AI | Czesciowo | Niedostepne |
| Historia wydatkow | Czesciowo | Niedostepne |
| Wprowadzanie glosowe | W pelni dziala | W pelni dziala |
| Skanowanie paragonow | W pelni dziala | W pelni dziala |

## FAQ

- **P: Czy haslo szyfrowania jest takie samo jak haslo logowania?**
  **O:** Nie. Haslo szyfrowania jest oddzielne i nigdy nie jest wysylane na serwer. Haslo logowania uwierzytelnia Twoje konto; haslo szyfrowania chroni Twoje dane.

- **P: Co sie stanie, jesli zapomne hasla szyfrowania i utrace Klucz odzyskiwania?**
  **O:** Wczesniej zaszyfrowane dane na serwerze staja sie trwale nieczytelne. Mozesz zresetowac szyfrowanie i zaczac od nowa, ale starych zaszyfrowanych danych nie da sie odzyskac.

- **P: Czy twórcy aplikacji moga odczytac moje zaszyfrowane dane?**
  **O:** Nie. Serwer przechowuje jedynie zaszyfrowane dane. Bez Twojego hasla szyfrowania lub Klucza odzyskiwania nikt nie moze odszyfrowac Twoich danych.

- **P: Czy szyfrowanie spowalnia aplikacje?**
  **O:** Poczatkowa konfiguracja zajmuje kilka sekund na generowanie kluczy. Po tym szyfrowanie i deszyfrowanie poszczegolnych pol jest praktycznie natychmiastowe.

- **P: Czy moge wylaczyc szyfrowanie po jego wlaczeniu?**
  **O:** Mozesz zresetowac szyfrowanie, co usuwa konfiguracje szyfrowania. Jednak dane, ktore zostaly zaszyfrowane na serwerze, pozostaja zaszyfrowane i staja sie nieczytelne.

---

*Zobacz takze: [Ustawienia](./11-settings.md) | [Konta](./09-accounts.md)*
