# Bot WhatsApp

> Zarządzaj finansami bezpośrednio z WhatsApp. Rozmawiaj z AI, dodawaj wydatki poleceniami, skanuj paragony i wysyłaj wiadomości głosowe — bez otwierania aplikacji.

## Przegląd

**Bot WhatsApp** umożliwia korzystanie z AI Budget Assistant przez WhatsApp. Połącz konto raz, a będziesz mógł śledzić wydatki, zadawać pytania finansowe i zarządzać budżetami prosto z komunikatora.

Bot działa tak samo jak [Bot Telegram](./22-telegram-bot.md): ten sam AI, te same polecenia, ta sama obsługa wielu kont.

## Połączenie konta

1. Otwórz aplikację i przejdź do **Ustawień**
2. Dotknij **WhatsApp Bot** w sekcji Integracje
3. Dotknij **Połącz WhatsApp** — pojawi się 6-znakowy kod i kod QR (ważny 10 minut)
4. Następnie:
   - Dotknij **Otwórz WhatsApp** — otworzy się WhatsApp z gotową wiadomością `link TWÓJ_KOD`.
   - Lub zeskanuj kod QR innym telefonem.
   - Lub skopiuj kod i wyślij `link TWÓJ_KOD` ręcznie na numer WhatsApp bota.
5. Pojawi się potwierdzenie: „Konto połączone!"

> **Uwaga:** Jeden numer WhatsApp łączy się z jednym kontem aplikacji. Ponowne połączenie zastępuje poprzednie.

## Polecenia bota

Polecenia działają z `/` lub bez — `expense 50 obiad` i `/expense 50 obiad` są równoważne.

| Polecenie | Opis |
|---|---|
| `link KOD` | Połącz WhatsApp |
| `expense KWOTA OPIS` | Szybko dodaj wydatek |
| `income KWOTA OPIS` | Szybko dodaj dochód |
| `category [TYP] NAZWA` | Utwórz kategorię |
| `categories` | Lista i usuwanie kategorii |
| `usage` | Użycie AI i limity |
| `account` | Zmiana konta |
| `newchat` | Nowa rozmowa z AI |
| `unlink` | Odłącz WhatsApp |
| `help` | Pokaż polecenia |

## Czat AI w WhatsApp

Wyślij dowolną wiadomość — AI ją przetworzy.

**Przykłady:**
- „Na co najwięcej wydałem w tym miesiącu?"
- „Pokaż moje wydatki z zeszłego tygodnia"

## Wiadomości głosowe

Nagraj wiadomość głosową w WhatsApp i wyślij ją botowi. Koszt: 2 żądania AI.

## Skanowanie paragonów

1. Zrób zdjęcie paragonu i wyślij botowi
2. Bot zeskanuje go przez OCR i pokaże podsumowanie
3. Jeśli data jest błędna, dotknij **Zmień datę** i wyślij `DD.MM.RRRR`
4. Dotknij **Dodaj wydatek** lub **Anuluj**

## Zmiana konta

Wyślij `account` — bot pokaże konta jako klikalną listę.

## Obsługiwane waluty

| Symbol | Waluta |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

## FAQ

- **P: Bez połączenia?** **O:** Nie, połącz WhatsApp kodem z aplikacji.
- **P: W grupach?** **O:** Nie, tylko 1:1.
- **P: WhatsApp i Telegram naraz?** **O:** Tak, niezależne połączenia.
- **P: Czy wiadomości liczą się do limitu AI?** **O:** Tak. Czat: 1, głos/paragony: 2.
- **P: Jaki język?** **O:** Ustawiony w aplikacji.

---

*Zobacz też: [Czat AI](./07-ai-chat.md) | [Bot Telegram](./22-telegram-bot.md) | [Ustawienia](./11-settings.md)*
