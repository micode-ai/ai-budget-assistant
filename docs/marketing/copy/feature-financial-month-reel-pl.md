# Miesiąc finansowy — reel + stories (PL)

Renders: `docs/marketing/creatives/financial-month/renders/pl/`
Skrypty: `build_financial_month_reel.py` (wideo) + `build_financial_month_story.py` (stories)

**Reel:** `financial-month-reel.mp4` / `.gif` (9:16) oraz `-4x5` (feed).

**Stories:**
- `stories/01-ustawienia.png`, `02-wybor-dnia.png`, `03-pulpit.png` — po jednej
  scenie na slajd, w telefonie, z nagłówkiem fazy. Do wrzucenia jako sekwencja
  trzech stories z naklejką „Dalej".
- `financial-month-story-all.png` (+ `-4x5`) — cała funkcja jako 4 kroki, bez
  telefonu. Dobre jako pojedyncze story albo post w karuzeli.

## Storyboard (3 sceny, 9:16)

| # | Ekran | Nagłówek (eyebrow / headline) | Co pokazuje |
|---|---|---|---|
| 1 | Ustawienia konta | MIESIĄC FINANSOWY · „Wypłata 10-go? Budżet też od 10-go" | Sekcja **Miesiąc finansowy** na koncie — dziś ustawiona na „Miesiąc kalendarzowy (od 1.)" |
| 2 | Wybór dnia | JEDNO USTAWIENIE · „Wybierz swój dzień wypłaty" | Arkusz „Miesiąc finansowy zaczyna się" — wyjaśnienie + lista dni 1–31 + Zapisz |
| 3 | Pulpit | GOTOWE · „Budżet liczy się od wypłaty do wypłaty" | Karta **Budżet miesięczny** z podpisem zakresu **2 sie – 1 wrz** i kwotą 8200,00 zł |

Pills: Miesiąc finansowy · Budżety · Raporty  Stopka: MICODE + mi-code.pl

## Post — caption (Instagram / Facebook)

> **Wypłata przychodzi 10-go. A budżet resetuje się 1-go. 🤨**
>
> Znasz to? Ostatni tydzień przed wypłatą wygląda w aplikacji jak katastrofa, a zaraz potem wszystko „magicznie" wraca do zera — bo miesiąc kalendarzowy nie ma nic wspólnego z tym, kiedy naprawdę dostajesz pieniądze.
>
> W **AI Budget Assistant** ustawisz teraz **miesiąc finansowy**: wybierasz dzień wypłaty, a budżety liczą się od wypłaty do wypłaty.
>
> 📅 Wypłata 10-go? Budżet działa od 10. do 9.
> 🔁 Zmiana działa też wstecz — poprzednie okresy przeliczą się same
> 🔒 Twoje dane pozostają bez zmian, zmienia się tylko sposób liczenia
> 👨‍👩‍👧 Ustawiasz raz dla konta — cała rodzina widzi te same liczby
>
> Ustawienia → Konta → wybierz konto → **Miesiąc finansowy**
>
> #budżetdomowy #finanseosobiste #oszczędzanie #wypłata #aplikacja #AIBudgetAssistant

## Stories — 4 kroki (recap)

| # | Krok | Dopisek |
|---|---|---|
| 1 | Wybierasz dzień wypłaty | raz, w ustawieniach konta |
| 2 | Budżet startuje w tym dniu | np. od 10. do 9. |
| 3 | Poprzednie okresy się przeliczą | dane zostają bez zmian |
| 4 | Całe konto widzi to samo | jedno ustawienie, wspólne liczby |

Krok 4 celowo mówi „całe konto", a nie „każdy ustawia sobie" — ustawienie jest
jedno na konto i zmienia je wyłącznie właściciel. Wspólny budżet musi mieć jeden
okres, inaczej dwie osoby widziałyby różne liczby dla tego samego budżetu.

## Wariant krótki (stories / reklama)

> Wypłata 10-go, a budżet od 1-go? ⏳
> Ustaw **miesiąc finansowy** i licz od wypłaty do wypłaty.
> AI Budget Assistant → Ustawienia → Konta

## Wariant pod reklamę (hook w 3 sekundy)

> **Twój budżet kończy się w złym dniu.**
> Jeśli wypłata przychodzi w połowie miesiąca, budżet kalendarzowy zawsze będzie kłamać.
> Ustaw dzień wypłaty — resztę policzy aplikacja.

## Uwagi

- Zrzuty pochodzą z realnego konta („Family", 8200,00 zł). Kwota to **limit budżetu**, nie saldo — jeśli ma zniknąć, wystarczy włączyć `blur_balance()` w skrypcie dla sceny 2.
- Podpis zakresu (**2 sie – 1 wrz**) na karcie budżetu pojawia się wyłącznie wtedy, gdy konto ma ustawiony inny dzień niż 1. — u osób na miesiącu kalendarzowym karta wygląda jak wcześniej. Warto to podkreślić w komentarzach, jeśli ktoś zapyta „u mnie tego nie ma".
- Ustawienie jest dostępne tylko dla **właściciela konta**.
