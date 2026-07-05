# Osobisty wskaźnik inflacji

> Śledź, jak zmieniają się ceny, które faktycznie płacisz, wyliczane na podstawie zeskanowanych paragonów — bez kosztów AI.

Osobisty wskaźnik inflacji pokazuje, jak zmieniły się ceny, które rzeczywiście płacisz — wyliczony na podstawie Twoich własnych skanów paragonów. W odróżnieniu od oficjalnych danych inflacyjnych, odzwierciedla Twój realny koszyk zakupów.

## Jak to działa

Kiedy skantujesz paragon, aplikacja wyodrębnia poszczególne pozycje (np. "Mleko Łaciate", "Chleb Razowy") i rejestruje zapłaconą cenę oraz nazwę sklepu. Z czasem aplikacja buduje historię cen dla każdego produktu i oblicza Twoją osobistą inflację jako ważoną średnią wszystkich śledzonych produktów.

Formuła nadaje większą wagę produktom, na które wydajesz więcej (te, które kupujesz często i drogo, mają większy wpływ na wskaźnik), dzięki czemu uzyskujesz rzetelny obraz tego, jak zmiany cen wpływają na Twoje konkretne wydatki.

## Gdzie to znaleźć

Osobisty wskaźnik inflacji pojawia się na karcie **Analityka**, poniżej sekcji AI Insights. Pokazuje:

- Nagłówek z liczbą: **"Twoja inflacja: +11,4%"** w wybranym okresie
- Liczbę śledzonych produktów
- Listę produktów z indywidualnymi zmianami cen
- Wykres historii cen i porównanie sklepów dla każdego produktu (stuknij w dowolny produkt)

## Wybór okresu

Stuknij **3M**, **6M** lub **12M**, aby zmienić okres porównania. Aplikacja porównuje ceny z pierwszej połowy okresu ("baza") z drugą połową ("bieżący"), więc okres 6-miesięczny porównuje miesiące 1–3 z miesiącami 4–6.

Wskaźnik pokazuje wartość `null`, dopóki co najmniej 3 produkty nie będą miały zakupów zarówno w okresie bazowym, jak i bieżącym.

## Porównanie sklepów

Stuknij w dowolny produkt, aby zobaczyć:
- Wykres historii cen w czasie
- Tabelę z najnowszą ceną w każdym sklepie, w którym kupowałeś ten produkt, posortowaną od najtańszej
- Opcję zmiany nazwy produktu (patrz niżej)

## Zarządzanie nazwami produktów

Aplikacja automatycznie przypisuje krótką, czystą nazwę do każdego produktu (np. "PIWO TYSKIE 0,5L 4,7%" → "Tyskie Piwo"). Możesz korygować lub dostosowywać te nazwy.

### Zmiana nazwy jednego produktu

Stuknij w dowolną pozycję produktu w sekcji inflacji, a następnie wybierz opcję zmiany nazwy. Wpisz preferowaną nazwę i zapisz. Dotyczy to tylko sposobu wyświetlania produktu — historia cen jest zachowana.

### Zarządzanie wszystkimi produktami

Przejdź do **Ustawienia → Dane referencyjne → Produkty**, aby zobaczyć wszystkie śledzone produkty. Stąd możesz:

- **Zmienić nazwę** dowolnego produktu (stuknij w wiersz)
- **Scalić** wiele wariantów produktu w jeden (przytrzymaj, aby zaznaczyć, następnie stuknij Scal) — przydatne, gdy ten sam produkt pojawia się pod nieco różnymi nazwami
- **Zresetować** niestandardową nazwę do oryginalnej (stuknij ikonę resetowania w wierszu, który został przemianowany)

### Scalanie produktów

Jeśli widzisz "Mleko 3,2%" i "Mleko Łaciate" osobno, ale to ten sam produkt, zaznacz oba, stuknij Scal i podaj żądaną kanoniczną nazwę. Cała historia cen obu nazw zostanie połączona pod tą jedną nazwą.

## Jak uzyskać więcej danych

Wskaźnik wymaga co najmniej 3 produktów z zakupami zarówno w okresie bazowym, jak i bieżącym. Jeśli widzisz komunikat "Zeskanuj kilka paragonów", kontynuuj skanowanie — wskaźnik pojawi się automatycznie po zebraniu wystarczającej ilości danych.

Do wskaźnika przyczyniają się tylko paragony skanowane aparatem (OCR). Ręcznie wprowadzone wydatki i importy bankowe nie zawierają pozycji produktowych.

## Prywatność

Cała historia cen jest przechowywana na Twoim koncie na serwerze. Nie jest udostępniana między kontami ani nie służy do budowania żadnego wspólnego katalogu produktów. Jeśli usuniesz konto, cała historia cen zostanie usunięta razem z nim.
