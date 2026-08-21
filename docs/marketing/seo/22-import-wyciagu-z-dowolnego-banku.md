---
title: "Co zrobić, gdy twojego banku nie ma na liście"
meta_description: "Twojego banku nie ma na liście obsługiwanych banków? Sprawdź, jak AI rozpoznaje kolumny w pliku CSV albo czyta wyciąg PDF, żebyś mógł zaimportować dowolny bank."
target_keyword: "import wyciągu z dowolnego banku"
slug: "import-wyciagu-z-dowolnego-banku"
pair: "ai-bank-import"
lang: "pl"
date: "2026-08-20"
---

# Co zrobić, gdy twojego banku nie ma na liście

Wgrywasz plik z wyciągiem, a aplikacja pyta o mapowanie kolumn albo, co gorsza, pokazuje pustą listę transakcji. Twój bank po prostu nie jest jednym z tych, które aplikacja rozpoznaje od razu. To częsty moment zawodu, zwłaszcza gdy właśnie zdecydowałeś się nadrobić kilka miesięcy wydatków jednym importem, a plik z mniej popularnego banku, kantoru albo lokalnej spółdzielczej kasy nie chce się ułożyć w porządne kolumny.

Dobra wiadomość jest taka, że "nie ma na liście" nie musi znaczyć "nie da się zaimportować". W tym artykule pokażę, co konkretnie dzieje się w tle, gdy AI Budget Assistant nie rozpoznaje formatu pliku, i dlaczego mechanizm, który wtedy się włącza, jest bezpieczniejszy, niż mogłoby się wydawać na pierwsze wejrzenie.

## Dlaczego żadna lista banków nigdy nie jest kompletna

Każda aplikacja do budżetu, która obsługuje import, musi na starcie zdecydować, które banki wspiera bezpośrednio. AI Budget Assistant rozpoznaje automatycznie m.in. mBank, PKO, Revolut, ING, Millennium, Pekao, a także Wise oraz wyciągi PDF z Erste i Alior. To pokrywa większość popularnych rachunków w Polsce, ale rachunki bankowe to nie tylko wielka piątka. Są mniejsze banki, konta firmowe z niestandardowym eksportem, konta zagraniczne i eksporty z innych aplikacji finansowych, które ktoś próbuje zaimportować przy przeprowadzce z jednego narzędzia do drugiego.

Utrzymywanie osobnego parsera dla każdego z tych formatów na zawsze byłoby niewykonalne, a każdy nowy format, który się pojawia, i tak musiałby przez chwilę być "nieobsługiwany", zanim ktokolwiek go zauważy i dopisze regułę. Dlatego zamiast czekać, aż lista dorośnie do twojego banku, aplikacja ma mechanizm, który próbuje sam zrozumieć strukturę pliku, którego wcześniej nie widziała.

## Co się dzieje, gdy plik nie jest rozpoznany

Kiedy wgrywasz plik CSV albo arkusz XLSX, a żaden z wbudowanych parserów nie rozpoznaje jego układu, do gry wchodzi model AI. Jego zadanie jest wąskie i konkretne: nie odczytuje kwot ani dat samodzielnie, tylko wskazuje, **która kolumna jest którą** - która zawiera datę operacji, która kwotę, która opis albo nazwę sprzedawcy. Te nazwy kolumn są potem sprawdzane co do słowa z nagłówkami rzeczywiście obecnymi w twoim pliku. Jeśli model "wymyśliłby" kolumnę, która nie istnieje w pliku, cała odpowiedź jest odrzucana, a nie po cichu przyjmowana. Dopiero po tej weryfikacji te same, deterministyczne reguły, które obsługują ręczne mapowanie kolumn, faktycznie odczytują liczby i daty z pliku.

Dla wyciągów PDF, które są funkcją planu Pro, mechanizm działa inaczej, bo z PDF-u nie da się po prostu wyciągnąć nazw kolumn - trzeba wyodrębnić same wiersze transakcji z wyekstrahowanego tekstu strony. To ten sam rodzaj zadania, jaki wcześniej wykonywały ręcznie pisane parsery dla Erste czy Alior, tylko zamiast osobnego kodu na każdy bank, model radzi sobie z układem, którego jeszcze nikt nie opisał.

## Czego ten mechanizm nigdy nie robi

To jest ważne rozgraniczenie, bo łatwo pomyśleć, że "AI importuje wyciąg" oznacza, że model po prostu zgaduje liczby. Nie jest tak. Po stronie CSV i XLSX model nigdy nie zwraca kwoty ani daty - zwraca tylko nazwy kolumn, a te są zawsze zderzane z prawdziwymi nagłówkami z twojego pliku. Same liczby i daty odczytuje ten sam, przewidywalny kod, który działa przy ręcznym mapowaniu kolumn od lat. To sprawia, że mechanizm jest pomocnikiem przy rozpoznawaniu struktury, a nie osobą, która "na oko" wpisuje twoje wydatki.

To wciąż nie jest gwarancja stuprocentowej trafności przy pierwszym podejściu - żaden mechanizm rozpoznawania formatu nie jest. Dlatego, zanim cokolwiek trafi do twojego budżetu, dostajesz podgląd do sprawdzenia, o czym więcej poniżej.

## Co widzisz i na co się zgadzasz, zanim coś wyjedzie z telefonu

Zanim treść pliku trafi do modelu AI, aplikacja pyta o zgodę, jeden raz na konto, i pokazuje **dokładnie**, co zostanie wysłane. Dla pliku CSV albo XLSX to wiersz nagłówka i do dziesięciu przykładowych wierszy danych - nie cały plik i nie cała historia transakcji. Dla wyciągu PDF to pierwsze dwadzieścia wyodrębnionych linii tekstu. Widzisz to na ekranie zgody, zanim cokolwiek się wydarzy, więc decyzja jest świadoma, a nie domyślna.

Jeśli twoje konto ma pełne szyfrowanie end-to-end (tak zwany tryb pełnej prywatności), ten mechanizm w ogóle się nie uruchamia. Dane, których aplikacja sama nie może odszyfrować, nie mogą też trafić do żadnego modelu AI, więc dla takich kont dostępne jest tylko ręczne mapowanie kolumn - bezpieczniejsze, choć wymagające jednego kliknięcia więcej.

## Sprawdzasz i poprawiasz, zanim cokolwiek się zapisze

Po tym, jak model zaproponuje mapowanie, nie widzisz surowego wyniku bez kontekstu. Widzisz rząd edytowalnych "chipów" pokazujących, co model rozpoznał, na przykład "Data → Data operacji" albo "Kwota → Suma transakcji". Jeśli któryś z nich jest błędny, opcja "Źle? Popraw" otwiera ten sam ręczny mapper kolumn, tyle że wypełniony już propozycją modelu, więc poprawiasz jedną kolumnę, a nie zaczynasz od zera.

To jest ten sam etap podglądu, który towarzyszy każdemu importowi w AI Budget Assistant, niezależnie od tego, czy bank został rozpoznany od razu, czy dopiero z pomocą AI: pełna lista transakcji do przejrzenia, zanim cokolwiek trafi do budżetu, z kategoriami podpowiedzianymi automatycznie na podstawie sprzedawcy.

## Drugi raz jest już szybszy

Kiedy mapowanie kolumn dla konkretnego formatu okaże się trafne, jego układ (same nazwy kolumn i sposób zapisu daty, bez żadnych twoich danych osobowych czy transakcji) trafia do globalnego słownika formatów. Następny użytkownik, który wgra wyciąg z tego samego banku, w ogóle nie potrzebuje wywołania AI - format jest już rozpoznany od razu, tak samo jak mBank czy PKO. Jesteś więc, w pewnym sensie, pierwszym użytkownikiem, który "odblokowuje" swój format dla wszystkich kolejnych.

## Jak to wypróbować

Jeśli masz gdzieś plik z banku, który wcześniej odpuściłeś przy imporcie, bo aplikacja go nie rozpoznała, warto spróbować jeszcze raz. Wgraj plik CSV, XLSX albo PDF w [AI Budget Assistant](https://ai-budget.pl), a jeśli żaden wbudowany parser go nie rozpozna, zobaczysz ekran zgody opisany wyżej, zamiast pustej listy transakcji. Po zaakceptowaniu dostajesz podgląd z propozycją mapowania do sprawdzenia, tak jak przy każdym innym imporcie.

Ogólny przebieg samego importu, od pobrania pliku z banku po unikanie duplikatów przy ponownym wgrywaniu, opisuje [poradnik o imporcie wyciągu bankowego](/blog/pl/jak-zaimportowac-wyciag-bankowy/). Jeśli wolisz w ogóle nie zajmować się plikami i chcesz, żeby aplikacja sama zapisywała wydatki z kartowych powiadomień banku, sprawdź, jak działa [automatyczne zapisywanie wydatków](/blog/pl/automatyczne-zapisywanie-wydatkow/). Aplikacja działa bezpłatnie w przeglądarce na [ai-budget.pl](https://ai-budget.pl), bez podawania karty, a na Androida jest dostępna w [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## FAQ: import wyciągu z banku, którego nie ma na liście

**Co się dzieje, jeśli mojego banku nie obsługuje aplikacja bezpośrednio?**

Jeśli wgrywasz plik CSV lub XLSX, a żaden wbudowany parser nie rozpoznaje jego układu, AI Budget Assistant próbuje samodzielnie rozpoznać, która kolumna jest datą, która kwotą, a która opisem, i pokazuje ci wynik do sprawdzenia i poprawienia. Dla wyciągów PDF (funkcja Pro) mechanizm wyodrębnia same wiersze transakcji z tekstu dokumentu. W obu przypadkach zanim cokolwiek się zapisze, widzisz pełny podgląd.

**Czy AI może się pomylić i wpisać błędną kwotę?**

Po stronie plików CSV i XLSX model AI nigdy nie odczytuje samych kwot i dat - wskazuje tylko, która kolumna jest którą, a te nazwy są sprawdzane z rzeczywistymi nagłówkami w twoim pliku, więc wymyślona kolumna jest odrzucana. Same liczby czyta ten sam mechanizm co przy ręcznym mapowaniu. Niezależnie od tego, dostajesz podgląd wszystkich transakcji przed zapisem, żeby sprawdzić i poprawić to, co wygląda nie tak.

**Czy treść mojego wyciągu jest wysyłana gdzieś na zewnątrz?**

Zanim jakikolwiek fragment pliku trafi do modelu AI, widzisz ekran zgody, jednorazowy dla całego konta, który pokazuje dokładnie, co zostanie wysłane: wiersz nagłówka i do dziesięciu przykładowych wierszy dla pliku CSV lub XLSX, albo pierwsze dwadzieścia linii tekstu dla wyciągu PDF. Konta z pełnym szyfrowaniem end-to-end nie korzystają z tego mechanizmu wcale, bo aplikacja nie ma dostępu do ich danych, żeby mogła je wysłać do modelu.

**Czy import z pomocą AI działa tak samo dobrze jak dla mBank czy PKO?**

To zależy od formatu pliku, ale mechanizm jest pomyślany tak, żeby rozpoznanie było coraz lepsze z czasem: gdy mapowanie kolumn dla nowego banku okaże się trafne, sam układ pliku (bez twoich danych) trafia do globalnego słownika, więc kolejny import tego samego formatu banku w ogóle nie wymaga już wywołania AI. Zawsze warto jednak przejrzeć podgląd, zanim potwierdzisz import, tak jak przy każdym innym banku.

---

*Powiązane artykuły: [Jak zaimportować wyciąg bankowy do budżetu](/blog/pl/jak-zaimportowac-wyciag-bankowy/) | [Automatyczne zapisywanie wydatków bez wysiłku](/blog/pl/automatyczne-zapisywanie-wydatkow/)*
