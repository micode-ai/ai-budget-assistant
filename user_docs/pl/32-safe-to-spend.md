# Planowanie — Bezpieczne wydatki, dostępność i automatyczne przechwytywanie

> Trzy narzędzia działające razem, abyś mógł wydawać z pewnością: żywa dzienna liczba budżetu, pytanie w czacie „Czy mogę sobie na to pozwolić?" i automatyczne rejestrowanie wydatków z powiadomień bankowych (tylko Android).

## Bezpieczne wydatki dzisiaj

Na ekranie głównym wyświetlana jest liczba **Bezpieczne wydatki** — kwota, którą możesz dzisiaj wydać i nadal pokryć wszystkie znane zobowiązania do końca miesiąca.

### Co jest uwzględniane

Liczba jest obliczana na podstawie:
- **Saldo portfela** — aktualne salda we wszystkich walutach, przeliczone na Twoją walutę wyświetlania.
- **Nadchodzące subskrypcje** — aktywne subskrypcje odnawiane przed końcem miesiąca (z Menedżera subskrypcji).
- **Nadchodzące wydatki cykliczne** — wydatki w rytmie tygodniowym, miesięcznym lub rocznym przypadające przed końcem miesiąca.
- **Wpłaty na cele** — dzienna kwota niezbędna do utrzymania Twoich celów oszczędnościowych na dobrej ścieżce.
- **Oczekiwany przychód** — jeśli aplikacja wykryje regularny miesięczny przychód (ta sama kwota, przerwa ~30 dni, co najmniej dwa razy w ciągu ostatnich 90 dni), zostaje on dodany jako oczekiwany przychód, a najbliższy termin wypłaty używany jako horyzont.

### Formuła

```
Bezpieczne wydatki = (Saldo + Oczekiwany przychód − Zobowiązania) ÷ Pozostałe dni
```

Wynik jest ograniczony do zera — nigdy nie zobaczysz liczby ujemnej. Jeśli zobowiązania przekraczają saldo, liczba wyświetla 0 z objaśniającą notatką.

### Szczegółowe rozbicie

Kliknij liczbę, aby otworzyć arkusz rozbicia pokazujący każdy składnik: saldo portfela, oczekiwany przychód, nadchodzące subskrypcje, wydatki cykliczne i wpłaty na cele. Wszystkie kwoty są w Twojej walucie wyświetlania; pojawia się notatka, jeśli jakiekolwiek przeliczenie użyło przybliżonego kursu.

### Widget

Bezpieczne wydatki są dostępne jako widget ekranu głównego. Możesz go pokazać lub ukryć w **Ustawienia → Widgety**.

## Czy mogę sobie na to pozwolić? (Wyrocznia dostępności)

Zadawaj czatowi AI pytania takie jak „Czy mogę sobie pozwolić na bilet lotniczy za 200 €?" lub „Czy mogę kupić nowy laptop za 3500 zł?". Czat używa tego samego silnika co Bezpieczne wydatki i daje deterministyczną odpowiedź tak lub nie — AI tylko narruje werdykt, nigdy nie zgaduje.

Możliwe odpowiedzi:
- **Tak** — kwota mieści się w dzisiejszym bezpiecznym budżecie.
- **Tak, ale z trudem** — mieści się w dostępnym saldzie, ale zużywa jego większość.
- **Nie** — przekracza dostępne środki.
- **Tak, ale opóźnia cel** — dostępne, ale cel oszczędnościowy „X" przesuwa się o około N dni.
- **Poczekaj do wypłaty** — dostępne po nadejściu następnego oczekiwanego przychodu (sugerowana data jest wyświetlana).

## Automatyczne przechwytywanie Android

Na Androidzie aplikacja może automatycznie tworzyć wydatek z powiadomień push Twojego banku — dzięki temu nie przegapisz żadnej transakcji, nawet gdy nie jesteś w aplikacji.

### Jak włączyć

1. Przejdź do **Ustawienia → Importuj transakcje → Automatyczne przechwytywanie (Android)**.
2. Przeczytaj notatkę o prywatności i kliknij **Włącz**.
3. Aplikacja otwiera systemowe ustawienia dostępu do powiadomień. Znajdź **AI Budget Assistant** na liście i włącz go.
4. Wróć do aplikacji — status pokazuje **Uprawnienie przyznane**.

### Prywatność

Tekst powiadomień jest przetwarzany **wyłącznie na Twoim urządzeniu**. Nazwa sprzedawcy, kwota i waluta są wyodrębniane lokalnie; tylko wynikowy wydatek jest synchronizowany z serwerem — surowy tekst powiadomienia nigdy nie jest nigdzie wysyłany.

### Obsługiwane banki (Europa)

Automatyczne przechwytywanie działa z powiadomieniami z dużych banków detalicznych w całej Europie. Obsługiwane kraje: Polska (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Credit Agricole, Nest Bank), Niemcy/Austria (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), Francja (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Hiszpania (BBVA, Santander, CaixaBank, Bankinter), Holandia (ING, Rabobank, ABN AMRO, bunq), Ukraina (PrivatBank, monobank, Oschadbank) oraz Rosja (Sberbank, Tinkoff, Alfa-Bank). Obsługiwane są również neobanki Revolut i N26. Pełna lista obsługiwanych aplikacji jest wyświetlana na ekranie automatycznego przechwytywania.

**Uwaga dotycząca kategorii:** Dla banków spoza Polski kategoria może nie zostać zaproponowana automatycznie. Wydatek zostanie zapisany bez kategorii i można ją poprawić ręcznie — aplikacja uczy się na podstawie poprawek.

### Deduplikacja i uzgadnianie między źródłami

Jeśli powiadomienie zostanie dostarczone więcej niż raz, lub jeśli zaimportujesz tę samą transakcję z pliku CSV banku, aplikacja automatycznie usuwa duplikaty. Każde przechwycone powiadomienie otrzymuje unikalny odcisk palca; duplikaty są cicho odrzucane.

Aplikacja uzgadnia też przechwycone powiadomienia z wydatkami dodanymi innymi ścieżkami:

- **Ta sama waluta:** jeśli później zarejestrujesz tę samą płatność ręcznie, skanując paragon lub przez bota, aplikacja automatycznie zachowuje bogatszy rekord i usuwa szkic z powiadomienia. Żadna akcja nie jest wymagana.
- **Inna waluta:** czasem ta sama płatność pojawia się w dwóch walutach — na przykład karta obciążona w euro, a powiadomienie bankowe pokazuje kwotę w złotych. Aplikacja nie może automatycznie scalić takich rekordów (kwoty się różnią), więc wyświetla sugestię w kanale alertów. Kliknij alert, aby otworzyć ekran scalania, wybierz, który rekord zachować, i potwierdź. Możesz też scalić bezpośrednio z podglądu importu, jeśli widzisz oznaczenie „Może już istnieć w innej walucie" przy danym wierszu.

### Sprawdzanie przechwytywań

Kliknij powiadomienie o przechwyceniu („Przechwycono 54 zł · Żabka — kliknij, aby sprawdzić"), aby otworzyć szczegóły wydatku i zweryfikować lub poprawić kwotę, sprzedawcę i kategorię przed synchronizacją.

### Tylko Android

Automatyczne przechwytywanie to funkcja Androida. Na iOS i w przeglądarce ta sekcja nie pojawia się. Alternatywą dla iOS jest skanowanie zdjęcia paragonu przez istniejącą funkcję przechwytywania paragonów.
