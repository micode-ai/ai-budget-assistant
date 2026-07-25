# Sprawdzanie cen na paragonie — czy to drożej niż zwykle?

> Zaraz po zeskanowaniu paragonu każda pozycja jest porównywana z medianą ceny, którą wcześniej płaciłeś/płaciłaś za ten sam produkt w tym samym sklepie — żebyś mógł/mogła zauważyć niezadziałającą zniżkę, gdy jeszcze stoisz przy kasie.

## Czym to jest

Każdy zeskanowany paragon jest po cichu porównywany z Twoją własną historią zakupów: medianą ceny, którą płaciłeś/płaciłaś za dokładnie ten produkt, w dokładnie tym sklepie, w ciągu ostatnich 12 tygodni. Gdy pozycja kosztuje wyraźnie więcej, od razu to widać — gdy jeszcze możesz zapytać przy kasie albo zajrzeć do siatki, a nie ukryte w raporcie, którego nigdy nie otworzysz.

To zwykła arytmetyka na Twoich własnych wcześniejszych paragonach. Nie korzysta z AI i nie ma nic do włączenia ani skonfigurowania.

## Czego ta funkcja nigdy nie powie

Nigdy nie twierdzi, że zostałeś/aś oszukany/a, obciążony/a zbyt wysoką kwotą czy że zniżka została celowo pominięta — paragon niczego takiego nie dowodzi. Jeśli nie ma na nim wydrukowanej linii ze zniżką, nic nie pokazuje, że w ogóle miała się pojawić, więc aplikacja nikogo nie oskarża. Sformułowanie jest zawsze to samo, uczciwe: **to kosztuje więcej niż zwykle — warto sprawdzić paragon**. Zniżka, która po cichu się nie naliczyła, to najczęstsza realna przyczyna, a takie sformułowanie ją ujawnia, nie wskazując palcem na sklep.

To, co pokazuje aplikacja, to to, co **znalazła** powyżej Twoich zwykłych cen — nigdy to, co **zaoszczędziłeś/aś**, bo nie da się wiedzieć, czy faktycznie coś z tym zrobiłeś/aś.

## Gdzie to zobaczysz

- **Zaraz po zeskanowaniu paragonu** — karta w stylu „2 produkty kosztują więcej niż zwykle" z podpisem „Około 6,20 zł więcej niż zwykle płacisz tutaj — warto sprawdzić paragon". Rozwiń ją, żeby zobaczyć każdy oznaczony produkt: ile zwykle płacisz, ile zapłaciłeś/aś tym razem, i różnicę. Nigdy nie blokuje zapisania paragonu i nigdy sama nie zmienia żadnej kwoty — to tylko informacja, nie edycja.
- **W botach czatu** (Telegram, WhatsApp, Slack) — zeskanowanie paragonu przez bota dodaje jedną dodatkową linijkę do wiadomości potwierdzającej, jeśli coś znaleziono, bo skany przez boty przechodzą dokładnie to samo sprawdzenie co w aplikacji.
- **Na karcie Analityka** — linijka „Znaleziono X powyżej Twoich zwykłych cen w tym roku", pokazywana tylko wtedy, gdy rzeczywiście coś się znalazło.
- **W Twoich alertach** — każdy zeskanowany paragon ze znaleziskiem może też pojawić się jako jeden alert w dzwonku, żebyś nie musiał/a o tym pamiętać.

## Ile zaufania dać znalezisku

Produkt potrzebuje co najmniej **dwóch** wcześniejszych zakupów w tym samym sklepie, zanim sprawdzenie w ogóle coś o nim powie — więc na nowym koncie milczy przez jakiś czas, a im więcej skanujesz, tym trafniejsze staje się porównanie. Znalezisko oparte dokładnie na dwóch wcześniejszych zakupach jest oznaczone jako „**na podstawie tylko dwóch wcześniejszych zakupów**", żebyś wiedział/a, ile mu ufać; trzy lub więcej wcześniejszych zakupów to już mocniejszy sygnał.

## Co jest porównywane — a co celowo nie

- Tylko **ten sam produkt w tym samym sklepie**. Cena w jednym sklepie nigdy nie jest porównywana z tym samym produktem kupionym gdzie indziej.
- Tylko **ta sama waluta** — do tego porównania nic nigdy nie jest przeliczane.
- Różne rozmiary opakowań liczą się jako różne produkty: skaner zachowuje rozmiar w nazwie produktu (np. „Mleko Łaciate 3,2% 1L"), więc butelka 1 l i 0,5 l są śledzone osobno — dokładnie tak, jak powinno być.
- Ogromny skok ceny jest celowo pomijany, a nie zgłaszany — o wiele bardziej prawdopodobne, że to inny produkt (albo błędnie odczytana linijka), niż że to prawdziwa zmiana ceny.

## Roczne podsumowanie

Jeśli kiedykolwiek coś znaleziono w więcej niż jednej walucie, karta Analityka pokazuje tylko jedną sumę — Twoją własną walutę, jeśli coś się w niej znalazło, w przeciwnym razie największą pojedynczą kwotę. Kwoty nigdy nie są sumowane między walutami, bo to oznaczałoby przeliczanie, którego ta funkcja celowo nigdy nie robi.

## Warto wiedzieć

- Działa automatycznie przy każdym zeskanowanym paragonie — z aparatu, z galerii, z PDF-u, a także przy skanach przez Telegram, WhatsApp lub Slack.
- Znalezisko nigdy nie blokuje zapisania paragonu i nigdy samo nie zmienia żadnej kwoty.
- Ceny i różnice są pokazywane w walucie samego paragonu.
