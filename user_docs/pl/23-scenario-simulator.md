# Symulator scenariuszy

> Przesuń suwaki, aby dostosować kategorie wydatków i dochodów — i natychmiast zobaczyć, jak zmienią się oszczędności w ciągu 3, 6 lub 12 miesięcy.

## Przegląd

**Symulator scenariuszy** odpowiada na pytania „co by było, gdyby?" bez zmiany prawdziwych danych. Zmniejsz wydatki na jedzenie o 20%, dodaj dochód z dorywczej pracy na 1 000 zł — i od razu sprawdź, ile uda się zaoszczędzić przez 6 miesięcy.

Wszystkie obliczenia są lokalne. Żadne dane nie są wysyłane, historia transakcji pozostaje niezmieniona.

## Jak uzyskać dostęp

Otwórz zakładkę **Analityka** i dotknij banera **Symulator scenariuszy** u góry ekranu.

## Skąd pochodzą kwoty

Symulator używa **ostatnich 3 miesięcy** transakcji i oblicza miesięczną średnią dla każdej kategorii:

```
miesięczna średnia = suma kategorii za 3 miesiące ÷ 3
```

Wszystkie kwoty są przeliczane na walutę bazową według aktualnych kursów wymiany.

## Dostosowywanie wydatków

Każda kategoria wydatków jest wyświetlana z aktualną średnią miesięczną i suwakiem w zakresie od **−100%** do **+100%** z krokiem 5%.

- Przeciągnij **w lewo** (ujemnie), aby modelować cięcia wydatków — pasek staje się zielony
- Przeciągnij **w prawo** (dodatnio), aby modelować wzrost wydatków — pasek staje się czerwony
- Etykieta pod suwakiem pokazuje wynikową kwotę

## Dostosowywanie dochodów

Kategorie dochodów działają tak samo. W prawo = wzrost, w lewo = spadek.

### Dodawanie dodatkowego dochodu

Dotknij **Dodaj dodatkowy dochód** w sekcji dochodów, aby dodać nowe źródło (np. freelancing). Wpisz opis i miesięczną kwotę. Można dodać wiele pozycji.

## Wykres projekcji

Wykres pokazuje skumulowane oszczędności przez wybrany horyzont:

- **Szara linia** — bieżąca ścieżka (bez zmian)
- **Kolorowa linia** — ścieżka scenariusza (z Twoimi zmianami)

Użyj chipów **3 / 6 / 12 miesięcy** nad wykresem, aby zmienić horyzont prognozy.

## Karty podsumowania

Trzy karty pod wykresem pokazują łączne kwoty scenariusza dla 3, 6 i 12 miesięcy. Aktualny horyzont jest wyróżniony. Każda karta zawiera:

- Skumulowane oszczędności według scenariusza
- Skumulowane oszczędności według bieżącej ścieżki (do porównania)
- Różnica

## Pasek podsumowania (góra ekranu)

Karta u samej góry ekranu aktualizuje się w czasie rzeczywistym:

| Lewa strona | Prawa strona |
|---|---|
| Bieżące miesięczne oszczędności | Miesięczne oszczędności wg scenariusza |
| (bez zmian) | ↑ lub ↓ różnica |

## Resetowanie

Dotknij **Resetuj wszystko** na dole, aby przywrócić wszystkie suwaki i dodatkowe dochody do zera.

## FAQ

- **P: Czy suwaki zmieniają moje prawdziwe dane?**
  **O:** Nie. Symulator tylko odczytuje historię transakcji do obliczeń. Nic nie jest zapisywane ani zmieniane.

- **P: Dlaczego kwoty kategorii są niższe niż oczekiwałem?**
  **O:** Kwoty to średnia z 3 miesięcy. Jeśli w jednym miesiącu wydatki były wyjątkowo niskie, średnia będzie niższa.

- **P: Brakuje kategorii dochodu.**
  **O:** Pokazywane są tylko kategorie z co najmniej jedną transakcją w ostatnich 3 miesiącach.

---

*Zobacz też: [Analityka](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Cele oszczędnościowe](./18-savings-goals.md)*
