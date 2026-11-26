---
title: "Sparkasse Kontoauszug als CSV herunterladen und importieren"
meta_description: "Sparkasse-Umsätze als CSV (CAMT oder MT940) exportieren und ohne Bankverbindung ins Haushaltsbuch importieren: Schritte, Vorgemerktes, Duplikate."
target_keyword: "sparkasse kontoauszug csv"
slug: "sparkasse-kontoauszug-csv"
pair: "import-sparkasse"
lang: "de"
date: "2026-11-26"
---

# Sparkasse Kontoauszug als CSV herunterladen und ins Haushaltsbuch importieren

Deine Sparkasse-Umsätze lädst du im Online-Banking als CSV herunter, meist über die Umsatzanzeige mit einer Exportfunktion. AI Budget Assistant liest die Formate **CSV-CAMT V2**, **CSV-CAMT V8** und **CSV-MT940** mit einem eigenen Sparkasse-Parser. Du wählst unter **Einstellungen → Transaktionen importieren** die Zeile **Sparkasse** und die Datei, und die App zeigt dir die Umsätze samt Kategorievorschlägen. Eine Verbindung zu deinem Konto gibt es nicht, du loggst dich nirgends ein.

## Wie lade ich meine Sparkasse-Umsätze als CSV herunter?

Jede Sparkasse ist ein eigenes Institut mit eigenem Online-Banking, deshalb heißen die Menüpunkte nicht überall gleich. Der übliche Weg:

1. Melde dich im Online-Banking deiner Sparkasse an und öffne das Girokonto.
2. Rufe die **Umsätze** auf und stelle den Zeitraum ein, den du importieren willst.
3. Suche in der Umsatzansicht die Exportfunktion und wähle als Format **CSV**. Je nach Institut heißt der Eintrag **CSV-CAMT** (Version 2 oder 8) oder **CSV-MT940**.
4. Speichere die Datei auf dem Gerät, auf dem du die App nutzt.

Findest du den Export nicht, hilft die Hilfe deiner Sparkasse oder der Kundenservice. Die Menünamen und der Platz der Funktion können sich zwischen den Instituten und nach Updates unterscheiden. Die BW-Bank nutzt dasselbe Format und funktioniert ebenfalls.

## Wie importiere ich die Sparkasse-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **Sparkasse** als eigene Zeile in der Schnellauswahl.
2. Tippe auf **Sparkasse** und wähle die CSV-Datei. Alternativ nimmst du **Automatisch erkennen (jede Bank)**, die App erkennt die Sparkasse-Datei auch von selbst.
3. In der Vorschau siehst du Datum, Betrag, Beschreibung und die vorgeschlagene Kategorie. Die Vorschläge stammen aus bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle Zeilen ab, die du nicht willst, und tippe auf **Importieren**.

Für die Sparkasse-Dateien liest ein fester Parser die Datei. Es wird keine KI zur Spaltenerkennung eingesetzt, du bestätigst nichts, und es wird nichts an ein Modell gesendet. Der Import ist in jedem Tarif kostenlos.

## Was passiert mit vorgemerkten Umsätzen?

Zeilen mit dem Vermerk **Umsatz vorgemerkt** überspringt die App absichtlich. Ein vorgemerkter Umsatz ist noch nicht endgültig gebucht und taucht später als gebuchte Zeile wieder auf. Importierte die App ihn jetzt, hättest du ihn nach dem nächsten Export doppelt.

Importiere also gebuchte Umsätze. Willst du auch die zuletzt vorgemerkten Zahlungen, exportierst du die Datei nach ein paar Tagen erneut. Was du schon importiert hast, erkennt die App wieder.

## Duplikate, Fehler und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen, die du aus einer früheren Datei schon importiert hast, werden erkannt und abgewählt |
| Zeiträume überlappen | Kein Problem, die Überschneidung wird abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |
| Kosten | Kostenlos in jedem Tarif |

Prüfe vor dem Bestätigen ein paar Zeilen mit dem Original, vor allem Vorzeichen und Datum.

## Und wenn ich lieber nichts hochladen will?

Dann geht es ohne Datei: Ausgaben tippst du selbst ein, sprichst sie ein oder scannst Belege. Warum die App bewusst ohne Bankanbindung arbeitet, steht in [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Den allgemeinen Ablauf beschreibt [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Hast du auch ein Konto bei einer Neobank, lies [N26 Umsätze als CSV exportieren](/blog/de/n26-kontoauszug-importieren/). Die App findest du auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: Sparkasse CSV-Export

**Welches CSV-Format brauche ich bei der Sparkasse?**

Die App liest CSV-CAMT V2, CSV-CAMT V8 und CSV-MT940. Welche davon deine Sparkasse anbietet, siehst du im Export-Dialog des Online-Bankings.

**Funktioniert der Import auch mit der BW-Bank?**

Ja, die BW-Bank exportiert im gleichen Format wie die Sparkassen.

**Warum fehlen vorgemerkte Umsätze?**

Die App überspringt Zeilen mit „Umsatz vorgemerkt“ absichtlich, damit nichts doppelt landet, sobald die Zahlung gebucht ist. Exportiere später erneut, dann sind sie dabei.

**Muss ich mein Sparkasse-Konto mit der App verbinden?**

Nein. Die App verbindet sich nie mit der Bank, es gibt kein Login und kein PSD2 oder FinTS. Du lädst nur die Datei hoch, die du selbst exportiert hast.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf unten auf dem Importbildschirm, 30 Tage lang.
