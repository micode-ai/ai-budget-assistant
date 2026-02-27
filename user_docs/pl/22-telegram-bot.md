# Bot Telegram

> Zarzadzaj swoimi finansami bezposrednio z Telegramu. Rozmawiaj z AI, dodawaj wydatki poleceniami, skanuj paragony i uzywaj wiadomosci glosowych — wszystko bez otwierania aplikacji.

## Przeglad

**Bot Telegram** pozwala na interakcje z Twoim Asystentem budzetowym AI bezposrednio z Telegramu. Polacz konto raz, a bedziesz moc sledzic wydatki, zadawac pytania finansowe i zarzadzac budzetami — prosto z komunikatora.

## Laczenie konta

1. Otworz aplikacje i przejdz do **Ustawienia**
2. Dotknij **Bot Telegram** w sekcji Integracje
3. Dotknij **Wygeneruj kod** — pojawi sie 6-znakowy kod (wazny przez 10 minut)
4. Otworz Telegram i znajdz bota
5. Wyslij `/link KOD` (np. `/link A3F2B1`)
6. Zobaczysz potwierdzenie: "Konto polaczone pomyslnie!"

> **Uwaga:** Kazde konto Telegram moze byc polaczone tylko z jednym kontem aplikacji. Ponowne polaczenie zastepuje poprzednie.

## Polecenia bota

| Polecenie | Opis |
|---|---|
| `/start` | Wiadomosc powitalna i instrukcje konfiguracji |
| `/link KOD` | Polacz Telegram z aplikacja |
| `/expense KWOTA OPIS` | Szybko dodaj wydatek (np. `/expense 50 obiad`) |
| `/income KWOTA OPIS` | Szybko dodaj przychod (np. `/income 3000 wynagrodzenie`) |
| `/account` | Przelacz miedzy kontami |
| `/newchat` | Rozpocznij nowa rozmowe z AI |
| `/unlink` | Odlacz Telegram od konta |
| `/help` | Pokaz wszystkie dostepne polecenia |

## Czat AI w Telegramie

Wyslij dowolna wiadomosc tekstowa do bota, a zostanie ona przetworzona przez asystenta AI — tego samego, ktory jest dostepny w zakladce Czat AI w aplikacji.

**Przyklady:**
- "Na co wydalem najwiecej w tym miesiacu?"
- "Pokaz moje wydatki z ostatniego tygodnia"
- "Dodaj wydatek 500₴ na zakupy"
- "Jaki jest status mojego budzetu?"

AI obsluguje wszystkie funkcje z czatu w aplikacji: polecenia w jezyku naturalnym, potwierdzanie akcji, podzial wedlug kategorii i analize budzetu.

## Automatyczne wykrywanie konta

Jesli masz wiele kont (np. "Osobiste" i "Rodzinne"), AI automatycznie wykrywa, kiedy wspominasz nazwe konta w wiadomosci i odpytuje wlasciwe konto.

**Przyklady:**
- "Pokaz moje wydatki na koncie Rodzinnym" — odpytuje konto Rodzinne
- "Ile wydalem na jedzenie?" — odpytuje konto domyslne
- "Dodaj wydatek 100₴ na zakupy do Rodzinnego" — tworzy wydatek na koncie Rodzinnym

> **Uwaga:** Nie zmienia to na stale Twojego domyslnego konta. Uzyj `/account`, aby zmienic domyslne konto.

## Wiadomosci glosowe

1. Nagraj wiadomosc glosowa w Telegramie
2. Wyslij ja do bota
3. Bot transkrybuje Twoja mowe i przetwarza ja jako wiadomosc czatu AI

Wiadomosci glosowe obsluguja te same polecenia i pytania co wiadomosci tekstowe.

## Skanowanie paragonow

1. Zrob zdjecie paragonu
2. Wyslij zdjecie do bota
3. Bot skanuje je za pomoca OCR i wyswietla podsumowanie
4. Dotknij **Potwierdz**, aby dodac wydatek, lub **Anuluj**, aby odrzucic

Mozesz tez wysylac zdjecia paragonow jako dokumenty (PDF lub obrazy).

## Przelaczanie kont

Jesli masz wiele kont:

1. Wyslij `/account`
2. Bot pokaze wszystkie Twoje konta z przyciskami inline
3. Dotknij konto, na ktore chcesz sie przelaczyc
4. Aktywne konto jest oznaczone ptaszkiem

Wszystkie kolejne polecenia i zapytania AI beda uzywac wybranego konta, az przylaczysz sie ponownie.

## Obsluga walut

Bot rozpoznaje symbole i kody walut w poleceniach:

| Symbol | Waluta |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Przyklady:** `/expense 50$ obiad`, `/expense 100₴ zakupy`, `/expense 30 EUR taxi`

## FAQ

- **P: Czy moge uzywac bota bez laczenia?**
  **O:** Nie, najpierw musisz polaczyc swoje konto Telegram za pomoca kodu z aplikacji.

- **P: Czy bot dziala w czatach grupowych?**
  **O:** Bot jest przeznaczony wylacznie do rozmow prywatnych (1:1).

- **P: Ktore konto uzywa bot?**
  **O:** Bot uzywa Twojego domyslnego konta (ustawionego podczas laczenia lub przez `/account`). Mozesz tez wspomniec nazwe konta w wiadomosci, a AI automatycznie uzyje tego konta do zapytania.

- **P: Czy moge polaczyc wiele kont Telegram?**
  **O:** Nie, kazdy uzytkownik aplikacji moze miec jedno polaczone konto Telegram, a kazde konto Telegram moze byc polaczone z jednym uzytkownikiem.

- **P: Czy wiadomosci bota licza sie do limitu zapytan AI?**
  **O:** Tak, kazda wiadomosc przetworzona przez AI (tekst, glos) zuzywa jedno zapytanie z Twojego miesiecznego limitu.

---

*Zobacz takze: [Czat AI](./07-ai-chat.md) | [Konta](./09-accounts.md) | [Ustawienia](./11-settings.md)*
