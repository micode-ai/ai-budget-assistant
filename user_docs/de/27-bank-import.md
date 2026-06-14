# Transaktionen aus deiner Bank importieren

> Importiere Transaktionen aus einem CSV- oder PDF-Kontoauszug. Unterstützt werden mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise und jede andere Bank über den universellen Spalten-Mapper.

## Unterstützte Banken

- **mBank** — CSV-Export
- **PKO BP** — CSV-Export
- **Erste Bank** — PDF-Kontoauszug
- **Alior Bank** — PDF-Kontoauszug
- **Revolut** — CSV-Export
- **Wise** — CSV-Export (mehrsprachig, FX-Konversionen werden automatisch erkannt)
- **Andere** — beliebige Bank, über den universellen Spalten-Mapper (CSV)

## So importierst du

1. Gehe zu **Einstellungen → Transaktionen importieren**
2. Wähle deine Bank aus der Liste (oder **Andere (CSV)**, wenn sie nicht aufgeführt ist)
3. Wähle die aus deiner Bank exportierte Datei
4. Die App zeigt eine Vorschau — jede Zeile ist als Ausgabe, Einnahme oder Währungstausch markiert
5. Deaktiviere unerwünschte Zeilen und tippe **Importieren**

Die App überspringt Zeilen, die bereits im Konto vorhanden sind, durch Abgleich von Datum, Betrag und Währung.

## Wo du den Export in deiner Bank findest

- **Revolut**: Revolut-App → Statements → Datumsbereich wählen → CSV → Herunterladen
- **Wise**: wise.com → Transactions → Statements and Reports → Datumsbereich wählen → CSV → Währung/Saldo wählen → Herunterladen

> **Wise-Tipp:** Wise erstellt eine CSV pro Währungsguthaben. Importiere jede Währung separat. Bis zu 469 Tage pro Export.

## Wise — Währungsumrechnungen und Gebühren

Bei einer Währungsumrechnung in Wise (z.B. 100 USD → EUR) entstehen zwei Zeilen. Die App erkennt diese Paare automatisch und erstellt einen einzelnen **Währungstausch**-Eintrag (Wallet → Tausche).

Wise-Gebühren aus der Spalte `Total fees` werden automatisch in den Ausgabenbetrag eingerechnet.

## Was importiert wird

Jede Zeile wird zu einer Ausgabe, Einnahme oder Währungsumrechnung. Kategorien werden automatisch für bekannte Händler vorgeschlagen. Jede Zeile erhält eine eindeutige ID — ein erneuter Import derselben Datei ist sicher.

**Übersichtlichere Händlernamen.** Bekannte Ladenketten werden automatisch erkannt, sodass ein Kontoauszugseintrag wie `BIEDRONKA 1234 WARSZAWA` einfach als **Biedronka** gespeichert wird. Dadurch erscheint ein Geschäft in deiner Analyse als ein einziger Händler, statt als dutzende separate Einträge.

## „Andere" — universeller Mapper

Wenn deine Bank nicht in der Liste ist, wähle **Andere (CSV)**. Die App zeigt eine Dateivorschau und fragt, welche Spalte Datum, Betrag und Beschreibung enthält. Speichere diese Zuordnung für den nächsten Import.

## Importverlauf & Rückgängig

Der Bereich **Vergangene Importe** zeigt die letzten 20 Importe. Tippe auf den **Rückgängig-Pfeil** (↩) rechts, um einen Import zu widerrufen. Alle Transaktionen aus diesem Import werden entfernt.

- Rückgängig ist **30 Tage** nach dem Import möglich.

## Deine Bank nicht dabei?

Unten bei **Einstellungen → Transaktionen importieren** gibt es eine **„Bank nicht gefunden?"**-Karte. Tippe darauf, gib den Banknamen ein und füge einen Musterauszug bei.

---

*Siehe auch: [Ausgaben & Einnahmen](./03-expenses-and-income.md) | [Wallet & Tausch](./10-wallet-and-exchange.md) | [Einstellungen](./11-settings.md)*
