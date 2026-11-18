---
title: "N26 Umsätze als CSV exportieren und ins Haushaltsbuch"
meta_description: "So exportierst du deine N26-Kontoaktivität als CSV und importierst sie ins Haushaltsbuch: Schritte laut N26-Hilfe, Spaltenerkennung, Duplikate und Grenzen."
target_keyword: "n26 csv export"
slug: "n26-kontoauszug-importieren"
pair: "import-n26"
lang: "de"
date: "2026-11-18"
---

# N26 Umsätze als CSV exportieren und ins Haushaltsbuch übernehmen

Deine N26-Umsätze exportierst du im Web-Banking als CSV: Konto oder Space wählen, **Downloads** öffnen, den Bericht über die Kontoaktivität mit Start- und Enddatum anlegen und **CSV** herunterladen. In AI Budget Assistant lädst du die Datei unter **Einstellungen → Transaktionen importieren → Automatisch erkennen (jede Bank)** hoch. Die App erkennt die Spalten, schlägt Kategorien vor und wählt Transaktionen ab, die du schon hast.

Für N26 gibt es in der App keinen eigenen Parser. Die Spalten ordnet beim ersten Mal die KI-Erkennung zu, und das ist für CSV-Dateien kostenlos.

## Wie exportiere ich meine N26-Umsätze als CSV?

Laut N26-Hilfe (Stand November 2026; die Hilfe beschreibt die englischen Menünamen, auf Deutsch können sie anders heißen):

1. Melde dich im **Web-Banking** von N26 an. Der CSV-Export ist dort beschrieben, nicht in der App.
2. Wähle auf der Startseite das Konto oder den Space.
3. Öffne **Downloads** und dort den Bericht über die Kontoaktivität (**Account Activity**).
4. Gib Start- und Enddatum ein, wähle **CSV** und lade die Datei herunter.

Die monatlichen Kontoauszüge gibt es bei N26 nur als PDF. Für den Import nimm deshalb den CSV-Bericht über die Kontoaktivität, nicht den Kontoauszug.

## Wie importiere ich die N26-CSV in AI Budget Assistant?

1. Öffne **Einstellungen → Transaktionen importieren**.
2. Wähle **Automatisch erkennen (jede Bank)** und die CSV-Datei.
3. Beim ersten Mal fragt die App, ob sie die Spalten per KI erkennen darf, und zeigt, was gesendet wird: die Kopfzeile und bis zu zehn Beispielzeilen, nicht die ganze Datei. Die Zustimmung gilt einmal pro Konto.
4. Prüfe in der Vorschau, welche Spalte Datum, Betrag und Beschreibung ist. Ist etwas falsch, tippst du auf die Zuordnung und korrigierst sie.
5. Prüfe Kategorien, wähle unnötige Zeilen ab und tippe auf **Importieren**.

Hat schon jemand eine Datei mit derselben Spaltenstruktur importiert, erkennt die App das Layout wieder, ohne die KI zu fragen.

## Was passiert mit Duplikaten und Fremdwährungen?

| Frage | Antwort |
|---|---|
| Kosten | CSV-Import mit KI-Spaltenerkennung ist kostenlos; nur das Auslesen von PDFs per KI gehört zu Pro |
| Doppelte Umsätze | Die App vergleicht Datum, Betrag und Währung mit vorhandenen Transaktionen und wählt Wiederholungen ab |
| Bereits per Benachrichtigung erfasst | Eine Ausgabe, die die App schon aus der N26-Benachrichtigung angelegt hat, wird als dieselbe Transaktion erkannt und zum Zusammenführen vorgeschlagen |
| Rückgängig machen | Den ganzen Import machst du 30 Tage lang im Importverlauf rückgängig |
| Konten mit voller Verschlüsselung | Die KI-Erkennung ist dort nicht verfügbar; die Spalten ordnest du selbst zu |

Prüfe vor dem Bestätigen ein paar Zeilen mit dem Original, vor allem Vorzeichen und Datumsformat.

## Geht es auch ohne CSV?

Ja. Auf Android kann die App N26-Zahlungen direkt aus der Push-Benachrichtigung erfassen, lokal auf dem Gerät und ohne Bankzugang. N26 steht auf der Liste der unterstützten Banking-Apps. Mehr dazu in [Ausgaben automatisch erfassen statt alles selbst eintippen](/blog/de/ausgaben-automatisch-erfassen/). Der CSV-Import ist dann vor allem für den Rückblick auf frühere Monate da.

Allgemeiner Leitfaden: [Kontoauszug importieren](/blog/de/kontoauszug-importieren/). Wenn deine Bank auf keiner Liste steht: [Kontoauszug von jeder Bank importieren](/blog/de/kontoauszug-von-jeder-bank-importieren/). Die App testest du auf [ai-budget.pl](https://ai-budget.pl).

## FAQ: N26 CSV-Export

**Kann ich den N26-Kontoauszug als CSV herunterladen?**

Die monatlichen Kontoauszüge gibt es nur als PDF. Als CSV exportierst du den Bericht über die Kontoaktivität mit frei gewähltem Zeitraum.

**Geht der CSV-Export in der N26-App?**

Die N26-Hilfe beschreibt den CSV-Export im Web-Banking. In der App findest du die PDF-Kontoauszüge.

**Kostet der Import der N26-CSV etwas?**

Nein. Die KI-Spaltenerkennung für CSV ist im kostenlosen Plan enthalten.

**Gilt das auch für N26 in Österreich?**

Die Schritte stammen aus der deutschen N26-Hilfe. Das Web-Banking ist in beiden Ländern dasselbe Produkt, die Menünamen können sich aber unterscheiden.

**Kann ich den Import rückgängig machen?**

Ja, im Importverlauf unten auf dem Importbildschirm, 30 Tage lang.
