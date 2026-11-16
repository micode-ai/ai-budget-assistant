# Analityka

> Wizualizuj wzorce wydatkow za pomoca interaktywnych wykresow. Filtruj wedlug okresu i waluty, zaglebaj sie w szczegoly i korzystaj z wniosków opartych na AI, aby lepiej zrozumiec swoje finanse.

## Przeglad

Zakladka **Analityka** zapewnia kompleksowy widok Twoich wydatkow poprzez wykresy, wnioski i eksploracje danych. Wszystkie dane bazuja na wydatkach z wybranego konta.

![Ekran analityki z historią wydatków i przychodami według kategorii](../img/analytics.jpg)

## Zakres czasowy i filtry

U gory ekranu Analityki:

- **Przelacznik zakresu czasowego**: **Tydzien** | **Miesiac** | **Rok**
- **Filtr waluty**: **Wszystkie** waluty lub wybierz konkretna (USD, EUR, PLN itd.)

Jeśli konto ma ustawiony **Miesiąc finansowy** (na przykład od dnia wypłaty, 10.), widok **Miesiąc** go uwzględnia: *październik* obejmuje wtedy 10 października – 9 listopada, a dokładne daty widać pod nazwą miesiąca. Porównania z wcześniejszymi miesiącami i słupki miesięczne używają tych samych okresów. Widoki Tydzień i Rok zostają kalendarzowe.

Wybrany zakres wplywa na wszystkie wykresy i wnioski ponizej.

## Karty podsumowania

- **Lacznie wydano** — calkowite wydatki za wybrany okres
  - **vs. poprzedni okres** — "wiecej/mniej niz poprzedni tydzien/miesiac/rok" z procentem
  - **vs. srednia 3 miesiecy** — np. "18% powyzej sredniej 3 miesiecy" (zielony = ponizej, czerwony = powyzej), pojawia sie po co najmniej 1 pelnym poprzednim miesiacu
- **Srednio dziennie** — srednie dzienne wydatki

Dopóki okres trwa, oba porównania dotyczą tych samych dni: 5. dnia miesiąca twoje pierwsze pięć dni porównujemy z pierwszymi pięcioma dniami poprzedniego okresu (i ostatnich trzech miesięcy), więc rozpoczęty miesiąc nigdy nie wygląda jak duża oszczędność. **Średnio dziennie** liczy tylko dni, które już minęły. Wiersz ze średnią z 3 miesięcy pojawia się w widoku Miesiąc.

## Przychody a wydatki

Pokazuje, ile w wybranym okresie **zarobiono**, **wydano** i ile **zostało**, a także jaką część przychodów udało się zatrzymać (stopa oszczędności). Jeśli wydatki przekroczyły przychody, ostatnia wartość ma etykietę **Przekroczono**. Poniżej słupki porównują przychody i wydatki miesiąc po miesiącu: ostatnie 6 miesięcy w widoku Miesiąc i wszystkie miesiące roku w widoku Rok.

## Stałe a zmienne

Pokazuje, jaka część wydatków to koszty **stałe** — pieniądze, które i tak wychodzą w każdym okresie — i wymienia największe z nich. Wydatek liczy się jako stały, gdy jest cykliczny albo pasuje do jednej z aktywnych subskrypcji w menedżerze subskrypcji (ta sama nazwa albo ta sama kategoria i kwota). Wszystko inne jest zmienne. Aby czynsz lub inna regularna płatność liczyła się jako stała, oznacz ją jako cykliczną albo dodaj jako subskrypcję. Obciążenia, które menedżer subskrypcji zapisuje automatycznie przy odnowieniu, zawsze liczą się jako stałe — nawet po zmianie nazwy lub anulowaniu subskrypcji.

Możesz też oznaczyć całą kategorię wydatków jako stałą: otwórz **Ustawienia → Kategorie**, edytuj kategorię (np. *Mieszkanie*) i włącz **Licz jako koszt stały**. Dotyczy to bieżącego konta i wszystkich jego członków; przy podzielonym paragonie liczy się tylko część w tej kategorii.

## Najbliższe 30 dni

Widoczne, gdy oglądasz bieżący okres. To szacunek salda na każdy z najbliższych 30 dni: dzisiejsze saldo, plus przychody wpływające co miesiąc, minus odnowienia subskrypcji i wydatki cykliczne w ich terminach, minus typowy dzień codziennych wydatków. Jeśli saldo miałoby spaść poniżej zera, karta podaje, od którego dnia, a słupki pod linią to pokazują. **Nadchodzące** wymienia najbliższe płatności i wpływy. Wpłaty na cele oszczędnościowe nie są odejmowane, a przychody, które nie przychodzą co miesiąc, nie są liczone – traktuj tę liczbę jako wskazówkę, nie obietnicę. Planowane zakupy i długi z terminem spłaty też są odejmowane w ich dniu (zaległe — dziś); pieniądze, które inni są Ci winni, nie są liczone. Aby zobaczyć prognozę z tymi pieniędzmi, włącz na karcie **Uwzględnij pieniądze, które ktoś Ci winien**: pozostała kwota zostanie dodana w dniu terminu zwrotu (zaległe — dziś). Podobnie **Uwzględnij nieregularne przychody** dodaje średni dzień przychodów, które nie przychodzą co miesiąc (zlecenia, zwroty), z ostatnich miesięcy; przełącznik pojawia się tylko, gdy takie przychody są.

## Rok do roku

W widoku miesiąca i roku ta karta porównuje okres z tym samym okresem rok wcześniej: sumę i najważniejsze kategorie, każdą z ówczesną kwotą i zmianą. Dopóki okres trwa, porównywana jest ta sama liczba dni, więc pierwszy tydzień tego miesiąca zestawiany jest z pierwszym tygodniem tego samego miesiąca rok temu. Większe wydatki są czerwone, mniejsze zielone; kategoria bez wydatków rok temu ma oznaczenie **nowe**. Jeśli konto ma **Miesiąc finansowy**, „ten sam miesiąc rok temu” to ten miesiąc finansowy. Karta pojawia się, gdy w zeszłorocznym okresie są wydatki.

## Karuzela wnioskow AI

Poziomo przewijana karuzela wnioskow generowanych przez AI (wymaga planu Pro):

- **Anomalie wydatkow** — wykryto nietypowe wydatki (np. "78% wiecej niz zwykle na Transport")
- **Prognozy budzetowe** — kiedy prognozowane jest wyczerpanie budzetu
- **Mozliwosci oszczednosci** — sugestie redukcji wydatkow
- **Porownania kategorii** — jak Twoje wydatki rokladaja sie miedzy kategoriami
- **Zmiany trendow** — znaczace zmiany we wzorcach wydatkow

Kazda karta wnioskow ma poziom waznosci: krytyczny (czerwony), ostrzezenie (zolty) lub informacyjny (niebieski).

> **Uwaga:** Uzytkownicy darmowego planu widza zachete do ulepszenia: "Ulepsz do Pro, aby uzyskac wnioski AI."

## Wykresy

### Przychody wedlug kategorii (wykres pierścieniowy)

- Pokazuje Twoje przychody podzielone wedlug kategorii dla wybranego okresu
- Wyswietla sie tylko wtedy, gdy masz wpisy przychodow z kategoriami (np. Wynagrodzenie, Freelance, Dywidendy, Najem)
- Kodowany kolorami w palecie zielono-morskiej, odrozniajac sie od wykresow wydatkow
- Przychody bez kategorii sa grupowane jako „Inne"
- Pojawia sie powyzej wykresu trendu wydatkow
- Kategorie przychodów działają tak samo: kategorie główne pokazują sumę swoich podkategorii, a dotknięcie otwiera widok szczegółowy.

### Trend wydatkow (wykres slupkowy)

- Pokazuje dzienne lub miesieczne wydatki w wybranym okresie
- Interaktywny: dotknij dowolny slupek, aby zaglebic sie w dany segment czasowy

### Wydatki wg kategorii (wykres kolowy)

- Podzial na kategorie z procentami
- Kodowany kolorami wedlug kategorii
- Dotknij fragmentu kategorii głównej (oznaczonej ›), aby zobaczyć jej podkategorie; fragment bez podkategorii zostaje po dotknięciu tylko wyróżniony
- **Podkategorie są sumowane** — wykres pokazuje tylko kategorie główne, a kwota kategorii głównej obejmuje jej podkategorie. Kategorie główne z podkategoriami są oznaczone ›. Dotknij jednej z nich (fragmentu wykresu lub jej wiersza), aby przerysować wykres dla tej kategorii: jej podkategorie oraz „<Kategoria> (bez podkategorii)” dla wydatków zapisanych bezpośrednio na kategorii głównej. Dotknij ścieżki „Wszystkie kategorie › <Kategoria>”, aby wrócić. Widok szczegółowy resetuje się za każdym razem, gdy dane analiz są przeliczane: po dodaniu lub edycji transakcji, synchronizacji, zmianie języka albo zmianie okresu, konta lub waluty. Wydatki na usuniętej podkategorii pozostają osobnym fragmentem najwyższego poziomu, ponieważ aplikacja nie przechowuje usuniętych kategorii na urządzeniu. Znaczniki „vs średnia” dla kategorii głównej używają skumulowanej kwoty. To samo działa na kartach analiz w wersji webowej na komputer.

### Budzet vs Rzeczywistosc (grupowany wykres slupkowy)

- Porownanie obok siebie limitow budzetowych i rzeczywistych wydatkow
- Pokazuje **W normie** lub **Przekroczony** dla kazdej kategorii
- Pojawia sie tylko, jezeli masz aktywne budzety

### Wydatki wg dnia tygodnia (wykres tygodniowy)

- Analiza wzorcow pokazujaca, w ktore dni wydajesz najwiecej
- Wnioski: "Najwiecej wydajesz w soboty"

### Wedlug sprzedawcow

- Glowni sprzedawcy, u ktorych wydawales w wybranym okresie
- Pokazuje do 8 pojedynczych sprzedawcow; reszta jest grupowana jako "Inne"
- Pojawia sie tylko gdy co najmniej jeden wydatek ma przypisanego sprzedawce
- Nazwy różniące się tylko wielkością liter lub spacjami (*Lidl*, *LIDL*) liczą się jako jeden sprzedawca; pod każdą nazwą widać liczbę zakupów i średnią kwotę zakupu

Jeśli ten sam sklep pojawia się pod kilkoma nazwami, otwórz **Ustawienia → Sprzedawcy**, aby je uporządkować: kliknij **Wybierz**, zaznacz warianty i **Scal** je w jedną nazwę. Aplikacja sugeruje też prawdopodobne grupy (na przykład kilka wpisów *Biedronka*), które możesz scalić jednym dotknięciem — dzięki temu będą liczone jako jeden sprzedawca na tych wykresach.

### Według członków

- Kto zapisał jaką część wydatków w wybranym okresie.
- Pojawia się tylko na kontach wspólnych, gdzie co najmniej dwóch członków ma wydatki.

### Wedlug tagow / Wedlug projektow

- **Podzial tagow** — wydatki pogrupowane wedlug Twoich niestandardowych tagow
- **Porownanie projektow** — wydatki pogrupowane wedlug projektow
- Pomaga sledzic wydatki tematyczne (np. wszystkie wydatki #kawa lub koszty projektu "Wakacje")

## Drilldown (zaglebienie)

Dotknij dowolny element wykresu, aby zbadac glebiej:

1. Widok **Rok** — dotknij slupek miesiaca, aby przyblizye ten miesiac
2. Widok **Miesiac** — dotknij tydzien, aby przyblizye ten tydzien
3. Widok **Tydzien** — dotknij dzien, aby zobaczyc transakcje dzienne
4. Widok **Dzien** — zobacz poszczegolne transakcje

Uzyj przycisku **Wroc**, aby nawigowac w gore przez poziomy.

## Szybki przeglad

Ponizej wykresow znajdziesz tekstowe szybkie wnioski:

- **Glowna kategoria** — Twoja najwyzsza kategoria wydatkow w tym okresie
- **Dzien najwiekszych wydatkow** — dzien z najwyzszymi wydatkami
- **Dzienna wskazowka budzetowa** — zalecane dzienne wydatki, aby utrzymac sie w budzecie
- **Oszczednosci z paragonow** — laczna kwota zaoszczedzona na rabatach. Stuknij, aby zobaczyc, ktore sklepy dawaly Ci najwieksze rabaty i z jakich paragonow one pochodza.
- **Zaplacona kaucja** — laczna kwota kaucji za opakowania zwrotne z zeskanowanych paragonow. Stuknij, aby zobaczyc taki sam podzial wedlug sklepu/paragonu. To kwota zaplacona przy kasie, a nie zwrot — zwrocone butelki i puszki nie sa sledzone.

Obie pozycje pojawiaja sie tylko wtedy, gdy w danym okresie zarejestrowano rabat lub kaucje, i tylko gdy Twoje konto nie jest w pelni zaszyfrowane (w przeciwnym razie aplikacja nie moze odczytac kwot, aby je rozbic na szczegoly).

## Najczesciej kupowane

Tabela pokazujaca najczesciej kupowane pozycje z paragonow:
- Artykul
- Lacznie wydano
- Liczba zakupow

## Eksport

Dotknij **Eksportuj raport**, aby otworzyc ekran Eksport i raporty, gdzie mozesz generowac raporty PDF, Excel lub CSV, przegladac podsumowania miesieczne i zarzadzac kopiami zapasowymi danych. Zobacz [Eksport i raporty](./16-export-reports.md) po wiecej szczególów.

## Koszty dzieci

Sprawdź, ile kosztuje Cię każde dziecko, bez zgadywania.

- **Dodawanie dzieci:** Ustawienia > Dane referencyjne > Dzieci. Zapisujemy tylko imię i kolor. Zamiast usuwać, zarchiwizuj dziecko; jego wydatki pozostają przypisane.
- **Cały wydatek:** przy nowym lub istniejącym wydatku wybierz jedno lub kilkoro dzieci. Przy kilkorgu kwota dzieli się po równo, chyba że zmienisz udziały. Wydatek ma przypisanie całości albo pozycji paragonu, nie oba naraz; aplikacja zapyta przed zmianą.
- **Pozycje paragonu:** po zeskanowaniu paragonu przypisz pojedyncze pozycje (pieluchy, przybory szkolne) do dziecka. Aplikacja zapamięta wybór i zaproponuje go następnym razem. Propozycja nigdy nie jest stosowana bez Ciebie. „Wyodrębnij pozycje” zachowuje przypisanie produktów, które nadal są na paragonie, i informuje, ilu nie udało się przenieść.
- **Zbiorczo:** zaznacz kilka wydatków i wybierz Przypisz do dziecka. Wydatki z przypisaniem pozycji są pomijane, a liczba pominiętych jest pokazana.
- **Sumy:** ekran dziecka (i karta w zakładce Analityka) pokazuje ten miesiąc, ten rok i podział na kategorie w walucie wyświetlania. Suma ze znakiem ≈ zawiera przybliżenie, bo brakowało kursu; takie kwoty są pomijane, nie zgadywane. Wydatki planowane i należności z podziału rachunku nie są liczone.
- **800+ i pokrycie:** gdy przychód wygląda na świadczenie 800+ (np. „800+” lub „rodzina 800” w opisie), aplikacja proponuje oznaczyć go dla dziecka. Pokrycie to otrzymane świadczenie podzielone przez koszt dziecka w tym samym okresie.
- **Karta do udostępnienia:** obrazek z sumami dziecka. Imię jest domyślnie ukryte; można je włączyć.
- **Zestawienie PDF (Pro, edytorzy):** „zestawienie” kosztów dziecka za okres do 24 miesięcy: sumy, podział miesięczny i na kategorie, lista wydatków i paragony. Każda strona ma stopkę, że zestawienie sporządzono w aplikacji na podstawie danych wprowadzonych przez użytkownika, oraz czas „stan danych na”. To podsumowanie Twoich własnych zapisów, nie dokument prawny i nie jest poświadczone. Zawiera tylko to, co dotarło na serwer, więc aplikacja najpierw synchronizuje i prosi o chwilę czekania, jeśli coś jeszcze oczekuje. Niedostępne na kontach z szyfrowaniem end-to-end.
- **Rodzice w separacji:** trzymajcie dzieci na koncie osobistym, aby drugi rodzic nie widział pozostałych Twoich wydatków. Konto wspólne pokazuje wszystko wszystkim członkom.

## FAQ

- **P: Dlaczego nie widze zadnych wykresow?**
  **O:** Wykresy pojawiaja sie po wprowadzeniu danych o wydatkach. Najpierw dodaj kilka wydatkow, a nastepnie sprawdz Analityke.

- **P: Jak generowane sa wnioski AI?**
  **O:** Wnioski sa generowane przez analize Twoich wzorcow wydatkow, porownanie z danymi historycznymi i identyfikacje anomalii. Wymaga to subskrypcji Pro lub Business.

---

*Zobacz takze: [Budzety](./05-budgets.md) | [Historia wydatkow](./08-spending-story.md) | [Eksport i raporty](./16-export-reports.md)*
