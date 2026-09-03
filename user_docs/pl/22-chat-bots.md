# Czat-boty — Telegram, WhatsApp i Slack

> Zarządzaj finansami bezpośrednio z Telegrama, WhatsAppa lub Slacka. Rozmawiaj z AI, dodawaj wydatki, skanuj paragony i wysyłaj wiadomości głosowe — bez otwierania aplikacji.

## Przegląd

Połącz konto z **Telegramem**, **WhatsAppem**, **Slackiem** lub dowolną kombinacją jednocześnie. Wszystkie trzy boty oferują identyczne funkcje — używaj tego komunikatora, który preferujesz.

Aby połączyć: **Ustawienia → Czat-boty**.

## Łączenie konta

### Telegram
1. Dotknij **Połącz Telegrama** — pojawi się 6-znakowy kod (ważny 10 minut)
2. Otwórz Telegrama i znajdź bota
3. Wyślij `/link TWÓJ_KOD` (np. `/link A3F2B1`)
4. Zobaczysz „Konto połączone pomyślnie!"

### WhatsApp
1. Dotknij **Połącz WhatsApp** — pojawi się kod i kod QR
2. Dotknij **Otwórz WhatsApp** (wiadomość jest już wypełniona) lub zeskanuj kod QR
3. Wyślij `link TWÓJ_KOD` do bota
4. Zobaczysz „Konto połączone pomyślnie!"

### Slack
1. Dotknij **Połącz Slacka** — pojawi się 6-znakowy kod (ważny 10 minut)
2. Otwórz Slacka, znajdź aplikację **AI Budget Assistant** i otwórz z nią wiadomość bezpośrednią
3. Wyślij `link TWÓJ_KOD` (np. `link A3F2B1`)
4. Zobaczysz „Konto połączone pomyślnie!"

> Telegram, WhatsApp i Slack mogą być wszystkie połączone jednocześnie z tym samym kontem.

## Co możesz robić

- **Dodawać wydatki i dochody**: pisz naturalnie lub używaj poleceń
- **Czat z AI**: zadawaj dowolne pytania finansowe — ten sam AI co w aplikacji
- **Wiadomości głosowe**: mów swój wydatek lub pytanie (2 zapytania AI za wiadomość)
- **Zdjęcia paragonów**: wyślij zdjęcie do automatycznego skanowania (2 zapytania AI)
- **Sprawdzić użycie AI**: `/usage`
- **Przełączyć konto**: `/account`

## Polecenia

| Polecenie | Co robi |
|---|---|
| `/link KOD` | Połącz komunikator z aplikacją |
| `/expense 50 obiad` | Dodaj wydatek |
| `/income 3000 wynagrodzenie` | Dodaj dochód |
| `/category expense Jedzenie` | Utwórz kategorię |
| `/usage` | Sprawdź użycie AI |
| `/account` | Przełącz aktywne konto |
| `/newchat` | Rozpocznij nową rozmowę z AI |
| `/unlink` | Rozłącz bota |
| `/help` | Pokaż wszystkie polecenia |

> W **WhatsApp** i **Slacku** polecenia działają z `/` lub bez. Możesz też wpisać tylko kwotę i opis: `50 obiad`.

## Skanowanie paragonów

1. Zrób zdjęcie paragonu i wyślij je do bota
2. Bot rozpozna kwotę, datę i sprzedawcę
3. Jeśli data jest błędna — wyślij poprawną w formacie `DD.MM.RRRR`
4. Potwierdź lub anuluj

### Poprawianie zeskanowanych pozycji

OCR czasem źle odczyta cenę, wymyśli pozycję albo jakąś pominie. Dotknij **✏️ Pozycje** (w WhatsApp: **✏️ Popraw → Pozycje**) i wysyłaj po jednej poprawce w wiadomości:

| Wiadomość | Co robi |
|---|---|
| `3 = 14,69` | ustawia cenę pozycji 3 |
| `3: Chleb żytni` | zmienia nazwę pozycji 3 |
| `3 -` | usuwa pozycję 3 |
| `+ Chleb 5,99` | dodaje pozycję |
| `= 233,98` | poprawia sumę paragonu |

Działa i `14,69`, i `14.69`. Po każdej poprawce bot ponownie wysyła numerowaną listę oraz wiersz `Pozycje: … · suma paragonu: …` — jeśli te dwie liczby się nie zgadzają, coś na paragonie nadal jest źle odczytane. Podział na kategorie jest przeliczany z poprawionych pozycji, więc przy zmianie ceny popraw też sumę.

Gdy skończysz, dotknij **Dodaj wydatek** — nic nie jest zapisywane wcześniej, a anulowanie odrzuca wszystkie poprawki. Tutaj można poprawić tylko pozycje i sumę; aby zmienić kategorię pozycji, otwórz wydatek w aplikacji.

## Wiele kont

- Wspomnij nazwę konta w wiadomości: „Pokaż wydatki na koncie Rodzinnym" — AI zapyta to konto tylko dla tej wiadomości
- Użyj `/account` aby trwale zmienić domyślne konto

## Koszt zapytań AI

| Działanie | Zapytania AI |
|---|---|
| Wiadomość tekstowa / czat AI | 1 |
| Wiadomość głosowa | 2 |
| Zdjęcie paragonu | 2 |

Po przekroczeniu limitu bot powiadomi Cię zamiast przetwarzać zapytanie. Użyj `/usage` aby sprawdzić pozostały limit.

## Obsługa walut

Bot rozpoznaje symbole: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB).

## FAQ

**P: Czy można połączyć Telegrama, WhatsApp i Slacka?**
Tak — są to niezależne połączenia i wszystkie działają jednocześnie.

**P: W jakim języku odpowiada bot?**
W języku ustawionym w Ustawienia → Wygląd.

---

*Zobacz też: [Czat AI](./07-ai-chat.md) | [Konta](./09-accounts.md) | [Ustawienia](./11-settings.md)*
