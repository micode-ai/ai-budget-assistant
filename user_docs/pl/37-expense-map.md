# Mapa wydatków

> Zobacz swoje wydatki na mapie. Zeskanowane paragony są umieszczane według adresu sklepu; dodaj swoją lokalizację lub ustaw pinezkę ręcznie.

Zobacz swoje wydatki na mapie. Wydatki mogą mieć przypisaną lokalizację — pobraną z adresu sklepu wydrukowanego na zeskanowanym paragonie, z GPS Twojego telefonu w momencie dodawania wydatku, lub ustawioną ręcznie — a aplikacja może pokazać dowolną przefiltrowaną listę wydatków jako klikalne pinezki na mapie.

## Skąd biorą się lokalizacje

Wydatek otrzymuje swoją lokalizację z jednego z trzech źródeł (wyższe wygrywa):

1. **Ręczna pinezka** — samodzielnie umieszczasz lub przesuwasz pinezkę na ekranie lokalizacji wydatku.
2. **Adres z paragonu** — gdy skanujesz paragon, aplikacja odczytuje wydrukowany na nim adres sklepu i automatycznie przelicza go na współrzędne mapy. Działa to nawet wtedy, gdy zeskanujesz paragon później, w domu. Paragony wysłane do botów czatu (Telegram, WhatsApp, Slack) są umieszczane w ten sam sposób.
3. **GPS w momencie dodania** — opcjonalnie aplikacja może po cichu dołączyć Twoją aktualną pozycję, gdy dodajesz wydatek na miejscu (wpis ręczny, wpis głosowy lub automatyczne przechwytywanie z powiadomienia bankowego).

Zaimportowane transakcje (pliki bankowe CSV/PDF) nie otrzymują lokalizacji.

## Włączanie przechwytywania GPS

Przechwytywanie GPS jest **domyślnie wyłączone**. Aby je włączyć:

1. Otwórz **Ustawienia → Dane i raporty**.
2. W sekcji **Lokalizacja** włącz opcję **Dołączaj lokalizację do nowych wydatków**.
3. Zezwól na uprawnienie lokalizacji, gdy zapyta o to system.

Po włączeniu nowe wydatki dodawane w terenie automatycznie otrzymują Twoją aktualną pozycję. Zawsze możesz zobaczyć i usunąć lokalizację wydatku, a przełącznik możesz wyłączyć w dowolnym momencie.

## Widok mapy na karcie Wydatki

Na karcie **Wydatki** stuknij ikonę mapy obok ikony wyszukiwania, aby przełączyć się z listy na mapę. Mapa pokazuje te same wydatki co lista — obowiązują Twoje filtry okresu, kategorii i sprzedawcy. Stuknij ikonę ponownie, aby wrócić do listy.

- Bliskie sobie wydatki są grupowane w ponumerowane klastry; stuknij klaster, aby przybliżyć.
- Stuknij pinezkę, aby zobaczyć sprzedawcę i kwotę; stuknij **Otwórz**, aby przejść do tego wydatku.
- Jeśli część przefiltrowanych wydatków nie ma lokalizacji, mały baner pokazuje ile.

## Lokalizacja na ekranie wydatku

Gdy wydatek ma lokalizację, jego ekran szczegółów pokazuje małą mapę z pinezką i adresem (lub współrzędnymi). Stąd możesz:

- **Edytuj lokalizację** — otwiera mapę na pełnym ekranie, na której możesz stuknięciem umieścić pinezkę, przeciągnąć ją lub użyć opcji **Moja lokalizacja**, aby przejść do miejsca, w którym się znajdujesz.
- **Usuń lokalizację** — ikona kosza obok mapy usuwa pinezkę jednym stuknięciem.

Wydatek bez lokalizacji pokazuje zamiast tego przycisk **Dodaj lokalizację** (tylko dla edytorów).

## Mapa podróży

Konta podróży mają dedykowany punkt wejścia: otwórz konto podróży i stuknij **Mapa podróży**. Aplikacja przełącza się na tę podróż i otwiera kartę Wydatki w trybie mapy — wizualny dziennik tego, na co poszły pieniądze w trakcie podróży. W połączeniu ze skanowaniem paragonów i przechwytywaniem GPS większość wydatków z podróży trafia na mapę automatycznie.

## Prywatność

- Przechwytywanie GPS jest ściśle opcjonalne i domyślnie wyłączone; uprawnienie jest wymagane dopiero po włączeniu przełącznika.
- Wyszukiwanie adresu z paragonu wykorzystuje wyłącznie adres wydrukowany na paragonie — lokalizacja telefonu nie jest w to zaangażowana.
- Lokalizacja jest częścią rekordu wydatku: członkowie wspólnego konta, którzy widzą dany wydatek, widzą też jego lokalizację.
- W każdej chwili możesz usunąć lokalizację dowolnego wydatku.
