---
title: "Jak zaimportować wyciąg bankowy do budżetu"
meta_description: "Jak zaimportować wyciąg bankowy do aplikacji budżetowej i nadrobić miesiące wydatków w kilka minut. Krok po kroku, bez duplikatów, dla polskich banków."
target_keyword: "jak zaimportować wyciąg bankowy"
slug: "jak-zaimportowac-wyciag-bankowy"
pair: "bank-import"
lang: "pl"
---

# Jak zaimportować wyciąg bankowy i nadrobić miesiące w kilka minut

Numerem jeden powodów, dla których budżety umierają, jest ręczne wpisywanie. Po dwóch tygodniach przepisywania każdej transakcji z ręki większość ludzi po prostu odpuszcza. Import wyciągu bankowego rozwiązuje to za jednym zamachem: zamiast wklepywać setki pozycji, wgrywasz jeden plik i nadrabiasz całe miesiące wydatków w kilka minut. W tym poradniku pokażę krok po kroku, jak to zrobić i jak uniknąć duplikatów.

To jedna z tych rzeczy, które brzmią technicznie, a w praktyce zajmują mniej czasu niż zrobienie jednych zakupów.

## Dlaczego import bije ręczne wpisywanie

Ręczne wpisywanie ma dwa problemy. Pierwszy to wysiłek: dodawanie każdej transakcji osobno jest nużące i łatwo o tym zapomnieć. Drugi to luki: pominiesz kilka dni, potem tydzień, i nagle twój budżet jest niekompletny, więc przestajesz mu ufać. A budżet, któremu nie ufasz, jest bezużyteczny.

Import załatwia oba naraz. Bank ma już zapisaną każdą twoją transakcję, co do grosza i co do dnia. Zamiast odtwarzać te dane ręcznie, po prostu je przenosisz. Dostajesz kompletną, dokładną historię bez wysiłku, a kompletność jest tym, co sprawia, że budżet zaczyna mówić prawdę.

Jest też dodatkowa korzyść: import wstecz. Możesz wgrać wyciąg sprzed trzech miesięcy i od razu zobaczyć realne wzorce wydatków, zamiast czekać miesiącami, aż ręcznie uzbierasz dość danych.

## Pobierz plik z banku

Najpierw potrzebujesz pliku wyciągu. Niemal każdy bank pozwala go wyeksportować z bankowości internetowej, zwykle w formacie CSV (arkusz danych) albo PDF.

Ścieżka różni się między bankami, ale schemat jest podobny. Zaloguj się do bankowości internetowej na komputerze, wejdź w historię operacji albo wyciągi danego konta, wybierz zakres dat i poszukaj opcji „Eksportuj”, „Pobierz” lub „Wyciąg”. Wybierz CSV, jeśli jest dostępny, bo to format danych, który importuje się najczystszej. Gdy bank daje tylko PDF, to też się nada przy obsługiwanych bankach.

Dobra rada: za pierwszym razem pobierz dłuższy zakres, na przykład trzy miesiące. Dzięki temu od razu nadrobisz historię, zamiast importować po jednym miesiącu.

## Import krok po kroku

Gdy masz plik, sam import jest prosty.

**Wgraj plik.** W aplikacji budżetowej wybierz import wyciągu i wskaż pobrany plik CSV lub PDF.

**Rozpoznanie banku lub mapowanie kolumn.** Dobra aplikacja sama rozpozna twój bank po układzie pliku i wie, która kolumna to data, która kwota, a która opis. Przy mniej typowych plikach możesz raz ręcznie przypisać kolumny, a aplikacja zapamięta to mapowanie na przyszłość.

**Sprawdź podgląd.** Zanim cokolwiek się zapisze, zobaczysz podgląd wszystkich transakcji: data, kwota, opis i podpowiedziana kategoria. To moment na rzut oka, czy wszystko się zgadza, oraz na poprawienie kategorii, które chcesz zmienić.

**Kategorie podpowiedziane automatycznie.** Aplikacja stara się sama przypisać kategorie na podstawie nazwy sklepu, więc nie zaczynasz od zera. Twoim zadaniem jest co najwyżej poprawić kilka pozycji, a nie kategoryzować wszystko ręcznie.

**Zatwierdź.** Gdy podgląd wygląda dobrze, potwierdzasz i transakcje trafiają do budżetu. Miesiące wydatków, gotowe w kilka minut.

## Jak uniknąć duplikatów przy ponownym imporcie

Największa obawa przy imporcie brzmi: a co, jeśli zaimportuję ten sam plik dwa razy i wszystko się zdubluje? To słuszna obawa, bo zakresy wyciągów lubią się nakładać. Pobierasz styczeń, potem luty, a one zachodzą na siebie kilkoma dniami.

Rozwiązaniem jest wykrywanie duplikatów. Solidna aplikacja rozpoznaje transakcje, które już ma, po dacie, kwocie i opisie, i automatycznie odznacza je w podglądzie, żeby nie wpadły drugi raz. Dzięki temu możesz importować zachodzące na siebie wyciągi bez obawy, że napompujesz wydatki, a budżet utrzymujesz na bieżąco, dorzucając co miesiąc świeży wyciąg.

## Jak działa import w AI Budget Assistant

AI Budget Assistant obsługuje import wyciągów z polskich banków, w tym mBank, PKO i Revolut, a także z Wise oraz wyciągi PDF z banków takich jak Erste czy Alior. Wgrywasz plik, a aplikacja rozpoznaje bank, mapuje kolumny i pokazuje podgląd z automatycznie podpowiedzianymi kategoriami, więc większość pracy jest już zrobiona, zanim cokolwiek zatwierdzisz.

Pod spodem dzieje się więcej. Aplikacja paruje powiązane operacje walutowe, więc przewalutowania nie liczą się podwójnie, i wykrywa duplikaty, dzięki czemu ponowny import nakładającego się wyciągu nigdy nie zdubluje transakcji. Po imporcie reguły sklepów uczą się z twoich poprawek, więc każdy kolejny import wymaga jeszcze mniej porządkowania.

AI Budget Assistant jest darmowy na start, działa w przeglądarce na [ai-budget.pl](https://ai-budget.pl) bez podawania karty, oraz na [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant) na Androida. Jeśli chcesz w kilka minut nadrobić ostatnie miesiące wydatków, wyciąg z banku możesz wgrać już teraz.

---

## FAQ: Import wyciągu bankowego

**Jaki format pliku jest potrzebny do importu wyciągu?**

Najlepszy jest CSV, czyli plik danych, który da się wyeksportować z większości bankowości internetowych, bo importuje się najczyściej. Niektóre banki udostępniają tylko PDF, a AI Budget Assistant obsługuje też wyciągi PDF z wybranych banków, jak Erste czy Alior. Jeśli masz wybór, sięgnij po CSV.

**Czy import utworzy zduplikowane transakcje?**

Nie, jeśli aplikacja wykrywa duplikaty. AI Budget Assistant rozpoznaje transakcje, które już ma, po dacie, kwocie i opisie, i automatycznie odznacza je w podglądzie. Dzięki temu możesz importować nakładające się na siebie wyciągi miesiąc po miesiącu bez ryzyka, że ta sama operacja policzy się dwa razy.

**Czy mogę zaimportować wyciągi z dowolnego banku?**

AI Budget Assistant obsługuje polskie banki, w tym mBank, PKO i Revolut, a także Wise oraz wyciągi PDF z banków takich jak Erste i Alior. Przy mniej typowych plikach CSV możesz raz ręcznie przypisać kolumny, a aplikacja zapamięta to mapowanie, więc kolejne importy z tego samego banku przebiegają automatycznie.

**Czy import wyciągu bankowego jest bezpieczny?**

Tak. Importujesz statyczny plik wyciągu, który sam pobierasz z banku, więc nie podajesz aplikacji loginu ani hasła do bankowości i nie dajesz jej dostępu do konta. Aplikacja czyta tylko historię transakcji z pliku, który jej przekazujesz, a ty zachowujesz pełną kontrolę nad tym, co i kiedy wgrywasz.

---

*Powiązane artykuły: [Kontrola wydatków w aplikacji](/blog/pl/kontrola-wydatkow-aplikacja/) | [Kategorie wydatków, które naprawdę działają](/blog/pl/kategorie-wydatkow/)*
