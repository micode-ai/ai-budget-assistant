# Połączone aplikacje i deweloperzy

> Pozwól innej aplikacji, z której korzystasz — na przykład programowi księgowemu — pracować z Twoimi wydatkami w AI Budget, sprawdź dokładnie, co może robić, i odetnij jej dostęp jednym dotknięciem. Deweloperzy mogą budować takie aplikacje na API AI Budget.

## Co oznacza połączenie aplikacji

Niektóre produkty potrafią pracować z Twoimi danymi z AI Budget na własnych ekranach: aplikacja księgowa może pobierać Twoje wydatki i paragony albo dodawać wydatki za Ciebie. Żeby na to pozwolić, łączysz aplikację z **jednym** ze swoich kont w AI Budget.

Aplikacja nigdy nie widzi Twojego hasła. Gdy klikniesz w niej przycisk „Połącz z AI Budget”, przeniesie Cię na stronę AI Budget, gdzie logujesz się jak zwykle i widzisz:

- nazwę aplikacji, jej stronę i to, kto ją stworzył;
- **Zweryfikowana przez AI Budget** (aplikacja, którą sprawdziliśmy, na przykład nasza własna) albo **Niezweryfikowana przez AI Budget**;
- listę uprawnień, o które prosi aplikacja;
- **Konto do połączenia** — wybierasz, z którego konta aplikacja może korzystać.

Dotknij **Zezwól**, żeby połączyć, albo **Odmów**, żeby wrócić do aplikacji bez łączenia. Zezwalaj tylko aplikacjom, którym ufasz.

## Na co pozwala każde uprawnienie

- **Widzieć Twoje wydatki: kwoty, daty, kategorie, pozycje i tagi** — aplikacja może czytać wydatki połączonego konta, łącznie z pozycjami paragonu oraz późniejszymi zmianami i usunięciami.
- **Dodawać, zmieniać i usuwać wydatki** — aplikacja może zapisywać w tym koncie. Wydatki dodane przez nią mają na ekranie wydatku dopisek **Dodano przez** i nazwę aplikacji.
- **Pobierać zdjęcia Twoich paragonów** — aplikacja może pobrać zdjęcie lub PDF paragonu dołączonego do wydatku.
- **Widzieć Twoje kategorie wydatków** — aplikacja może czytać listę kategorii, żeby poprawnie przypisywać nowe wydatki.

Każda połączona aplikacja widzi też nazwę, typ i walutę konta oraz Twoje imię. Nigdy nie dostaje Twojego adresu e-mail i nie widzi Twoich pozostałych kont.

## Podgląd i odłączanie aplikacji

Otwórz **Ustawienia → Połączone aplikacje**. Przy każdej aplikacji widać konto, z którym jest połączona, kto i kiedy ją połączył, kiedy była ostatnio używana oraz jej uprawnienia.

Dotknij **Odłącz** i potwierdź. Aplikacja od razu traci dostęp do tego konta — jej następne zapytanie zostanie odrzucone. Wydatki, które już dodała, zostają na Twoim koncie. Żeby znów z niej korzystać, połącz ją ponownie z poziomu tej aplikacji.

Przy każdym nowym połączeniu wysyłamy e-mail do osoby, która je utworzyła. Jeśli taki dostaniesz i nie rozpoznajesz aplikacji, odłącz ją od razu.

Jeśli nie widzisz pozycji **Połączone aplikacje** w Ustawieniach, łączenie aplikacji nie jest jeszcze dostępne.

## Konta współdzielone

Aplikację z kontem może połączyć tylko jego **właściciel** albo **edytor**; osoba, która może konto tylko przeglądać, zobaczy je wyszarzone.

Aplikacja połączona z kontem współdzielonym widzi wydatki **wszystkich** jego członków, a nie tylko osoby, która ją połączyła. Dlatego wszyscy właściciele i edytorzy konta widzą w **Połączonych aplikacjach** każdą aplikację połączoną z tym kontem, razem z informacją, kto ją połączył — i każdy z nich może ją odłączyć. Gdy aplikację połączy edytor, e-mail dostają też właściciele konta.

Jeśli osoba, która połączyła aplikację, straci później prawo edycji albo opuści konto, aplikacja przestanie działać dla tego konta.

## Konta szyfrowane

- Konta z **pełnym szyfrowaniem** (zaszyfrowane są też kwoty) nie da się połączyć — aplikacja nie mogłaby w nim niczego odczytać.
- Konto z **szyfrowaniem tekstu** można połączyć **tylko do odczytu**: aplikacja widzi kwoty, daty i kategorie, ale opisy, notatki, sprzedawcy, nazwy pozycji, tagi i inne zaszyfrowane teksty pozostają ukryte, a dodawanie i zmienianie wydatków jest zablokowane.

Co obejmuje każdy poziom, opisaliśmy w [Szyfrowaniu end-to-end](./15-encryption.md).

## Dla deweloperów

Możesz zbudować własną aplikację na API AI Budget — za darmo. Otwórz **Ustawienia → Dla deweloperów** i dotknij **Utwórz aplikację**: podaj nazwę, stronę domową i adresy przekierowania (redirect URI), a potem wybierz **Aplikacja serwerowa** albo **Aplikacja mobilna lub przeglądarkowa**. **Client ID** dostajesz od razu; aplikacja serwerowa dostaje też client secret, który wyświetlamy **tylko raz** — skopiuj go natychmiast.

Pełna dokumentacja API i przewodnik krok po kroku (po angielsku, polsku i rosyjsku) są pod adresem [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), a także pod linkiem **Dokumentacja API** na ekranie dla deweloperów. Możesz zarejestrować do 10 aplikacji.
