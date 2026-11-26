---
title: "Volksbank Kontoauszug als CSV exportieren und importieren"
meta_description: "Volksbank- und Raiffeisenbank-Umsätze als CSV exportieren und ohne Bankverbindung ins Haushaltsbuch importieren. Auch für Sparda-Bank West und GLS."
target_keyword: "volksbank umsätze csv export"
slug: "volksbank-kontoauszug-csv"
pair: "import-volksbank"
lang: "de"
date: "2026-11-26"
---

# Volksbank Kontoauszug als CSV exportieren und ins Haushaltsbuch importieren

Bei der Volksbank oder Raiffeisenbank exportierst du Umsätze im Online-Banking als CSV-Datei. AI Budget Assistant liest dieses CSV der VR-Banken (Atruvia-Online-Banking) mit einem eigenen Parser. Unter **Einstellungen → Transaktionen importieren** wählst du **Volksbank / Raiffeisenbank**, lädst die Datei hoch, und die App schlägt Kategorien vor. Keine Bankanbindung, kein Login, keine KI.

## Wie exportiere ich meine Volksbank-Umsätze als CSV?

Jede Volksbank und Raiffeisenbank betreibt ihr Online-Banking selbst, deshalb heißen die Menüpunkte nicht überall gleich. Der übliche Ablauf:

1. Melde dich im Online-Banking deiner Bank an und öffne das Konto in der **Umsatzanzeige**.
2. Stelle den Zeitraum ein.
3. Suche in der Umsatzansicht die Exportfunktion und wähle **CSV**.
4. Speichere die Datei auf dem Gerät, auf dem du die App nutzt.

Findest du die Funktion nicht, frag die Hilfe oder den Kundenservice deiner Bank. Die Namen der Menüpunkte unterscheiden sich von Bank zu Bank.

## Welche Banken gehören dazu?

Der Parser liest das CSV-Layout der Volksbanken und Raiffeisenbanken. Dasselbe Layout haben die Exporte der **Sparda-Bank West** und der **GLS Bank**, deshalb funktionieren sie ebenfalls. Bei einer anderen Sparda-Bank probierst du es einfach aus: Die Vorschau zeigt sofort, ob die Spalten stimmen.

## Wie importiere ich die Datei in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**. Bei deutscher App-Sprache steht **Volksbank / Raiffeisenbank** als eigene Zeile in der Schnellauswahl.
2. Tippe darauf und wähle die CSV. Oder nimm **Automatisch erkennen (jede Bank)**, auch dann erkennt die App die Datei.
3. Prüfe in der Vorschau Datum, Betrag, Beschreibung und Kategorie. Vorschläge kommen von bekannten deutschen Händlern wie REWE, EDEKA, ALDI, LIDL, dm, Rossmann, DB, Aral, Lieferando oder Amazon.
4. Wähle unnötige Zeilen ab und tippe auf **Importieren**.

Die SEPA-Referenzen (EREF, MREF, CRED) schneidet die App aus der Beschreibung heraus, damit du lesbaren Text bekommst statt langer Kennungen.

Weil ein fester Parser die Datei liest, entfällt die KI-Spaltenerkennung: keine Zustimmungsabfrage, nichts geht an ein Modell, und der Import ist in jedem Tarif kostenlos.

## Duplikate und Rückgängig

| Frage | Antwort |
|---|---|
| Doppelte Umsätze | Zeilen aus einer früheren Datei werden erkannt und abgewählt |
| Falsch importiert | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |
| Kosten | Kostenlos in jedem Tarif |

Vergleiche vor dem Bestätigen ein paar Zeilen mit dem Original, besonders Vorzeichen und Datumsformat.

## Weiterlesen

Warum die App ohne Bankverbindung auskommt, erklärt [Haushaltsbuch-App ohne Bankverbindung](/blog/de/haushaltsbuch-app-ohne-bankverbindung/). Der allgemeine Ablauf steht in [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Für Konten bei Direktbanken: [DKB Kontoauszug als CSV](/blog/de/dkb-kontoauszug-csv/) und [N26 CSV-Export](/blog/de/n26-kontoauszug-importieren/). Die App gibt es auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: Volksbank CSV-Export

**Kann ich bei der Volksbank Umsätze als CSV exportieren?**

Ja, das Online-Banking der VR-Banken bietet in der Umsatzansicht einen CSV-Export. Wo genau der Menüpunkt liegt, hängt von deiner Bank ab.

**Funktioniert der Import auch bei der Raiffeisenbank?**

Ja, Raiffeisenbanken nutzen dasselbe Online-Banking und Layout. Auch Sparda-Bank West und GLS Bank exportieren so.

**Warum sind die EREF- und MREF-Angaben weg?**

Die App schneidet die SEPA-Referenzen (EREF, MREF, CRED) aus der Beschreibung, damit der Verwendungszweck lesbar bleibt.

**Wird dabei etwas an eine KI gesendet?**

Nein. Ein eigener Parser liest die Datei, es gibt keine Zustimmungsabfrage und keine Übertragung an ein Modell.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf, 30 Tage lang.
