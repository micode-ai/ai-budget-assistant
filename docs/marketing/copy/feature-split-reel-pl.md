# AI Budget Assistant — Reel „Podziel paragon" (Instagram / Facebook Reels)

Nowa funkcja: **Podział paragonu przez link** — zapłaciłeś za wszystkich, a teraz dzielisz
rachunek ze znajomymi, **którzy nie mają aplikacji**. Przypisujesz pozycje z paragonu do
konkretnych osób (albo dzielisz kwotę równo), a aplikacja tworzy osobny prywatny link dla
każdego. Znajomy otwiera link i widzi **tylko swoją część** oraz przycisk zapłaty. Ty
potwierdzasz, kiedy pieniądze naprawdę wpłyną — i dług zamyka się sam.

Ważne (uczciwie): znajomy **nie potrzebuje konta ani aplikacji** — wystarczy link w dowolnym
komunikatorze. Przycisk zapłaty pojawia się, jeśli wcześniej zapiszesz swoje dane do
płatności w profilu: **Revolut i PayPal** dają gotowy przycisk z już wpisaną kwotą, **BLIK**
pokazuje Twój numer z instrukcją (BLIK nie ma linku międzybankowego), a „inne" wyświetla to,
co sam wpiszesz — np. numer konta.

Format: pionowy 9:16 (1080×1920) + wersja 4:5 do feedu, ~24–28 sek. Konto: profil AI Budget Assistant.
Link: https://play.google.com/store/apps/details?id=com.budget.assistant · app.ai-budget.pl

Render: `python build_split_reel.py both` (+ `4:5`) → `creatives/split/renders/pl/`

---

## Storyboard (PL)

| # | Czas | Co pokazujemy | Tekst na ekranie (eyebrow / nagłówek) | Uwagi |
|---|---|---|---|---|
| 1 | ~7 sek | **Szczegóły wydatku** — paragon z Biedronki, a w dolnym rzędzie akcji ikona osób (podział) | RACHUNEK ZA WSZYSTKICH / „Zapłaciłeś Ty — rozlicz to w 3 dotknięciach" | Punkt wejścia: jedna ikona przy wydatku, bez szukania w menu |
| 2 | ~8 sek | **Podziel ten paragon** — 30,98 zł, Biedronka, pozycje „Wino 21,99 zł" i „Serk Dani 8,99 zł", podpowiedź „Dotknij pozycję, a potem osobę", chip „+ Dodaj osobę" | PRZYPISZ POZYCJE / „Każdy płaci za to, co wziął" | Pozycje pochodzą z zeskanowanego paragonu — nie trzeba nic przepisywać. Brak pozycji? Dzielimy kwotę równo |
| 3 | ~7 sek | **Widok znajomego** (przeglądarka, bez logowania): jego pozycje, jego kwota, przycisk „Zapłać przez Revolut" z wpisaną sumą + „Zapłaciłem" | LINK DLA ZNAJOMEGO / „Bez aplikacji, bez konta" | Każdy widzi **tylko swoją część** — nie widzi ani całego paragonu, ani innych osób |
| 4 | ~6 sek | **Status podziału** u Ciebie: lista osób ze statusami „Wysłano / Otwarto / Mówi, że zapłacił", przycisk „Potwierdź odbiór" | TY MASZ KONTROLĘ / „Potwierdzasz, gdy pieniądze wpłyną" | „Mówi, że zapłacił" to deklaracja znajomego — potwierdzasz Ty, i wtedy dług się zamyka |

Chipy na dole (stałe): **Podziel paragon · Link bez aplikacji · Revolut / BLIK / PayPal · Potwierdzasz Ty**.

**Materiały do domknięcia:** mamy zrzuty do scen 1 i 2 (`photo_1`, `photo_2`). Brakuje scen 3 i 4 —
widoku znajomego (to najmocniejszy kadr całego reela) i ekranu statusów. Zrzuty do nich zrób
na **testowym podziale z wymyślonymi imionami**: prawdziwa strona gościa zawiera nazwę
sklepu, kwoty i imiona realnych osób.

---

## Podpis do posta (PL)

```
🧾 Zapłaciłeś za cały stół? Rozlicz się bez proszenia się i bez tabelek w Excelu.

AI Budget Assistant dzieli paragon przez link. Przypisujesz pozycje do osób — każdy dostaje swój prywatny link i widzi TYLKO swoją część. Bez aplikacji. Bez konta. Bez rejestracji.

Jak to działa:
🧾 Skanujesz paragon — pozycje wczytują się same
👥 Dotykasz pozycję, potem osobę, która ją zamówiła
🔗 Aplikacja tworzy osobny link dla każdego znajomego
💸 Znajomy otwiera link i płaci: Revolut albo PayPal z gotową kwotą, BLIK z Twoim numerem
✅ Ty potwierdzasz, gdy pieniądze wpłyną — dług zamyka się sam

Bez aplikacji po drugiej stronie. Bez przypominania. Bez „ile ja Ci właściwie wisiałem?" 👇
```

**Hashtagi:** #podziałrachunku #rachunek #paragon #BLIK #Revolut #wspólnewydatki #budżet #oszczędzanie #finanseosobiste #aplikacjafinansowa #znajomi #wyjścieznajomymi #AIBudgetAssistant #micode

---

## Wersja krótka (Stories / 1 kadr)

```
🧾 Zapłaciłeś za wszystkich?

Podziel paragon przez link — każdy znajomy dostaje swoją część
i płaci przez Revolut, PayPal albo BLIK.

Bez aplikacji po drugiej stronie 👇
```

---

## Czego NIE obiecujemy w tym poście

Świadome ograniczenia, żeby żadna wersja tekstu ich nie przekroczyła:

- **BLIK to nie przycisk.** BLIK nie ma linku międzybankowego — pokazujemy Twój numer z
  instrukcją. Nigdzie nie sugerujemy „zapłata BLIK jednym dotknięciem".
- **Przycisk zapłaty wymaga Twojej konfiguracji.** Jeśli nie zapiszesz danych do płatności w
  profilu, znajomy zobaczy samą kwotę. Nie piszemy „zawsze z przyciskiem".
- **Nie ściągamy pieniędzy za Ciebie.** Nie jesteśmy operatorem płatności: link prowadzi do
  Revolut/PayPal, a potwierdzenie wpłaty jest Twoją decyzją. Żadnego „gwarantujemy zwrot".
- **Aplikacja nikogo nie ponagla.** Znajomy, który nie zapłacił, ma po prostu status
  „Wysłano" — nie ma przypomnień ani ponagleń, i tak to opisujemy.
