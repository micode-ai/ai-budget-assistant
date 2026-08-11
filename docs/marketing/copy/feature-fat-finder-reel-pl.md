# AI Budget Assistant — Reel „Audyt wydatków" (Instagram / Facebook Reels)

Funkcja: **Audyt wydatków (Fat Finder)** — AI przegląda Twój miniony miesiąc i pokazuje, gdzie uciekają pieniądze: każde znalezisko ma kwotę obecną, kwotę sugerowaną, ile na tym możesz zaoszczędzić, konkretną podpowiedź co zrobić — i listę powiązanych wydatków, żeby było widać, z czego to wynika.

Ważne, żeby nie obiecywać za dużo:
- To **potencjalne** oszczędności (aplikacja tak je nazywa: „Potencjalne miesięczne oszczędności"), a nie kwota, którą użytkownik na pewno zaoszczędzi. W tekstach zawsze „możesz zaoszczędzić" / „potencjalnie", nigdy „zaoszczędzisz".
- Podpowiedzi generuje AI — to **sugestie do rozważenia**, nie porada finansowa.
- Funkcja jest w planie **Pro** — trzeba to napisać wprost, nie chować.
- Raport dotyczy wybranego miesiąca (nawigacja ← → u góry) i można go wygenerować ponownie.

Format: pionowy 9:16 (1080×1920, reel ~17 sek) oraz 4:5 (1080×1344, feed). Konto: profil AI Budget Assistant.
Link: https://play.google.com/store/apps/details?id=com.budget.assistant · app.ai-budget.pl

Renders: `docs/marketing/creatives/fat-finder/renders/pl/`
- `fat-finder-reel.mp4` / `.gif` (9:16) + `fat-finder-reel-4x5.mp4` / `.gif` (feed)
- `fat-finder-story.png` (9:16) + `fat-finder-story-4x5.png` (feed)

Render:
- `python docs/marketing/scripts/build_fat_finder_reel.py both` (+ `4:5`)
- `python docs/marketing/scripts/build_fat_finder_story.py both`

---

## Storyboard — Reel (PL)

| # | Czas | Co pokazujemy | Tekst na ekranie (eyebrow / nagłówek) | Uwagi |
|---|---|---|---|---|
| 1 | ~4 sek | Góra ekranu **Audyt wydatków**: „POTENCJALNE MIESIĘCZNE OSZCZĘDNOŚCI **1 807,37 zł**", miesiąc Lipiec 2026, „5 znalezisk" + pierwsze znalezisko (manicure, 150 → 75 zł) | AUDYT WYDATKÓW / „Gdzie uciekają Twoje pieniądze" | Mocne otwarcie liczbą. Podkreślić słowo „potencjalne" |
| 2 | ~4 sek | Znalezisko **„Wysoki wydatek na mieszkanie"** (waga: Wysoki): 4 350 → 3 375 zł, „Możesz zaoszczędzić 975,00 zł" + podpowiedź „Negocjuj z właścicielem obniżenie czynszu…" | KONKRETNE KWOTY / „Ile możesz zaoszczędzić" | Nie ogólniki — kwota + konkretny następny krok |
| 3 | ~4 sek | Znalezisko **„Wydatki na ubrania wzrosły"**: +813% w stosunku do poprzednich miesięcy, 321,53 → 100 zł | UKRYTE WZROSTY / „Wydatki, które urosły po cichu" | To rzecz, której nie widać w miesięcznej sumie |
| 4 | ~4 sek | Rozwinięte **„Powiązane wydatki"** pod znaleziskiem o częstych wizytach w Biedronce: lista 5 paragonów z datami i kwotami + przycisk „Wygeneruj raport ponownie" | DOWODY W ŚRODKU / „Widzisz, z czego to wynika" | Zamyka zarzut „AI coś sobie wymyśliło" |

Chipy na dole (stałe): **Audyt AI · Oszczędności · Dowody**.

---

## Story (statyczna)

Pojedynczy slajd do Instagram / Facebook Stories — bez ramki telefonu, sam komunikat. To ten slajd nosi **naklejkę *link* do Google Play** (reel jej nie ma), więc publikujemy go razem z reelem, nie zamiast.

Nagłówek: **„Gdzie uciekają pieniądze"** · podtytuł: „AI przegląda Twój miniony miesiąc" · CTA: „Zobacz swój audyt — w planie Pro".

| Karta | Wartość | Opis |
|---|---|---|
| ZNALEZISKA | **5** | konkretnych miejsc, nie ogólniki |
| POTENCJALNIE | **1 807 zł** | możliwych oszczędności / mies. |
| DOWODY | **paragony** | widzisz, z czego to wynika |

Pusty pas pod CTA jest zostawiony celowo — tam wchodzi naklejka *link* / *ankieta*.

**Opcjonalny sticker zaangażowania**: *Ankieta* — „Wiesz, ile miesięcznie idzie u Ciebie na drobne wydatki? TAK / NIE MAM POJĘCIA".

---

## Podpis do posta (PL)

```
🔍 Twoje pieniądze nie znikają. One wyciekają — po trochu, w kilku miejscach.

Audyt wydatków w AI Budget Assistant przegląda Twój miniony miesiąc i pokazuje te miejsca po imieniu. Nie „wydajesz za dużo", a konkretnie: która kategoria, ile teraz, ile mogłoby być i co z tym zrobić.

W przykładzie z nagrania: 5 znalezisk i 1 807,37 zł potencjalnych oszczędności miesięcznie.

Co dostajesz:
📊 Listę znalezisk z wagą: wysoki / średni / niski
💸 Kwotę przy każdym: obecnie → sugerowane → ile możesz zaoszczędzić
💡 Konkretną podpowiedź, co zrobić z tym wydatkiem
📈 Wzrosty, których nie widać w miesięcznej sumie (np. odzież +813%)
🧾 Powiązane wydatki pod każdym znaleziskiem — widzisz, z czego wynika wniosek
🔄 Raport dla dowolnego miesiąca, w każdej chwili do wygenerowania od nowa

To potencjalne oszczędności i sugestie do rozważenia — decyzję zawsze podejmujesz Ty.
Audyt wydatków jest częścią planu Pro.

📲 AI Budget Assistant — pobierz za darmo
🔗 Link w bio / Google Play

#budżetdomowy #oszczędzanie #finanseosobiste #audytwydatków #kontrolawydatków #gdzieuciekająpieniądze #aplikacjafinansowa #AIBudgetAssistant #micode #oszczędzaniepieniędzy
```

---

## Wariant krótki (Stories / napis do reela)

```
Nie wiesz, gdzie znikają pieniądze? 🔍
AI przegląda Twój miesiąc i pokazuje
konkretne miejsca — z kwotami.
AI Budget Assistant · Pro
```

---

## Uwagi produkcyjne

- Zrzuty pochodzą z prawdziwego konta (czynsz, manicure, paragony z Biedronki). Jeśli nie chcesz publikować własnych kwot, wygeneruj raport na koncie demo i podmień pliki w `creatives/fat-finder/` — nazwy w `SRC` w skrypcie zostają te same. **Po podmianie popraw też liczby w Story** (`CARDS` w `build_fat_finder_story.py`: liczba znalezisk i kwota), żeby slajd nie kłócił się z nagraniem.
- Zrzuty muszą być z wersji **≥ 1.16.1**. We wcześniejszych wydaniach raport mógł zostać opisany w złej walucie (brał walutę najświeższego wydatku, a nie Twoją walutę wyświetlania) — ABA-386.
- Druga funkcja z tej samej pary (**Historia wydatków / Spending Story**) nie ma jeszcze zrzutów. Planowana jako osobny reel, nie doklejana do tego — inny hook („jak minął miesiąc" vs „gdzie uciekają pieniądze").
