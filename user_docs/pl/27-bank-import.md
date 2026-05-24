# Import transakcji z banku

> Importuj transakcje z pliku CSV lub wyciągu PDF swojego banku albo z dowolnego banku za pomocą uniwersalnego mapera kolumn.

## Obsługiwane banki

- **mBank** — eksport CSV
- **PKO BP** — eksport CSV
- **Erste Bank** — wyciąg PDF
- **Alior Bank** — wyciąg PDF
- **Wise** — eksport CSV (zobacz [Import z Wise](./26-wise-import.md))
- **Other** — dowolny bank, przez uniwersalny maper kolumn (CSV)

Obsługa kolejnych banków jest sukcesywnie dodawana. Jeśli twojego banku nie ma jeszcze na liście, wybierz **Other** i samodzielnie zmapuj kolumny.

## Jak importować

1. Przejdź do **Ustawienia → Import transakcji**
2. Wybierz swój bank z listy (lub **Other (custom CSV)**, jeśli go nie ma)
3. Wybierz plik wyeksportowany z banku — **CSV** dla mBank/PKO, wyciąg **PDF** dla Erste/Alior
4. Aplikacja wyświetla podgląd, gdzie każdy wiersz jest oznaczony jako wydatek, przychód lub wymiana walut
5. Odznacz wiersze, których nie chcesz, a następnie dotknij **Importuj**

Aplikacja pomija wiersze, które już istnieją na Twoim koncie — niezależnie od tego, czy importowałeś je wcześniej, czy dodałeś ręcznie — dopasowując je po dacie, kwocie i walucie, dzięki czemu import nie tworzy duplikatów. Dopasowane wiersze są domyślnie odznaczone; zaznacz jeden ponownie, jeśli to naprawdę odrębna transakcja.

## Gdzie znaleźć plik w swoim banku

- **mBank**: Bankowość internetowa → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)

## Co zostaje zaimportowane

Każdy wiersz staje się Wydatkiem, Przychodem lub Wymianą walut (gdy aplikacja wykryje sparowaną transakcję FX z tą samą datą w różnych walutach). Kategorie są sugerowane automatycznie dla popularnych sprzedawców (Biedronka, Żabka, Orlen, Lidl, Rossmann i inni) — możesz je później zmienić.

## „Other" — uniwersalny maper CSV

Jeśli twojego banku nie ma na liście, wybierz **Other (custom CSV)**. Aplikacja wyświetli podgląd pliku i poprosi o wskazanie, która kolumna zawiera datę, kwotę i opis. Możesz zapisać to mapowanie z nazwą — kolejny CSV z tym samym układem kolumn zostanie zaimportowany automatycznie.

## Kodowanie

W przypadku plików CSV aplikacja automatycznie wykrywa UTF-8 i Windows-1250 (najpopularniejsze kodowanie polskich banków). Jeśli podgląd pokazuje zniekształcone polskie znaki, ręcznie wybierz kodowanie w maperze. Wyciągi PDF są odczytywane bezpośrednio — wybór kodowania nie jest potrzebny.

---

*Zobacz też: [Import z Wise](./26-wise-import.md) | [Wydatki i przychody](./03-expenses-and-income.md) | [Ustawienia](./11-settings.md)*
