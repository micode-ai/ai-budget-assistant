# Konta

> Organizuj swoje finanse za pomoca oddzielnych kont. Uzyj konta Osobistego do indywidualnego sledzenia, Wspolnego do budzetow rodzinnych i Firmowego do wydatkow sluzbowych. Zapraszaj czlonkow z kontrola dostepu oparta na rolach.

## Przeglad

Aplikacja obsluguje wiele kont w celu oddzielenia roznych kontekstow finansowych. Kazde konto posiada wlasne wydatki, przychody, budzety i portfel.

## Typy kont

![Lista kont](../img/accounts.jpg)

| Typ | Ikona | Przeznaczenie |
|---|---|---|
| **Osobiste** | Ikona osoby | Indywidualne sledzenie wydatkow |
| **Wspolne** | Ikona osob | Budzety rodzinne lub grupowe (np. "Rodzina") |
| **Firmowe** | Ikona aktowki | Wydatki firmowe lub zespolowe (np. "MiCode") |
| **Inwestycyjne** | Ikona trendu wzrostowego | Sledzenie portfeli inwestycyjnych i aktywow |
| **Podróż** | Ikona samolotu | Tymczasowe wspólne konto na grupowy wyjazd — dzielcie wydatki między uczestnikami i rozliczajcie, kto komu jest winien ([Portfel podróży](./35-group-trip-wallet.md)) |

Kazde konto wyswietla swoj typ i Twoja role (Wlasciciel, Edytor lub Obserwator).

## Przelaczanie kont

![Menu Przelacz konto](../img/switch-account.jpg)

1. Dotknij **nazwe konta** w lewym gornym rogu dowolnego ekranu (np. "Rodzina")
2. Otwiera sie menu **Przelacz konto** pokazujace wszystkie Twoje konta
3. Dotknij konto, na ktore chcesz sie przelaczyc
4. Aktywne konto jest oznaczone zielonym znacznikiem
5. Wszystkie ekrany aktualizuja sie, aby wyswietlac dane wybranego konta

Dotknij **Zarzadzaj kontami** na dole menu, aby przejsc do pelnej listy kont.

## Zmiana waluty wyswietlania

Zmien walute, w ktorej wyswietlane sa wszystkie Twoje sumy — z dowolnego ekranu, bez otwierania Ustawien.

Na ekranie głównym najszybszym sposobem jest dedykowany **przycisk waluty** obok nazwy konta — dotknij go i wybierz walutę. Na pozostałych ekranach:

1. Dotknij **nazwe konta** w lewym gornym rogu dowolnego ekranu. Obok nazwy widoczny jest symbol biezacej waluty (np. `Osobiste · $`).
2. W otwartym menu znajdz sekcje **Waluta wyswietlania** pod lista kont.
3. Dotknij wybrana walute (USD, EUR, PLN, GBP, UAH, RUB, BYN).
4. Wszystkie kwoty w aplikacji sa natychmiast przeliczane na wybrana walute po najnowszych kursach.

> To Twoja osobista waluta wyswietlania i jest zapisywana na przyszlosc. Zmienia tylko sposob *wyswietlania* kwot — Twoje transakcje zachowuja swoje oryginalne waluty. Kazdy czlonek (w tym Obserwatorzy) moze wybrac wlasna walute wyswietlania.

## Tworzenie konta

1. Przejdz do listy kont (przez **Zarzadzaj kontami** lub z Ustawien)
2. Dotknij **Utworz konto**
3. Wprowadz **Nazwe konta** (np. "Moj budzet")
4. Wybierz **Typ konta**: Osobiste, Wspolne, Firmowe, Inwestycyjne lub Podróż
5. Wybierz **Walute** dla tego konta
6. Dotknij **Utworz**

> **Uwaga:** Darmowy plan pozwala na 3 konta, Pro pozwala na maksymalnie 5, Business pozwala na nieograniczona liczbe kont.

## Dolaczanie do konta

Jesli ktos znalazl Cie przez wyszukiwanie i zaprosil bezposrednio, nie potrzebujesz kodu:

1. Otrzymasz powiadomienie push, gdy tylko zaproszenie dotrze
2. Dotknij go (lub otworz **Alerty** i przelacz sie na zakladke **Zaproszenia**)
3. Dotknij **Akceptuj**, aby dolaczyc, lub **Odrzuc**, aby je odrzucic
4. Zaakceptowane zaproszenia od razu dodaja konto do Twojej listy

Jesli zamiast tego otrzymales kod lub link zaproszenia:

1. Dotknij **Dolacz do konta** na liscie kont
2. Wprowadz **kod zaproszenia**, ktory otrzymales
3. Dotknij **Dolacz**
4. Zobaczysz komunikat sukcesu: "Pomyslnie dolaczono!"
5. Konto pojawia sie teraz na Twojej liscie kont

## Ustawienia konta

![Ustawienia konta](../img/account-settings.jpg)

Dotknij dowolne konto, aby otworzyc jego ustawienia:

### Szczegoly
- **Nazwa** konta (edytowalna przez Wlasciciela)
- **Typ** i **waluta** konta (tylko do odczytu)
- **Miesiac finansowy** (tylko Wlasciciel) — zmienia, co oznacza "ten miesiac" dla Twoich budzetow

### Miesiac finansowy

Domyslnie budzety dzialaja w miesiacu kalendarzowym (od 1. do ostatniego dnia). Jesli Twoja wyplata wplywa innego dnia miesiaca — na przyklad 10. — mozesz sprawic, by budzety podazaly za tym dniem:

1. Otworz Ustawienia konta i dotknij wiersza **Miesiac finansowy** (pokazuje "Miesiac kalendarzowy" lub "Miesiac zaczyna sie dnia N")
2. W otwartym arkuszu wybierz **Miesiac kalendarzowy**, aby zresetowac, lub dzien od **1 do 31**
3. Dotknij **Zapisz**

> **Uwaga:** Na razie dotyczy to tylko **budzetow** — sposobu obliczania ich okresow i tego, jakie wydatki sie do nich licza. Analityka, raporty i inne widoki oparte na miesiacach nadal uzywaja miesiaca kalendarzowego.
>
> Zmiana dziala wstecz: przeszle okresy budzetow i historia zostana odpowiednio przeliczone, bez zmiany danych wydatkow czy przychodow.
>
> Jesli wybierzesz dzien, ktory nie istnieje w kazdym miesiacu (np. 31), okres po prostu zacznie sie w ostatnim dniu krotszych miesiecy (np. 28 lub 29 lutego).

Tylko Wlasciciel — Edytorzy i Obserwatorzy widza aktualne ustawienie, ale nie moga go zmienic.

### Czlonkowie
- Lista wszystkich czlonkow konta z ich rolami
- Kazdy czlonek wyswietla: awatar, imie i znacznik roli (Wlasciciel, Edytor, Obserwator)

### Zapraszanie czlonkow

1. Otworz Ustawienia konta dla danego konta
2. Dotknij **ikone zaproszenia** (ikona osoba+ w prawym gornym rogu sekcji Czlonkowie)
3. Wybierz metode zaproszenia:
   - **Znajdz uzytkownika** — jesli osoba ma juz aplikacje, wyszukaj ja po imieniu lub e-mailu, wybierz z wynikow, ustal jej role i dotknij **Wyslij zaproszenie**. Od razu otrzyma powiadomienie push — kod nie jest potrzebny.
   - **Przez email** — wprowadz adres e-mail osoby, wybierz jej role (Edytor lub Obserwator), dotknij **Wyslij zaproszenie**
   - **Przez link** — generowany jest kod, ktory mozesz udostepnic. Dotknij, aby skopiowac lub udostepnic przez komunikatory

### Zarzadzanie czlonkami (tylko Wlasciciel)

- **Zmien role** — dotknij ikone zmiany roli obok czlonka, aby przypisac nowa role
- **Usun czlonka** — dotknij ikone usuwania, aby usunac czlonka (z potwierdzeniem)

### Oczekujace zaproszenia

- Przegladaj zaproszenia, ktore nie zostaly jeszcze zaakceptowane
- **Anuluj zaproszenie** — cofnij oczekujace zaproszenie

## Role i uprawnienia

| Uprawnienie | Wlasciciel | Edytor | Obserwator |
|---|---|---|---|
| Przegladanie wydatkow i przychodow | Tak | Tak | Tak |
| Dodawanie/edycja wydatkow | Tak | Tak | Nie |
| Dodawanie/edycja przychodow | Tak | Tak | Nie |
| Tworzenie/edycja budzetow | Tak | Tak | Nie |
| Zarzadzanie czlonkami | Tak | Nie | Nie |
| Edycja ustawien konta | Tak | Nie | Nie |
| Usuwanie konta | Tak | Nie | Nie |

### Opisy rol
- **Wlasciciel** — pelna kontrola nad kontem, moze zarzadzac czlonkami i ustawieniami
- **Edytor** — moze dodawac i edytowac wydatki, przychody i budzety
- **Obserwator** — moze tylko przegladac dane (dostep tylko do odczytu)

## Usuwanie konta

1. Otworz Ustawienia konta
2. Przewin na dol i dotknij **Usun konto**
3. Potwierdz usuniecie

> **Ostrzezenie:** Usuniecie konta trwale usuwa wszystkie jego dane (wydatki, przychody, budzety). Ta akcja nie moze byc cofnieta.

## Opuszczanie konta

Jezeli jestes czlonkiem (nie Wlascicielem) wspolnego konta:
1. Otworz Ustawienia konta
2. Dotknij **Opusc konto**
3. Potwierdz — zostaniesz usuniety z konta

## Przelaczanie kont w Telegramie

Korzystajac z bota Telegram, mozesz przelaczac konta na dwa sposoby:

1. **Recznie** — wyslij `/account` i dotknij wybranego konta
2. **Automatycznie** — wspomnij nazwe konta w wiadomosci (np. "Pokaz wydatki w Family"), a AI odpyta to konto dla biezacego zapytania

Automatyczne wykrywanie nie zmienia Twojego domyslnego konta — dotyczy tylko biezacej wiadomosci. Uzyj `/account` aby trwale przelaczac.

## FAQ

- **P: Ile kont moge miec?**
  **O:** Free: 3 konta, Pro: do 5, Business: bez limitu.

- **P: Czy moge przeniesc wlasnosc konta?**
  **O:** Obecnie tworca konta jest zawsze Wlascicielem. Skontaktuj sie z obsluga w sprawie przeniesienia wlasnosci.

- **P: Czy moge zobaczyc, kto dodal wydatek na wspolnym koncie?**
  **O:** Wydatki na wspolnych kontach pokazuja, ktory czlonek je utworzyl.

- **P: Czy moge uzywac roznych kont w bocie Telegram?**
  **O:** Tak. Wyslij `/account` aby zmienic domyslne konto, lub po prostu wspomnij nazwe konta w wiadomosci dla jednorazowych zapytan. Zobacz [Bot Telegram](./22-telegram-bot.md) po szczegoly.

---

*Zobacz takze: [Ustawienia](./11-settings.md) | [Plany subskrypcji](./12-subscription.md)*
