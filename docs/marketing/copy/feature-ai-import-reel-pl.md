# Import z dowolnego banku (AI) — reel + story (PL)

Renders: `docs/marketing/creatives/ai-import/renders/pl/`
Skrypty: `build_ai_import_reel.py` (wideo) + `build_ai_import_story.py` (story)

**Reel:** `ai-import-reel.mp4` / `.gif` (9:16) oraz `-4x5` (feed).
**Story:** `ai-import-story.png` (+ `-4x5`) — trzy karty korzyści, bez telefonu.

Funkcja: ABA-390 / ABA-391 — gdy dla banku nie ma gotowego parsera, aplikacja
wysyła wiersz nagłówka (albo fragment tekstu z PDF) do modelu AI, który
rozpoznaje, która kolumna jest datą, kwotą i opisem. Dzięki temu wyciąg z banku
spoza listy i tak się zaimportuje.

## Storyboard (2 sceny, 9:16, 8,8 s)

| # | Ekran | Nagłówek (eyebrow / headline) | Co pokazuje |
|---|---|---|---|
| 1 | Importuj transakcje | NOWOŚĆ · „Wyciąg z banku, którego nie ma na liście" | Sekcja **SZYBKI IMPORT** z nową pozycją **Rozpoznaj automatycznie (dowolny bank)** nad listą banków |
| 2 | Podgląd importu | AI CZYTA WYCIĄG · „77 transakcji gotowych do importu" | Rozpoznany wyciąg zagranicznego banku — kwoty w Br (BYN), „Wybrano: 77", przycisk **Importuj (77)** |

Reel celowo ma tylko dwie sceny: wejście i wynik. Ekrany ustawień,
automatycznego przechwytywania z powiadomień i przełącznika kont zostały
usunięte — dotyczą innych funkcji i rozmywały przekaz. Zrzuty zostają w
`creatives/ai-import/`, więc gdyby miały wrócić, wystarczy dopisać je do `SRC`
i `SCENE_PHASE` w skrypcie.

Pills: CSV, XLSX · PDF w Pro · Bez ręcznego wpisywania  Stopka: MICODE + mi-code.pl

## Post — caption (Instagram / Facebook)

> **„Mojego banku nie ma na liście." Teraz to już nie problem. 🏦**
>
> Do tej pory import wyciągu działał tylko dla banków, dla których ktoś wcześniej napisał obsługę. Miałeś konto w mniejszym banku albo za granicą? Zostawało ręczne przepisywanie.
>
> W **AI Budget Assistant** jest teraz **Rozpoznaj automatycznie (dowolny bank)**. Wrzucasz plik, a AI sprawdza, która kolumna jest datą, która kwotą, a która opisem — i pokazuje gotową listę do zatwierdzenia.
>
> 🤖 Rozpoznaje układ pliku sam, bez ustawiania kolumn
> 📄 CSV i XLSX w każdym planie, PDF w planie Pro
> 🌍 Działa też z wyciągiem w innej walucie
> ✅ Zanim cokolwiek trafi do budżetu, przeglądasz i odznaczasz, co chcesz
>
> Ustawienia → **Importuj transakcje** → Rozpoznaj automatycznie
>
> #budżetdomowy #finanseosobiste #importbankowy #AI #aplikacja #AIBudgetAssistant

## Wariant krótki (story / reklama)

> Twojego banku nie ma na liście? 🏦
> Wrzuć wyciąg — **AI sam rozpozna kolumny**.
> AI Budget Assistant → Ustawienia → Importuj transakcje

## Wariant pod reklamę (hook w 3 sekundy)

> **Przepisujesz wyciąg ręcznie, bo Twojego banku nie ma na liście?**
> Wrzuć plik. AI rozpozna, gdzie jest data, kwota i opis.
> 77 transakcji z jednego wyciągu — bez wpisywania.

## Uwagi — czego NIE obiecywać

- **„Dowolny bank" to sformułowanie z samej aplikacji** (nazwa pozycji w menu). Nie
  podbijać go do „każdy bank świata".
- **Rozpoznawanie kolumn z CSV/XLSX jest darmowe, ale wyciąganie danych z PDF to
  funkcja Pro.** Dlatego pill mówi „PDF w Pro", a karta w story „oraz PDF w planie
  Pro". Nie pisać, że całość jest za darmo.
- **Aplikacja nie obiecuje, że znalazła wszystkie transakcje.** W scenie 2 celowo
  zostawiony jest jej własny komunikat: „Nie mogliśmy potwierdzić, że znaleziono
  wszystkie transakcje — ten wyciąg nie ma salda końcowego do porównania". To atut
  (uczciwość), nie wada — nie kadrować go poza obraz i nie pisać „importuje
  wszystko".
- **Przy pierwszym użyciu aplikacja prosi o zgodę**, bo fragment pliku (wiersz
  nagłówka i kilka przykładowych wierszy) jest wysyłany do zewnętrznego dostawcy
  AI. Jeśli ktoś zapyta w komentarzach o prywatność — to jest odpowiedź, i warto ją
  podać wprost.
- **Liczba 77 pochodzi z prawdziwego zrzutu**, nie jest okrągłą liczbą
  marketingową. Przy wymianie zrzutu trzeba ją zmienić w skrypcie reela i story.

## Uwagi — dane na zrzutach

- Scena 2 to prawdziwy wyciąg z banku (BYN), dlatego **kolumna z nazwami, datami
  i kwotami jest rozmyta** (`BLUR` w `build_ai_import_reel.py`). Bez tego widać
  było nazwy sprzedawców, w tym aptekę i jednoosobową działalność z nazwiskiem w
  nazwie.
- Rozmycie celowo **nie obejmuje** checkboxów, nagłówka „Wybrano: 77", ostrzeżenia
  ani przycisku „Importuj (77)" — to one niosą przekaz, a ostry interfejs przy
  rozmytej treści czyta się jako świadoma ochrona prywatności, a nie zepsuty
  zrzut. Rozmycie nakładane jest na oryginale, przed skalowaniem do ramki
  telefonu; odwrotna kolejność przepuściłaby czytelne krawędzie.
- Obszar rozmycia podany jest w **ułamkach** rozmiaru zrzutu, więc podmiana
  screenshotu na inny o innej rozdzielczości nie przesunie go po cichu. Przy
  zmianie układu ekranu trzeba go zweryfikować ręcznie.
