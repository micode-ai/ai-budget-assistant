# Portfel inwestycyjny

Sledz swoj portfel inwestycyjny z aktualnymi cenami rynkowymi. Monitoruj akcje, ETF, kryptowaluty, obligacje i towary w jednym miejscu.

## Przeglad

Funkcja portfela inwestycyjnego pozwala:

- Sledzic pozycje roznych typow aktywow
- Widziec ceny w czasie rzeczywistym i wartosc portfela
- Analizowac zyski za rozne okresy
- Porownywac swoje wyniki z benchmarkami rynkowymi (SPY, QQQ, DIA, IWM)
- Rejestrowac transakcje kupna/sprzedazy z prowizjami

## Tworzenie konta inwestycyjnego

Do sledzenia inwestycji wymagane jest specjalne konto typu **Inwestycje**:

1. Przejdz do zakladki **Konta**
2. Kliknij **Utworz konto**
3. Wybierz typ **Inwestycje**
4. Nadaj nazwe portfelowi (np. "Glowny portfel", "Emerytalny")
5. Kliknij **Utworz**

## Dodawanie pozycji

### Wyszukiwanie aktywow

1. Otworz konto inwestycyjne
2. Kliknij **Dodaj pozycje**
3. Szukaj po symbolu (np. "AAPL") lub nazwie firmy (np. "Apple")
4. Wybierz wlasciwy aktyw z wynikow wyszukiwania
5. Dodaj notatki (opcjonalnie)
6. Kliknij **Zapisz**

### Obslugiwane typy aktywow

| Typ | Przyklady |
|-----|-----------|
| Akcje | AAPL, MSFT, GOOGL |
| ETF | SPY, QQQ, VTI |
| Kryptowaluty | BTC, ETH, SOL |
| Obligacje | Rzadowe i korporacyjne |
| Towary | Zloto, srebro, ropa |

## Rejestrowanie transakcji

Po dodaniu pozycji rejestruj transakcje kupna/sprzedazy:

1. Otworz szczegoly pozycji
2. Kliknij **Dodaj transakcje**
3. Wybierz typ: **Kupno** lub **Sprzedaz**
4. Wprowadz:
   - **Ilosc** — liczbe akcji/jednostek
   - **Cena za jednostke** — cene kupna/sprzedazy
   - **Prowizja** — oplata brokerska (opcjonalnie)
   - **Data** — data transakcji
   - **Notatki** — dodatkowe informacje (opcjonalnie)
5. Kliknij **Zapisz**

Aplikacja automatycznie oblicza:
- **Srednia cena zakupu** — srednia wazona cena nabycia
- **Suma inwestycji** — suma wszystkich zakupow minus sprzedaze
- **Biezacy zysk/strata** — na podstawie aktualnej ceny

## Podsumowanie portfela

Glowny ekran inwestycji pokazuje:

- **Calkowita wartosc** — biezaca wartosc rynkowa wszystkich pozycji
- **Calkowity zysk/strata** — kwota zysku lub straty
- **Calkowita stopa zwrotu %** — procentowy zwrot
- **Zmiana dzisiaj** — dzisiejsza zmiana wartosci

Dla kazdej pozycji wyswietlane jest:
- Aktualna cena i dzienna zmiana
- Twoja ilosc i srednia cena
- Indywidualny zysk/strata i udzial w portfelu

## Analityka

Dostep do szczegolowej analityki portfela:

1. Kliknij przycisk **Analityka**
2. Wybierz okres: 1T, 1M, 3M, 1R lub Caly czas

### Wykres wydajnosci

Pokazuje wartosc portfela w czasie w porownaniu z zainwestowana kwota. Obszar miedzy liniami reprezentuje Twoj zysk lub strate.

### Rozklad wedlug typow

Wizualizuje rozklad portfela wedlug typow aktywow (akcje, ETF, krypto itp.).

### Liderzy wzrostu i spadku

Lista najlepszych i najgorszych pozycji wedlug procentowej stopy zwrotu.

### Porownanie z benchmarkiem (Pro+)

Porownaj stope zwrotu portfela z indeksami rynkowymi:

| Benchmark | Opis |
|-----------|------|
| SPY | Indeks S&P 500 |
| QQQ | Indeks Nasdaq 100 |
| DIA | Indeks Dow Jones Industrial |
| IWM | Russell 2000 (mala kapitalizacja) |

**Rozumienie porownania:**
- **Stopa zwrotu portfela** — Twoj faktyczny zysk/strata w procentach
- **Stopa zwrotu benchmarku** — wydajnosc indeksu w tym samym okresie
- **Roznica** — o ile przewyzszyles lub pozostales w tyle za rynkiem

## Rozumienie obliczen

Kliknij dowolna karte analityki, aby zobaczyc wyjasnienie formuly:

### Stopa zwrotu
```
Stopa zwrotu % = ((Wartosc koncowa - Wartosc poczatkowa) / Wartosc poczatkowa) x 100
```

### Zysk/strata (Z/S)
```
Z/S = Aktualna wartosc - Suma inwestycji
Z/S % = (Z/S / Suma inwestycji) x 100
```

### Rozklad
```
Udzial % = (Wartosc aktywa / Calkowita wartosc portfela) x 100
```

## Aktualizacja cen

- Ceny aktualizuja sie automatycznie co 15 minut
- Kliknij przycisk **Odswiez** dla natychmiastowej aktualizacji
- Historyczne ceny sa zapisywane w pamieci podrecznej dla oszczednosci transferu

## Wskazowki

1. **Dywersyfikuj rejestrowanie** — dodaj wszystkie inwestycje dla pelnego obrazu
2. **Uwzgledniaj prowizje** — dolaczaj oplaty brokerskie dla dokladnego obliczenia zysku
3. **Uzywaj benchmarkow** — porownuj z indeksami dla oceny wynikow
4. **Regularnie sprawdzaj** — przegladaj analityke co tydzien dla wykrywania trendow

## Ograniczenia

- Dane cenowe pochodza z Twelve Data API
- Niektore egzotyczne instrumenty moga byc niedostepne
- Dane historyczne ograniczone do dni tradingowych
- Ceny w czasie rzeczywistym moga miec opoznienie do 15 minut

---

[Wstecz: Osiagniecia i Grywalizacja](./13-gamification.md) | [Do spisu tresci](./00-index.md)
