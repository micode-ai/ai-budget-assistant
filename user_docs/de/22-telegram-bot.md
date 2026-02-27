# Telegram-Bot

> Verwalte deine Finanzen direkt aus Telegram. Chatte mit der KI, erfasse Ausgaben per Befehl, scanne Belege und nutze Sprachnachrichten — alles ohne die App zu offnen.

## Uberblick

Der **Telegram-Bot** ermoglicht die Interaktion mit deinem KI-Budgetassistenten direkt aus Telegram. Verknupfe dein Konto einmalig und du kannst Ausgaben verfolgen, Finanzfragen stellen und Budgets verwalten — direkt aus deinem Messenger.

## Konto verknupfen

1. Offne die App und gehe zu **Einstellungen**
2. Tippe auf **Telegram-Bot** im Bereich Integrationen
3. Tippe auf **Code generieren** — ein 6-stelliger Code erscheint (gultig fur 10 Minuten)
4. Offne Telegram und finde den Bot
5. Sende `/link CODE` (z. B. `/link A3F2B1`)
6. Du siehst eine Bestatigung: "Konto erfolgreich verknupft!"

> **Hinweis:** Jedes Telegram-Konto kann nur mit einem App-Konto verknupft werden. Eine erneute Verknupfung ersetzt die vorherige Verbindung.

## Bot-Befehle

| Befehl | Beschreibung |
|---|---|
| `/start` | Willkommensnachricht und Einrichtungsanleitung |
| `/link CODE` | Telegram mit der App verknupfen |
| `/expense BETRAG BESCHR` | Schnell eine Ausgabe hinzufugen (z. B. `/expense 50 Mittagessen`) |
| `/income BETRAG BESCHR` | Schnell ein Einkommen hinzufugen (z. B. `/income 3000 Gehalt`) |
| `/account` | Zwischen Konten wechseln |
| `/newchat` | Ein neues KI-Gesprach starten |
| `/unlink` | Telegram vom Konto trennen |
| `/help` | Alle verfugbaren Befehle anzeigen |

## KI-Chat in Telegram

Sende eine beliebige Textnachricht an den Bot, und sie wird vom KI-Assistenten verarbeitet — demselben, der im KI-Chat-Tab der App verfugbar ist.

**Beispiele:**
- "Wofur habe ich diesen Monat am meisten ausgegeben?"
- "Zeige meine Ausgaben der letzten Woche"
- "Ausgabe 500₴ fur Lebensmittel hinzufugen"
- "Wie ist mein Budget-Status?"

Die KI unterstutzt alle Funktionen des In-App-Chats: naturlichsprachliche Befehle, Aktionsbestatigung, Kategorie-Aufschlusselung und Budgetanalyse.

## Automatische Kontoerkennung

Wenn du mehrere Konten hast (z. B. "Personlich" und "Familie"), erkennt die KI automatisch, wenn du einen Kontonamen in deiner Nachricht erwahnst, und fragt das richtige Konto ab.

**Beispiele:**
- "Zeige meine Ausgaben im Familienkonto" — fragt das Familienkonto ab
- "Wie viel habe ich fur Essen ausgegeben?" — fragt das Standardkonto ab
- "Ausgabe 100₴ fur Lebensmittel zum Familienkonto hinzufugen" — erstellt die Ausgabe im Familienkonto

> **Hinweis:** Dies andert nicht dauerhaft dein Standardkonto. Verwende `/account`, um das Standardkonto zu wechseln.

## Sprachnachrichten

1. Nimm eine Sprachnachricht in Telegram auf
2. Sende sie an den Bot
3. Der Bot transkribiert deine Sprache und verarbeitet sie als KI-Chat-Nachricht

Sprachnachrichten unterstutzen dieselben Befehle und Fragen wie Textnachrichten.

## Belege scannen

1. Fotografiere einen Beleg
2. Sende das Foto an den Bot
3. Der Bot scannt es per OCR und zeigt eine Zusammenfassung
4. Tippe auf **Bestatigen**, um die Ausgabe hinzuzufugen, oder **Abbrechen**, um abzulehnen

Du kannst Belegbilder auch als Dokumente senden (PDF oder Bilder).

## Konten wechseln

Wenn du mehrere Konten hast:

1. Sende `/account`
2. Der Bot zeigt alle deine Konten mit Inline-Schaltflachen
3. Tippe auf das Konto, zu dem du wechseln mochtest
4. Das aktive Konto ist mit einem Hakchen markiert

Alle nachfolgenden Befehle und KI-Anfragen verwenden das ausgewahlte Konto, bis du erneut wechselst.

## Wahrungsunterstutzung

Der Bot erkennt Wahrungssymbole und -codes in Befehlen:

| Symbol | Wahrung |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Beispiele:** `/expense 50$ Mittagessen`, `/expense 100₴ Lebensmittel`, `/expense 30 EUR Taxi`

## FAQ

- **F: Kann ich den Bot ohne Verknupfung verwenden?**
  **A:** Nein, du musst zuerst dein Telegram-Konto mit einem Code aus der App verknupfen.

- **F: Funktioniert der Bot in Gruppenchats?**
  **A:** Der Bot ist nur fur private (1:1) Gesprache konzipiert.

- **F: Welches Konto verwendet der Bot?**
  **A:** Der Bot verwendet dein Standardkonto (festgelegt bei der Verknupfung oder uber `/account`). Du kannst auch einen Kontonamen in deiner Nachricht erwahnen, und die KI verwendet automatisch dieses Konto fur die Abfrage.

- **F: Kann ich mehrere Telegram-Konten verknupfen?**
  **A:** Nein, jeder App-Benutzer kann ein verknupftes Telegram-Konto haben, und jedes Telegram-Konto kann mit einem App-Benutzer verknupft werden.

- **F: Zahlen Bot-Nachrichten zum KI-Anfragen-Limit?**
  **A:** Ja, jede KI-verarbeitete Nachricht (Text, Sprache) verbraucht eine Anfrage aus deinem monatlichen Kontingent.

---

*Siehe auch: [KI-Chat](./07-ai-chat.md) | [Konten](./09-accounts.md) | [Einstellungen](./11-settings.md)*
