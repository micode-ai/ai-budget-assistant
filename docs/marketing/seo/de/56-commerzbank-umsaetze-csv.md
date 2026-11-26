---
title: "Commerzbank Umsätze als CSV exportieren und importieren"
meta_description: "Commerzbank-Umsätze als CSV exportieren und ohne Bankverbindung ins Haushaltsbuch importieren: Schritte, Grenzen beim Händlernamen, Duplikate."
target_keyword: "commerzbank umsätze csv export"
slug: "commerzbank-umsaetze-csv"
pair: "import-commerzbank"
lang: "de"
date: "2026-11-26"
---

# Commerzbank Umsätze als CSV exportieren und ins Haushaltsbuch importieren

Bei der Commerzbank exportierst du die Umsätze aus der Umsatzansicht im Online-Banking als CSV. AI Budget Assistant liest diese Datei mit einem eigenen Commerzbank-Parser. Unter **Einstellungen → Transaktionen importieren** wählst du **Commerzbank**, lädst die CSV hoch und importierst nach der Vorschau. Eine Grenze vorab: Einen getrennten Händlernamen liefert die aktuelle Commerzbank-Datei nicht, dazu unten mehr.

## Wie exportiere ich meine Commerzbank-Umsätze als CSV?

Laut Commerzbank-Hilfe (Stand November 2026) geht der Export im Online-Banking so:

1. Melde dich im Online-Banking an und wähle das Konto.
2. Klicke rechts oben über den Umsätzen auf **PDF/CSV** und wähle **Umsätze exportieren**.
3. Grenze bei Bedarf Zeitraum, Betrag, Ein- oder Ausgänge und Umsatzart ein.
4. Wähle als Dateiformat **CSV** und klicke auf **Exportieren**.

Am einfachsten geht das im Online-Banking im Browser. Menünamen können sich nach Updates ändern.

## Wie importiere ich die Commerzbank-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **Commerzbank** als eigene Zeile in der Schnellauswahl.
2. Tippe auf **Commerzbank** und wähle die Datei. Auch **Automatisch erkennen (jede Bank)** erkennt die Datei.
3. Prüfe in der Vorschau Datum, Betrag, Beschreibung und Kategorie. Vorschläge kommen von bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle unnötige Zeilen ab und tippe auf **Importieren**.

Ein eigener Parser liest die Datei. Es gibt keine KI-Spaltenerkennung, keine Zustimmungsabfrage, es geht nichts an ein Modell, und der Import ist in jedem Tarif kostenlos.

## Die Grenze: kein getrennter Händlername

In der aktuellen Commerzbank-Datei stehen Gegenpartei und Verwendungszweck im selben Textfeld. Die App kann sie deshalb nicht sauber trennen und übernimmt den gesamten Text als Beschreibung, ohne separaten Händlernamen. Die Kategorievorschläge funktionieren trotzdem oft, weil bekannte Händler im Text vorkommen. Bei unbekannten Zahlungsempfängern kategorisierst du in der Vorschau von Hand.
## Duplikate und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen aus einer früheren Datei werden erkannt und abgewählt |
| Überlappende Zeiträume | Die Überschneidung wird abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |

Prüfe vor dem Bestätigen ein paar Zeilen mit dem Original, besonders Vorzeichen und Datum.

## Weiterlesen

Warum die App ohne Bankverbindung arbeitet, steht in [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Den allgemeinen Ablauf beschreibt [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Mehr Banken: [comdirect Umsätze als CSV](/blog/de/comdirect-umsaetze-csv/), [Sparkasse Kontoauszug als CSV](/blog/de/sparkasse-kontoauszug-csv/) und [N26 CSV-Export](/blog/de/n26-kontoauszug-importieren/). Die App findest du auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: Commerzbank CSV-Export

**Kann ich Commerzbank-Umsätze als CSV exportieren?**

Ja, die Umsatzansicht im Online-Banking bietet einen CSV-Export. Den genauen Menüpunkt findest du in deinem Banking oder in der Commerzbank-Hilfe.

**Warum zeigt die App keinen Händlernamen?**

In der aktuellen Commerzbank-Datei teilen sich Gegenpartei und Verwendungszweck ein Textfeld. Die App importiert es als Beschreibung ohne separaten Händlernamen.

**Werden trotzdem Kategorien vorgeschlagen?**

Oft ja, wenn ein bekannter Händler im Text steht. Sonst wählst du die Kategorie in der Vorschau selbst.

**Wird etwas an eine KI gesendet?**

Nein. Ein eigener Parser liest die Datei, ohne Zustimmungsabfrage.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf, 30 Tage lang.
