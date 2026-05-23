# Import transakcji z banku

> Importuj transakcje bezpośrednio z eksportów CSV głównych polskich banków lub dowolnego banku za pomocą uniwersalnego mapera kolumn.

## Obsługiwane banki

Możesz importować transakcje bezpośrednio z eksportów CSV głównych polskich banków: **mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA**. W przypadku każdego innego banku uniwersalny maper kolumn pozwala ręcznie opisać format pliku.

## Jak importować

1. Przejdź do **Ustawienia → Import transakcji**
2. Wybierz swój bank z listy (lub „Inny (własny CSV)" dla nieobsługiwanych banków)
3. Wybierz plik CSV wyeksportowany z bankowości internetowej
4. Aplikacja wyświetla podgląd, gdzie każdy wiersz jest oznaczony jako wydatek, przychód lub wymiana walut
5. Odznacz wiersze, których nie chcesz, a następnie dotknij **Importuj**

Aplikacja zapamiętuje, które wiersze zostały już zaimportowane na podstawie daty, kwoty i opisu — przesłanie tego samego CSV dwa razy nie spowoduje duplikatów.

## Gdzie znaleźć CSV w swoim banku

- **mBank**: Bankowość internetowa → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Lista operacji → Pobierz → CSV
- **ING Bank Śląski**: Moje ING → Historia → Eksportuj → CSV
- **Bank Millennium**: Web → Historia rachunku → Eksport → CSV
- **Pekao SA**: Pekao24 → Historia → Eksport → CSV

## Co zostaje zaimportowane

Każdy wiersz staje się Wydatkiem, Przychodem lub Wymianą walut (gdy aplikacja wykryje sparowaną transakcję FX z tą samą datą w różnych walutach). Kategorie są sugerowane automatycznie dla popularnych sprzedawców (Biedronka, Żabka, Orlen, Lidl itp.) — możesz je później zmienić.

## „Inny" — uniwersalny maper CSV

Jeśli twojego banku nie ma na liście, wybierz „Inny (własny CSV)". Aplikacja wyświetla podgląd pliku i prosi o wskazanie, która kolumna zawiera datę, kwotę i opis. Możesz zapisać to mapowanie z nazwą — kolejny CSV z tym samym układem kolumn zostanie zaimportowany automatycznie.

## Kodowanie

Aplikacja automatycznie wykrywa UTF-8 i Windows-1250 (najpopularniejsze kodowanie polskich banków). Jeśli podgląd pokazuje zniekształcone polskie znaki, ręcznie wybierz kodowanie w maperze.

---

*Zobacz też: [Import z Wise](./26-wise-import.md) | [Wydatki i przychody](./03-expenses-and-income.md) | [Ustawienia](./11-settings.md)*
