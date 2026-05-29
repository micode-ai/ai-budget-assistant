# Chat-Bots — Telegram & WhatsApp

> Verwalte deine Finanzen direkt aus Telegram oder WhatsApp. Chatte mit KI, füge Ausgaben hinzu, scanne Belege und sende Sprachnachrichten — ohne die App zu öffnen.

## Übersicht

Verbinde dein Konto mit **Telegram**, **WhatsApp** oder mit beiden gleichzeitig. Beide Bots bieten identische Funktionen — nutze den Messenger deiner Wahl.

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

> Telegram und WhatsApp können gleichzeitig mit demselben Konto verbunden werden.

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

> Bei **WhatsApp** funktionieren Befehle mit oder ohne `/`.

## Belegscan

1. Fotografiere einen Beleg und sende ihn dem Bot
2. Der Bot erkennt Betrag, Datum und Händler
3. Falls das Datum falsch ist — sende das korrekte im Format `TT.MM.JJJJ`
4. Bestätige oder storniere

## Mehrere Konten

- Erwähne den Kontonamen in deiner Nachricht für eine einmalige Abfrage
- Nutze `/account` um das Standardkonto dauerhaft zu wechseln

## KI-Anfragekosten

| Aktion | KI-Anfragen |
|---|---|
| Textnachricht / KI-Chat | 1 |
| Sprachnachricht | 2 |
| Belegfoto | 2 |

---

*Siehe auch: [KI-Chat](./07-ai-chat.md) | [Konten](./09-accounts.md) | [Einstellungen](./11-settings.md)*
