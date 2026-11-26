---
title: "ING Kontoauszug als CSV herunterladen und importieren"
meta_description: "ING-Umsatzanzeige als CSV exportieren und ohne Bankverbindung ins Haushaltsbuch importieren: Schritte, Kartenzahlungen, Duplikate, Rückgängig."
target_keyword: "ing umsätze csv export"
slug: "ing-kontoauszug-csv"
pair: "import-ing-de"
lang: "de"
date: "2026-11-26"
---

# ING Kontoauszug als CSV herunterladen und ins Haushaltsbuch importieren

Bei der ING Deutschland exportierst du die Umsätze aus der Umsatzanzeige im Internetbanking als CSV. AI Budget Assistant liest diese Umsatzanzeige-CSV mit einem eigenen Parser. Unter **Einstellungen → Transaktionen importieren** wählst du **ING Deutschland**, lädst die Datei hoch und bekommst eine Vorschau mit Kategorievorschlägen. Die App verbindet sich nie mit deinem Konto.

## Wie exportiere ich meine ING-Umsätze als CSV?

Du erreichst die Umsatzanzeige, indem du im Internetbanking in der Kontenübersicht dein Konto auswählst. Laut ING-Hilfe speicherst du sie über **Exportieren** unten in der Umsatzanzeige als Datei. Danach:

1. Stelle in der Umsatzanzeige den gewünschten Zeitraum ein.
2. Klicke unten in der Umsatzanzeige auf **Exportieren** und wähle **CSV**.
3. Speichere die Datei auf dem Gerät, auf dem du die App nutzt.

Findest du den Export nicht, schau in die ING-Hilfe oder frag den Service. Menünamen können sich ändern. Wichtig: Nimm die CSV der Umsatzanzeige, nicht die PDF-Kontoauszüge aus dem Postfach.

ING exportiert nur gebuchte Umsätze, vorgemerkte tauchen in der Datei nicht auf. Du musst also nichts aussortieren.

## Wie importiere ich die ING-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **ING Deutschland** als eigene Zeile in der Schnellauswahl.
2. Tippe auf **ING Deutschland** und wähle die Datei. Oder nimm **Automatisch erkennen (jede Bank)**, die App erkennt die ING-Datei auch so.
3. In der Vorschau siehst du Datum, Betrag, Beschreibung und die vorgeschlagene Kategorie. Vorschläge kommen von bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle unnötige Zeilen ab und tippe auf **Importieren**.

Kartenzahlungen stehen bei ING als „VISA <Händler>“. Die App zeigt dir den Händlernamen statt des gesamten Buchungstexts, das macht die Kategorisierung genauer.

Da ein eigener Parser liest, ist keine KI-Spaltenerkennung im Spiel: keine Zustimmung, nichts geht an ein Modell, kostenlos in jedem Tarif.

## Duplikate und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen aus einer früheren Datei werden erkannt und abgewählt |
| Überlappende Zeiträume | Die Überschneidung wird abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |

Prüfe vor dem Bestätigen ein paar Zeilen mit dem Original, besonders Vorzeichen und Datum.

## Weiterlesen

Warum die App ohne Bankverbindung auskommt, steht in [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Den allgemeinen Weg beschreibt [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Weitere Banken: [DKB Kontoauszug als CSV](/blog/de/dkb-kontoauszug-csv/), [comdirect Umsätze als CSV](/blog/de/comdirect-umsaetze-csv/) und [N26 CSV-Export](/blog/de/n26-kontoauszug-importieren/). Die App gibt es auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: ING CSV-Export

**Welche ING-Datei soll ich importieren?**

Die CSV der Umsatzanzeige. Die PDF-Kontoauszüge aus dem Postfach liest dieser Parser nicht.

**Warum stehen keine vorgemerkten Umsätze in der Datei?**

ING exportiert nur gebuchte Transaktionen. Vorgemerktes erscheint erst nach der Buchung in einem späteren Export.

**Wird bei Kartenzahlungen der Händler erkannt?**

Ja. Zahlungen mit dem Muster „VISA <Händler>“ zeigt die App mit dem Händlernamen.

**Wird etwas an eine KI gesendet?**

Nein. Ein eigener Parser liest die Datei, ohne Zustimmungsabfrage.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf, 30 Tage lang.
