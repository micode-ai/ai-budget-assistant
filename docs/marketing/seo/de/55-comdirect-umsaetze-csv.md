---
title: "comdirect Umsätze als CSV exportieren und importieren"
meta_description: "comdirect-Umsätze (Girokonto) als CSV exportieren und ohne Bankverbindung ins Haushaltsbuch importieren: Schritte, offene Umsätze, Duplikate."
target_keyword: "comdirect umsätze csv export"
slug: "comdirect-umsaetze-csv"
pair: "import-comdirect"
lang: "de"
date: "2026-11-26"
---

# comdirect Umsätze als CSV exportieren und ins Haushaltsbuch importieren

Bei der comdirect lädst du die Umsätze deines Girokontos als CSV herunter. AI Budget Assistant liest die Datei „Umsätze Girokonto“ mit einem eigenen comdirect-Parser. Unter **Einstellungen → Transaktionen importieren** wählst du **comdirect**, lädst die CSV hoch, prüfst die Vorschau und importierst. Es gibt keine Bankverbindung und kein Login, nur die Datei, die du selbst exportiert hast.

## Wie exportiere ich meine comdirect-Umsätze als CSV?

So gehst du im comdirect-Banking vor:

1. Melde dich im comdirect-Banking an und öffne die **Umsätze** deines Girokontos.
2. Stelle den Zeitraum ein, den du importieren willst.
3. Suche in der Umsatzansicht die Download- oder Exportfunktion und wähle **CSV**.
4. Speichere die Datei auf dem Gerät, auf dem du die App nutzt.

Die Datei heißt bei comdirect typischerweise „Umsätze Girokonto“. Findest du den Export nicht, hilft die comdirect-Hilfe oder der Kundenservice. Die Namen der Menüpunkte können sich ändern.

## Wie importiere ich die comdirect-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **comdirect** als eigene Zeile in der Schnellauswahl.
2. Tippe auf **comdirect** und wähle die Datei. Alternativ nimmst du **Automatisch erkennen (jede Bank)**, auch dann erkennt die App die Datei.
3. Prüfe in der Vorschau Datum, Betrag, Beschreibung und Kategorie. Vorschläge kommen von bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle Zeilen ab, die du nicht willst, und tippe auf **Importieren**.

Bei comdirect steht der Name des Zahlungsempfängers oder Zahlenden im Buchungstext. Die App liest ihn von dort und zeigt ihn als Händler, du musst ihn nicht selbst heraussuchen.

## Was ist mit offenen Kartenumsätzen?

Offene Kartenumsätze (Status **offen**) überspringt die App. Sie sind noch nicht endgültig gebucht und würden nach dem nächsten Export ein zweites Mal erscheinen. Exportiere die Datei später erneut, dann sind sie als gebuchte Umsätze dabei. Was du schon importiert hast, wird erkannt.

Weil ein eigener Parser liest, ist keine KI-Spaltenerkennung beteiligt: keine Zustimmungsabfrage, nichts geht an ein Modell, kostenlos in jedem Tarif.

## Duplikate und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen aus einer früheren Datei werden erkannt und abgewählt |
| Überlappende Zeiträume | Die Überschneidung wird abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |

Prüfe vor dem Bestätigen ein paar Zeilen mit dem Original, vor allem Vorzeichen und Datum.

## Weiterlesen

Warum die App ohne Bankverbindung auskommt, erklärt [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Der allgemeine Ablauf steht in [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Mehr zu Banken: [Commerzbank Umsätze als CSV](/blog/de/commerzbank-umsaetze-csv/), [ING Kontoauszug als CSV](/blog/de/ing-kontoauszug-csv/) und [N26 CSV-Export](/blog/de/n26-kontoauszug-importieren/). Die App findest du auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: comdirect CSV-Export

**Kann ich comdirect-Umsätze als CSV exportieren?**

Ja, die Umsätze des Girokontos lassen sich als CSV herunterladen. Die Datei heißt typischerweise „Umsätze Girokonto“.

**Warum fehlen offene Kartenumsätze?**

Die App überspringt Zeilen mit dem Status „offen“ absichtlich, damit nichts doppelt landet, sobald die Zahlung gebucht ist.

**Wird der Händlername erkannt?**

Ja. Den Namen des Zahlungsempfängers oder Zahlenden liest die App aus dem Buchungstext.

**Wird etwas an eine KI gesendet?**

Nein. Ein eigener comdirect-Parser liest die Datei, ohne Zustimmungsabfrage.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf, 30 Tage lang.
