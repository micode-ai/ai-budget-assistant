---
title: "Revolut-Kontoauszug importieren: CSV ins Haushaltsbuch"
meta_description: "Revolut-Kontoauszug als CSV ins Haushaltsbuch importieren: Export, Vorschau, Währungswechsel als ein Eintrag und keine Duplikate beim erneuten Import."
target_keyword: "revolut kontoauszug importieren"
slug: "revolut-kontoauszug-importieren"
pair: "import-revolut"
lang: "de"
date: "2026-10-07"
---

# Revolut-Kontoauszug importieren: CSV ins Haushaltsbuch in wenigen Minuten

Um einen Revolut-Kontoauszug zu importieren, erzeugst du in der Revolut-App einen Kontoauszug als CSV und wählst in AI Budget Assistant Einstellungen → Transaktionen importieren → Revolut und die Datei. Du siehst eine Vorschau mit Kategorievorschlägen, abgewählten Duplikaten und zusammengeführten Währungswechseln. Das dauert nur wenige Minuten.

Revolut lässt sich besonders gut importieren: Die CSV hat ein festes Spaltenlayout und nennt bei jeder Zeile die Währung. Hier steht, was die App aus der Datei liest und worauf du achten solltest.

## Wie exportiere ich einen Auszug aus Revolut?

Öffne in der Revolut-App die Kontoauszüge deines Kontos (im englischen Interface heißt der Bereich Statements), wähle den Zeitraum und das Format CSV und lade die Datei auf dein Smartphone oder deinen Computer herunter. Revolut benennt Schaltflächen gelegentlich um. Sieht die Oberfläche anders aus, suche die Option zum Erstellen eines Auszugs, bei der du CSV auswählen kannst.

Tipp: Lade beim ersten Mal einen längeren Zeitraum herunter, etwa drei bis sechs Monate. Überlappende Zeiträume erneut zu importieren ist unproblematisch, weil die App bereits vorhandene Buchungen erkennt.

## Wie läuft der Import Schritt für Schritt ab?

1. **CSV aus Revolut herunterladen**, auf das Gerät, auf dem die App läuft.
2. In AI Budget Assistant **Einstellungen → Transaktionen importieren** öffnen.
3. **Revolut** auswählen (oder **Automatisch erkennen (jede Bank)**, was das Revolut-Layout an den Spaltenüberschriften erkennt).
4. Datei wählen. Die App zeigt eine Vorschau: jede Zeile als Ausgabe, Einnahme oder Währungswechsel, mit vorgeschlagener Kategorie.
5. Unerwünschte Zeilen abwählen, Kategorien korrigieren und auf **Importieren** tippen.

In der Vorschau siehst du Zähler für ausgewählte und bereits importierte Zeilen. Bereits bekannte Zeilen sind standardmäßig abgewählt.

## Was liest die App aus einer Revolut-Datei?

| Element | Behandlung |
|---|---|
| Format | CSV mit Kommas, Spaltenüberschriften in der ersten Zeile |
| Spalten | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Datum | Aus Started Date (nur das Datum, ohne Uhrzeit) |
| Betrag | Mit Vorzeichen: negativ ist eine Ausgabe, positiv eine Einnahme |
| Währung | Pro Zeile, damit ein Mehrwährungskonto nichts vermischt |
| Status | Nur Zeilen mit COMPLETED werden importiert; abgelehnte und ausstehende werden übersprungen |
| Währungswechsel | Zwei EXCHANGE-Zeilen mit gleichem Datum und umgekehrten Vorzeichen werden zu einem Währungswechsel |
| Händler | Aus Description, bekannte Ketten mit bereinigtem Namen |

## Was passiert mit Währungswechseln und Mehrwährungskonten?

Ein Revolut-Konto hält oft mehrere Währungen. Tauschst du Złoty in Euro, stehen in der Datei zwei Zeilen: Abgang in der einen, Zugang in der anderen Währung. Einzeln gezählt ergäben sie eine falsche Ausgabe und eine falsche Einnahme. Deshalb paart die App solche Zeilen und speichert einen **Währungswechsel**, den du in der Wallet siehst und nicht in deinen Ausgaben.

Einkäufe in Fremdwährung bleiben in ihrer eigenen Währung.

## Wie vermeide ich Duplikate, und was, wenn etwas schiefgeht?

Die App schützt dich doppelt. Erstens bekommt jede Zeile eine eindeutige ID aus Datum, Betrag und Beschreibung, sodass derselbe Import nichts doppelt anlegt. Zweitens vergleicht sie Datum, Betrag und Währung mit den Buchungen in deinem Konto, auch mit manuell erfassten, und wählt wahrscheinliche Wiederholungen ab.

Zwei identische Einkäufe am selben Tag, etwa zwei Kaffee zum gleichen Preis, bleiben zwei getrennte Buchungen. Gefällt dir das Ergebnis nicht, machst du den Import im Importverlauf am Ende des Bildschirms innerhalb von 30 Tagen mit einem Tipp rückgängig und kannst dieselbe Datei erneut importieren.

Die Grundlagen findest du in [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Steht deine Bank nicht in der Liste, hilft [Kontoauszug von jeder Bank importieren](/blog/de/kontoauszug-von-jeder-bank-importieren/).

## Ist das sicher?

Du gibst nie deine Revolut-Zugangsdaten ein. Du importierst eine statische Datei, die du selbst heruntergeladen hast, die App sieht also nur den Buchungsverlauf in dieser Datei. AI Budget Assistant kannst du kostenlos auf [ai-budget.pl](https://ai-budget.pl) oder bei [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant) ausprobieren.

## FAQ: Revolut-Kontoauszug importieren

**Welches Format brauche ich für den Revolut-Auszug?**

CSV. Das ist die Datei mit den Spalten Type, Started Date, Description, Amount, Currency, State und Balance, die Revolut im Auszugsbereich deines Kontos erzeugt. Ein PDF lässt sich nur per KI-Auslesen verarbeiten, was eine Pro-Funktion ist. Für regelmäßige Importe nimmst du also CSV.

**Werden abgelehnte oder ausstehende Buchungen importiert?**

Nein. Es werden nur Zeilen mit dem Status COMPLETED übernommen. Eine abgelehnte Kartenzahlung mindert dein Budget also nicht, und eine ausstehende erscheint erst im nächsten Auszug, sobald sie verbucht ist.

**Zählt ein Währungswechsel bei Revolut als Ausgabe?**

Nein. Zwei Wechselzeilen mit gleichem Datum und umgekehrten Vorzeichen werden zu einem Währungswechsel in der Wallet zusammengeführt. Er bläht weder Ausgaben noch Einnahmen auf.

**Kann ich denselben Auszug zweimal importieren?**

Ja, es wird nichts doppelt angelegt. Wiederholte Zeilen werden erkannt und in der Vorschau als bereits importiert abgewählt.

**Kann ich einen Revolut-Import rückgängig machen?**

Ja. Tippe im Importverlauf am Ende des Importbildschirms auf den Rückgängig-Pfeil beim jeweiligen Import. Das geht 30 Tage lang, danach kannst du dieselbe Datei erneut importieren.
