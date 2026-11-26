---
title: "DKB Kontoauszug als CSV herunterladen und importieren"
meta_description: "DKB-Umsätze als CSV exportieren und ohne Bankverbindung ins Haushaltsbuch importieren: altes und neues DKB-Format, Vorgemerktes, Duplikate."
target_keyword: "dkb umsätze csv export"
slug: "dkb-kontoauszug-csv"
pair: "import-dkb"
lang: "de"
date: "2026-11-26"
---

# DKB Kontoauszug als CSV herunterladen und ins Haushaltsbuch importieren

Deine DKB-Umsätze exportierst du im Online-Banking als CSV. AI Budget Assistant hat dafür einen eigenen DKB-Parser, der das aktuelle Exportformat seit der Umstellung des DKB-Bankings 2023 liest und auch das ältere. Du wählst unter **Einstellungen → Transaktionen importieren** die Zeile **DKB**, lädst die Datei hoch, prüfst die Vorschau und importierst. Ohne Bankverbindung, ohne Login.

## Wie lade ich meine DKB-Umsätze als CSV herunter?

Die DKB-Hilfe beschreibt vor allem den Export der Umsatzliste als PDF und das Postfach mit den Kontoauszügen; für den Import brauchst du aber die CSV-Datei der Umsätze aus dem Web-Banking. Der übliche Ablauf:

1. Melde dich im Online-Banking der DKB an und öffne dein Konto mit den Umsätzen.
2. Stelle den Zeitraum ein, den du importieren willst.
3. Suche in der Umsatzansicht die Exportfunktion und wähle **CSV**.
4. Speichere die Datei auf dem Gerät, auf dem du die App nutzt.

Die PDF-Kontoauszüge im Postfach eignen sich nicht für diesen Import, nimm die CSV-Datei. Falls du den Export nicht findest, schau in die DKB-Hilfe oder frag den Kundenservice. Die Namen der Menüpunkte können sich ändern.

## Altes und neues Format

Seit 2023 exportiert die DKB ihre Umsätze mit einem anderen Aufbau als davor. Die App erkennt beide. Hast du also noch eine ältere Datei aus einem früheren Export, kannst du sie ebenfalls importieren und so Monate vor der Umstellung nachtragen.

## Wie importiere ich die DKB-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **DKB** als eigene Zeile in der Schnellauswahl.
2. Tippe auf **DKB** und wähle die Datei. Auch **Automatisch erkennen (jede Bank)** erkennt die DKB-CSV.
3. Prüfe in der Vorschau Beträge und Kategorien. Die Vorschläge kommen von bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle Zeilen ab, die du nicht willst, und tippe auf **Importieren**.

Zeilen mit dem Status **Vorgemerkt** überspringt die App. Sie sind noch nicht endgültig gebucht und würden nach dem nächsten Export doppelt auftauchen. Exportiere später erneut, dann sind sie als gebuchte Umsätze dabei.

Da ein eigener Parser die Datei liest, gibt es keine KI-Spaltenerkennung: keine Zustimmungsabfrage, nichts wird an ein Modell gesendet, kostenlos in jedem Tarif.

## Duplikate und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen aus einer früheren Datei werden erkannt und abgewählt |
| Überlappende Zeiträume | Die Überschneidung wird abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |

## Weiterlesen

Warum die App ohne Bankverbindung arbeitet, steht in [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Den allgemeinen Ablauf erklärt [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Auch interessant für Direktbank-Kunden: [N26 Umsätze als CSV](/blog/de/n26-kontoauszug-importieren/) und [ING Kontoauszug als CSV](/blog/de/ing-kontoauszug-csv/). Die App findest du auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: DKB CSV-Export

**Kann ich DKB-Umsätze als CSV herunterladen?**

Ja, im Online-Banking lassen sich die Umsätze als CSV exportieren. Die PDF-Kontoauszüge liegen separat im Postfach.

**Liest die App auch alte DKB-Dateien?**

Ja. Der Parser versteht das aktuelle Format seit der Umstellung 2023 und das ältere.

**Warum fehlen Zeilen mit „Vorgemerkt“?**

Die App überspringt vorgemerkte Umsätze absichtlich, damit sie nicht doppelt landen, wenn sie später gebucht werden.

**Wird etwas an eine KI gesendet?**

Nein. Ein eigener DKB-Parser liest die Datei, es gibt keine Zustimmungsabfrage.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf, 30 Tage lang.
