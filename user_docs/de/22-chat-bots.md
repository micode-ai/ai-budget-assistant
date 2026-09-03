# Chat-Bots — Telegram, WhatsApp & Slack

> Verwalte deine Finanzen direkt aus Telegram, WhatsApp oder Slack. Chatte mit KI, füge Ausgaben hinzu, scanne Belege und sende Sprachnachrichten — ohne die App zu öffnen.

## Übersicht

Verbinde dein Konto mit **Telegram**, **WhatsApp**, **Slack** oder einer beliebigen Kombination gleichzeitig. Alle drei Bots bieten identische Funktionen — nutze den Messenger deiner Wahl.

Zum Verbinden: **Einstellungen → Chat-Bots**.

## Konto verknüpfen

### Telegram
1. Tippe **Telegram verbinden** — ein 6-stelliger Code erscheint (10 Minuten gültig)
2. Öffne Telegram und suche den Bot
3. Sende `/link DEIN_CODE` (z.B. `/link A3F2B1`)
4. Du siehst „Konto erfolgreich verknüpft!"

### WhatsApp
1. Tippe **WhatsApp verbinden** — Code und QR-Code erscheinen
2. Tippe **WhatsApp öffnen** (Nachricht ist vorausgefüllt) oder scanne den QR-Code
3. Sende `link DEIN_CODE` an den Bot
4. Du siehst „Konto erfolgreich verknüpft!"

### Slack
1. Tippe **Slack verbinden** — ein 6-stelliger Code erscheint (10 Minuten gültig)
2. Öffne Slack, suche die App **AI Budget Assistant** und öffne eine Direktnachricht
3. Sende `link DEIN_CODE` (z.B. `link A3F2B1`)
4. Du siehst „Konto erfolgreich verknüpft!"

> Telegram, WhatsApp und Slack können alle gleichzeitig mit demselben Konto verbunden werden.

## Was du tun kannst

- **Ausgaben und Einnahmen hinzufügen**: schreibe natürlich oder nutze Befehle
- **KI-Chat**: stelle beliebige Finanzfragen — dieselbe KI wie in der App
- **Sprachnachrichten**: sprich deine Ausgabe oder Frage (2 KI-Anfragen pro Nachricht)
- **Belegfotos**: sende ein Foto zur automatischen Erkennung (2 KI-Anfragen)
- **KI-Nutzung prüfen**: `/usage`
- **Konto wechseln**: `/account`

## Befehle

| Befehl | Was er tut |
|---|---|
| `/link CODE` | Messenger mit App verknüpfen |
| `/expense 50 Mittagessen` | Ausgabe hinzufügen |
| `/income 3000 Gehalt` | Einnahme hinzufügen |
| `/usage` | KI-Nutzung anzeigen |
| `/account` | Aktives Konto wechseln |
| `/newchat` | Neues KI-Gespräch starten |
| `/unlink` | Bot trennen |
| `/help` | Alle Befehle anzeigen |

> Bei **WhatsApp** und **Slack** funktionieren Befehle mit oder ohne `/`. Du kannst auch einfach Betrag und Beschreibung eingeben: `50 Mittagessen`.

## Belegscan

1. Fotografiere einen Beleg und sende ihn dem Bot
2. Der Bot erkennt Betrag, Datum und Händler
3. Falls das Datum falsch ist — sende das korrekte im Format `TT.MM.JJJJ`
4. Bestätige oder storniere

### Erfasste Positionen korrigieren

Die Texterkennung liest manchmal einen Preis falsch, erfindet eine Position oder übersieht eine. Tippe auf **✏️ Positionen** (in WhatsApp: **✏️ Bearbeiten → Positionen**) und sende eine Korrektur pro Nachricht:

| Nachricht | Wirkung |
|---|---|
| `3 = 14,69` | setzt den Preis von Zeile 3 |
| `3: Roggenbrot` | benennt Zeile 3 um |
| `3 -` | löscht Zeile 3 |
| `+ Brot 5,99` | fügt eine Zeile hinzu |
| `= 233,98` | korrigiert die Belegsumme |

`14,69` und `14.69` funktionieren beide. Nach jeder Korrektur sendet der Bot die nummerierte Liste erneut, dazu eine Zeile `Positionen: … · Belegsumme: …` — weichen die beiden voneinander ab, ist auf dem Beleg noch etwas falsch gelesen. Die Kategorienaufteilung wird aus den korrigierten Zeilen neu berechnet, korrigiere daher bei einer Preisänderung auch die Summe.

Wenn du fertig bist, tippe auf **Ausgabe hinzufügen** — vorher wird nichts gespeichert, und ein Abbruch verwirft alle Korrekturen. Hier lassen sich nur die Zeilen und die Summe korrigieren; um die Kategorie einer Zeile zu ändern, öffne die Ausgabe in der App.

## Mehrere Konten

- Erwähne den Kontonamen in deiner Nachricht für eine einmalige Abfrage
- Nutze `/account` um das Standardkonto dauerhaft zu wechseln

## KI-Anfragekosten

| Aktion | KI-Anfragen |
|---|---|
| Textnachricht / KI-Chat | 1 |
| Sprachnachricht | 2 |
| Belegfoto | 2 |

## FAQ

**F: Kann ich Telegram, WhatsApp und Slack gleichzeitig verbinden?**
Ja — sie sind unabhängige Verknüpfungen und funktionieren alle gleichzeitig.

---

*Siehe auch: [KI-Chat](./07-ai-chat.md) | [Konten](./09-accounts.md) | [Einstellungen](./11-settings.md)*
