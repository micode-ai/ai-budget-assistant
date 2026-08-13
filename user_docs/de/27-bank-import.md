# Transaktionen aus deiner Bank importieren

> Importiere Transaktionen aus einem CSV-, XLSX- oder PDF-Kontoauszug. Unterstützt werden mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise und jede andere Bank über den universellen Spalten-Mapper.

## Unterstützte Banken

- **mBank** — CSV-Export
- **PKO BP** — CSV-Export
- **Erste Bank** — PDF-Kontoauszug
- **Alior Bank** — PDF-Kontoauszug
- **Revolut** — CSV-Export
- **Wise** — CSV-Export (mehrsprachig, FX-Konversionen werden automatisch erkannt)
- **Andere** — beliebige Bank, über den universellen Spalten-Mapper (CSV)
- **Tabellen** — XLSX-Kontoauszüge funktionieren ebenfalls; die App liest das erste Blatt

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

## Wenn nichts deinen Kontoauszug erkennt

Wenn keine der oben genannten Banken passt und die Datei kein einfaches Spaltenlayout hat, das die App selbst erraten kann, kann sie ein KI-Modell bitten, die Spalten für dich herauszufinden — welche das Datum ist, welche der Betrag, und so weiter.

**Bevor irgendetwas gesendet wird, wirst du einmal gefragt.** Beim ersten Mal für ein Konto siehst du einen Bildschirm, der erklärt, was dein Gerät verlässt: bei einer CSV- oder Tabellendatei nur die Kopfzeile plus bis zu 10 Beispielzeilen — nie die ganze Datei. Bei einem PDF-Kontoauszug sind es die ersten 20 Textzeilen. Du entscheidest einmal pro Konto; danach merkt sich die App deine Wahl.

- **Annehmen**, und die Datei wird mit den vom Modell ermittelten Spalten neu gelesen.
- **Ablehnen**, und du gelangst direkt zum oben beschriebenen manuellen Mapper. Das Ablehnen geschieht, bevor überhaupt etwas analysiert wurde — es gibt also noch nichts zum Vorausfüllen, du ordnest die Spalten genauso zu wie bei jeder anderen nicht unterstützten Bank.

**Das Ergebnis wird gezeigt, nicht einfach angenommen.** Wenn die KI-Zuordnung gelingt, zeigt die Vorschau eine Reihe von Chips über deinen Transaktionen — etwa `Datum → Data operacji`, `Betrag → Kwota` — zusammen mit ihrer Vermutung, um welche Bank es sich handelt. Das ist eine gute Vermutung, keine Gewissheit: Tippe jederzeit auf die Zeile, um den Mapper zu öffnen und eine falsch erkannte Spalte zu korrigieren.

**Ein paar Dinge werden zur Prüfung markiert, nicht einfach angenommen:**
- Wenn die Datei überhaupt keine Währungsspalte hat, wird jede Zeile in deiner eigenen Kontowährung gelesen, und ein Hinweis sagt dir das — tippe darauf, um die Währung vor dem Import zu ändern; die Änderung gilt für die ganze Datei.
- Zahlen aus einem PDF zu lesen ist schwerer zu überprüfen als bei einer CSV, daher versucht die App zu bestätigen, dass die gefundenen Beträge mit dem Endsaldo des Kontoauszugs übereinstimmen. Wenn das nicht bestätigt werden kann, siehst du einen Hinweis, die Liste zu überprüfen. Das ist kein Fehler — es ist einfach der normale Fall, wenn ein Kontoauszug keinen laufenden Saldo zum Abgleich aufdruckt, oder wenn der Abgleich nicht passt.

**PDF-Kontoauszüge benötigen ein Pro-Abo.** Ein PDF mit KI zu lesen braucht mehr Rechenleistung als eine CSV, daher ist es eine Pro-Funktion — ein kostenloses Konto sieht dort einen Upgrade-Bildschirm statt einer Fehlermeldung.

Bereits oben aufgeführte Banken (mBank, PKO BP, Erste, Alior, Revolut, Wise) sind davon nicht betroffen — sie werden genau so importiert wie weiter oben auf dieser Seite beschrieben.

## Importverlauf & Rückgängig

Der Bereich **Vergangene Importe** zeigt die letzten 20 Importe. Tippe auf den **Rückgängig-Pfeil** (↩) rechts, um einen Import zu widerrufen. Alle Transaktionen aus diesem Import werden entfernt.

- Rückgängig ist **30 Tage** nach dem Import möglich.

## Deine Bank nicht dabei?

Unten bei **Einstellungen → Transaktionen importieren** gibt es eine **„Bank nicht gefunden?"**-Karte. Tippe darauf, gib den Banknamen ein und füge einen Musterauszug bei.

## Wechseln Sie von einer anderen App?

Unter **Einstellungen → Transaktionen importieren** gibt es eine eigene Karte **„Wechseln Sie von einer anderen App?"** mit Monefy, Wallet by BudgetBakers und Money Manager / 1Money.

Exportieren Sie Ihren Verlauf aus der alten App, wählen Sie hier die passende Zeile, und Ihre Transaktionen kommen mit — **samt Ihren Kategorien**. Eine Kategorie, die es dort gab und hier noch nicht gibt, wird für Sie angelegt, damit Ihr Verlauf geordnet ankommt statt als ein undifferenzierter Haufen.

Umbuchungen zwischen Ihren eigenen Konten in der alten App werden übersprungen: Sie sind keine Ausgaben, und ein Import würde sie doppelt zählen.

Ihre App fehlt in der Liste? Nutzen Sie **Automatisch erkennen** oben — unbekannte Exportformate werden automatisch analysiert und lassen sich meist trotzdem importieren.

---

*Siehe auch: [Ausgaben & Einnahmen](./03-expenses-and-income.md) | [Wallet & Tausch](./10-wallet-and-exchange.md) | [Einstellungen](./11-settings.md)*
