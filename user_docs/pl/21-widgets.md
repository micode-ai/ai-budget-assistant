# Widżety ekranu głównego

> Dodaj widżety Androida do ekranu głównego, aby natychmiast uzyskać dostęp do danych o wydatkach — lub rejestrować wydatki bez otwierania aplikacji.

## Czym są widżety?

Widżety to małe interaktywne panele na ekranie głównym Androida. AI Budget Assistant oferuje cztery widżety:

| Widżet | Rozmiar | Zawartość |
|--------|---------|-----------|
| **Budżet – Dziś** | Mały | Łączne wydatki dnia + zmiana względem wczoraj |
| **Budżet – Tydzień** | Średni | Wykres słupkowy ostatnich 7 dni |
| **Budżet – Przegląd** | Duży | Postęp budżetów + główne kategorie wydatków |
| **Budżet – Szybkie dodanie** | Kompaktowy pasek | Trzy przyciski skrótów |

> **Tylko Android.** System iOS nie obsługuje widżetów na ekranie głównym. Wszystkie funkcje są dostępne w aplikacji.

---

## Jak dodać widżet

1. **Przytrzymaj** puste miejsce na ekranie głównym
2. Stuknij **Widżety**
3. Przewiń do **AI Budget Assistant**
4. **Przytrzymaj** wybrany widżet i przeciągnij go na ekran
5. Puść, aby go umieścić

---

## Budżet – Dziś (Mały)

Szybki podgląd dnia:

- **Łączna kwota** wydatków dnia
- **Wskaźnik zmiany** względem wczoraj (zielony = mniej, czerwony = więcej)

**Rozmiar**: 110 × 40 dp. Stuknij widżet, aby otworzyć aplikację.

---

## Budżet – Tydzień (Średni)

Tygodniowy przegląd jednym spojrzeniem:

- **Wykres słupkowy** wydatków za każdy z ostatnich 7 dni
- **Łączna kwota dnia** pod wykresem

**Rozmiar**: 250 × 110 dp. Stuknij widżet, aby otworzyć aplikację.

---

## Budżet – Przegląd (Duży)

Twój panel finansowy na ekranie głównym:

- **Paski postępu** każdego aktywnego budżetu
- **Główne kategorie wydatków** z kwotami bieżącego okresu

**Rozmiar**: 250 × 180 dp. Stuknij widżet, aby otworzyć aplikację.

---

## Budżet – Szybkie dodanie

Zacznij rejestrować wydatek jednym stuknięciem — bez otwierania aplikacji.

```
┌──────────────────────────────────────────────┐
│  🎤 Głos  │  📷 Skanuj  │  ✏️ Ręcznie  │
└──────────────────────────────────────────────┘
```

| Przycisk | Akcja |
|---------|-------|
| 🎤 **Głos** | Otwiera ekran nagrywania głosu |
| 📷 **Skanuj** | Otwiera skaner paragonów |
| ✏️ **Ręcznie** | Otwiera formularz ręcznego wprowadzania |

**Rozmiar**: 250 × 60 dp. Brak odświeżania w tle — bez wpływu na baterię.

---

## Częstotliwość odświeżania

| Widżet | Interwał |
|--------|---------|
| Budżet – Dziś | Co 30 minut |
| Budżet – Tydzień | Co 30 minut |
| Budżet – Przegląd | Co 30 minut |
| Budżet – Szybkie dodanie | Statyczny |

---

## FAQ

**P: Dlaczego widżety nie pojawiają się w selektorze?**
O: Upewnij się, że aplikacja jest zainstalowana i zalogowałeś się co najmniej raz.

**P: Widżet pokazuje „Brak danych". Co zrobić?**
O: Otwórz aplikację i dodaj co najmniej jeden wydatek lub poczekaj na kolejny cykl synchronizacji. Możesz zsynchronizować ręcznie w **Ustawienia → Synchronizuj teraz**.

**P: Czy mogę zmieniać rozmiar widżetów?**
O: Dziś i Szybkie dodanie mają stały rozmiar. Tydzień można rozszerzyć poziomo. Przegląd można zmieniać poziomo i pionowo.
