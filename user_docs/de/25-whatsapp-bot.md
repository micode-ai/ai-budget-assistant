# WhatsApp Bot

> Verwalten Sie Ihre Finanzen direkt über WhatsApp. Chatten Sie mit der KI, erfassen Sie Ausgaben per Befehl, scannen Sie Belege und senden Sie Sprachnachrichten — ohne die App zu öffnen.

## Überblick

Der **WhatsApp Bot** ermöglicht die Nutzung des AI Budget Assistant aus WhatsApp. Verknüpfen Sie Ihr Konto einmal und verfolgen Sie Ausgaben, stellen Sie Finanzfragen und verwalten Sie Budgets — direkt aus Ihrem Messenger.

Der Bot funktioniert wie der [Telegram Bot](./22-telegram-bot.md): gleiche KI, gleiche Befehle, gleiche Multi-Konten-Unterstützung.

## Konto verknüpfen

1. App öffnen und zu **Einstellungen** gehen
2. **WhatsApp Bot** unter Integrationen antippen
3. **WhatsApp verbinden** antippen — ein 6-stelliger Code und ein QR-Code erscheinen (10 Minuten gültig)
4. Dann:
   - **WhatsApp öffnen** antippen — WhatsApp öffnet sich mit vorbereiteter Nachricht `link IHR_CODE`.
   - Oder QR-Code mit einem anderen Telefon scannen.
   - Oder Code kopieren und `link IHR_CODE` manuell an die WhatsApp-Nummer des Bots senden.
5. Bestätigung erscheint: „Konto erfolgreich verknüpft!"

> **Hinweis:** Eine WhatsApp-Nummer kann zu einem App-Konto verknüpft werden. Erneutes Verknüpfen ersetzt die vorherige Verbindung.

## Bot-Befehle

Befehle funktionieren mit oder ohne `/` — `expense 50 Mittagessen` und `/expense 50 Mittagessen` sind gleichwertig.

| Befehl | Beschreibung |
|---|---|
| `link CODE` | WhatsApp mit der App verknüpfen |
| `expense BETRAG BESCHR` | Ausgabe schnell hinzufügen |
| `income BETRAG BESCHR` | Einnahme schnell hinzufügen |
| `category [TYP] NAME` | Kategorie erstellen |
| `categories` | Kategorien auflisten und löschen |
| `usage` | KI-Nutzung und Limits ansehen |
| `account` | Zwischen Konten wechseln |
| `newchat` | Neues KI-Gespräch starten |
| `unlink` | WhatsApp trennen |
| `help` | Alle Befehle anzeigen |

## KI-Chat in WhatsApp

Senden Sie eine beliebige Nachricht — die KI verarbeitet sie.

**Beispiele:**
- „Wofür habe ich diesen Monat am meisten ausgegeben?"
- „Zeige meine Ausgaben der letzten Woche"

## Sprachnachrichten

Nehmen Sie eine Sprachnachricht in WhatsApp auf und senden Sie sie an den Bot. Kosten: 2 KI-Anfragen.

## Beleg-Scannen

1. Foto eines Belegs aufnehmen und an den Bot senden
2. Der Bot scannt es per OCR und zeigt eine Zusammenfassung
3. Bei falschem Datum **Datum ändern** antippen und im Format `TT.MM.JJJJ` senden
4. **Ausgabe hinzufügen** oder **Abbrechen** antippen

## Konten wechseln

`account` senden — Bot zeigt Konten als antippbare Liste.

## Währungsunterstützung

| Symbol | Währung |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

## FAQ

- **F: Bot ohne Verknüpfung nutzen?** **A:** Nein, zuerst Konto verknüpfen.
- **F: Funktioniert der Bot in Gruppenchats?** **A:** Nein. Nur 1:1.
- **F: WhatsApp und Telegram gleichzeitig?** **A:** Ja, unabhängige Verknüpfungen.
- **F: Zählen Nachrichten gegen das KI-Limit?** **A:** Ja. Chat: 1, Sprache/Belege: 2.
- **F: Welche Sprache verwendet der Bot?** **A:** Die in der App eingestellte.

---

*Siehe auch: [KI-Chat](./07-ai-chat.md) | [Telegram Bot](./22-telegram-bot.md) | [Einstellungen](./11-settings.md)*
