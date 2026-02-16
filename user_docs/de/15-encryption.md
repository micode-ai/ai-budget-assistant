# Ende-zu-Ende-Verschlusselung

> Schutze deine Finanzdaten mit Ende-zu-Ende-Verschlusselung (E2EE). Alle sensiblen Informationen werden auf deinem Gerat verschlusselt, bevor sie an den Server gesendet werden — niemand ausser dir (und deinen gemeinsamen Kontomitgliedern) kann sie lesen.

## Uberblick

Ende-zu-Ende-Verschlusselung stellt sicher, dass deine Beschreibungen, Notizen, Kategorienamen und andere Textdaten auf deinem Gerat verschlusselt werden, bevor sie synchronisiert werden. Der Server speichert nur verschlusselte Daten und kann sie nicht lesen, selbst wenn die Datenbank kompromittiert wird.

Du kontrollierst die Verschlusselung mit einer separaten **Verschlusselungs-Passphrase**, die niemals an den Server gesendet wird.

## Verschlusselung einrichten

1. Offne **Einstellungen**
2. Scrolle zum Abschnitt **Sicherheit**
3. Tippe auf **Verschlusselung aktivieren**
4. Gib eine **Verschlusselungs-Passphrase** ein (mindestens 8 Zeichen)
   - Diese ist getrennt von deinem Anmeldepasswort
   - Wahle eine starke Passphrase, die du dir merken kannst
5. Bestatige die Passphrase
6. Ein **Wiederherstellungsschlussel** wird auf dem Bildschirm angezeigt

> **Wichtig:** Speichere deinen Wiederherstellungsschlussel sofort! Schreibe ihn auf oder speichere ihn in einem Passwort-Manager. Format: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Dies ist der **einzige Weg**, deine Daten wiederherzustellen, wenn du die Passphrase vergisst.

Nach der Einrichtung ist die Verschlusselung automatisch fur dein aktuelles Konto aktiviert.

## Verschlusselung entsperren

Nach einem Neustart der App oder wenn deine Sitzung abgelaufen ist, wird die Verschlusselung gesperrt. Deine Daten sind weiterhin sicher gespeichert, aber verschlusselte Felder erscheinen leer, bis du entsperrst.

Zum Entsperren:

1. Offne **Einstellungen** > **Sicherheit**
2. Tippe auf **Verschlusselung entsperren**
3. Gib deine Verschlusselungs-Passphrase ein
4. Deine Daten werden wieder lesbar

## Was wird verschlusselt

Die Verschlusselung funktioniert in zwei Stufen:

### Stufe 1 — Textfelder (Standard)

| Daten | Verschlusselt |
|---|---|
| Ausgabenbeschreibungen und Notizen | Ja |
| Standortnamen | Ja |
| Belegdaten | Ja |
| Kategorienamen | Ja |
| Tag-Namen | Ja |
| Projektnamen und -beschreibungen | Ja |
| Budgetnamen | Ja |
| Betrage, Daten, Wahrungen | Nein — bleiben im Klartext |

**Server-Funktionen** (Analysen, Budget-Warnungen, KI-Insights) funktionieren weiterhin, da Betrage und Daten zuganglich bleiben.

### Stufe 2 — Vollstandige Verschlusselung (optional aktivierbar)

Alles aus Stufe 1, plus:

| Daten | Verschlusselt |
|---|---|
| Betrage (Ausgaben, Einkommen, Budgets) | Ja |
| Preise und Wechselkurse | Ja |
| Geldborsensalden | Ja |

> **Hinweis:** Bei Stufe 2 sind serverseitige Analysen und KI-Funktionen nicht verfugbar, da der Server keine Betrage lesen kann. Alle Analysen werden lokal auf deinem Gerat berechnet.

## Wiederherstellung

Wenn du deine Passphrase vergessen hast, aber deinen Wiederherstellungsschlussel besitzt:

1. Offne **Einstellungen** > **Sicherheit**
2. Tippe auf **Wiederherstellen**
3. Gib deinen Wiederherstellungsschlussel ein
4. Lege eine neue Passphrase fest
5. Ein neuer Wiederherstellungsschlussel wird generiert — speichere ihn erneut

## Verschlusselung zurucksetzen

Wenn du sowohl deine Passphrase als auch deinen Wiederherstellungsschlussel verloren hast:

1. Offne **Einstellungen** > **Sicherheit**
2. Tippe auf **Verschlusselung zurucksetzen** (roter Button)
3. Bestatige die Aktion

> **Warnung:** Zuvor verschlusselte Daten auf dem Server werden **dauerhaft unlesbar**. Lokale Daten auf deinem Gerat sind nicht betroffen. Du kannst die Verschlusselung mit einer neuen Passphrase erneut einrichten.

## Gemeinsame Konten

Wenn die Verschlusselung fur ein gemeinsames Konto aktiviert ist:

- Der **Kontoeigentumer** muss jedem Mitglied Verschlusselungsschlussel gewahren
- Neue Mitglieder konnen Metadaten (Betrage, Daten, Kategorien) sehen, aber **verschlusselte Textfelder nicht lesen**, bis der Eigentumer den Zugriff gewahrt
- Die Schlusselgewahrung erfolgt, wenn der Eigentumer die App offnet und ausstehende Mitglieder genehmigt
- Wenn ein Mitglied aus einem gemeinsamen Konto **entfernt** wird, werden die Schlussel aus Sicherheitsgrunden rotiert — das entfernte Mitglied kann neue Daten nicht mehr entschlusseln

## Auswirkungen auf App-Funktionen

| Funktion | Stufe 1 (Text) | Stufe 2 (Vollstandig) |
|---|---|---|
| Analysen und Diagramme | Funktioniert vollstandig | Lokale Berechnung |
| Budget-Warnungen | Funktioniert vollstandig | Nicht verfugbar |
| PDF/Excel-Berichte | Teilweise (leere Namen) | Nicht verfugbar |
| Monatliche Zusammenfassung | Funktioniert vollstandig | Nicht verfugbar |
| E-Mail-Berichte | Teilweise (leere Namen) | Nicht verfugbar |
| CSV-Export | Funktioniert vollstandig | Funktioniert vollstandig |
| Backup Export/Restore | Funktioniert vollstandig | Funktioniert vollstandig |
| KI-Chat | Teilweise (keine Beschreibungen) | Nicht verfugbar |
| KI-Insights | Teilweise | Nicht verfugbar |
| Ausgaben-Story | Teilweise | Nicht verfugbar |
| Spracheingabe | Funktioniert vollstandig | Funktioniert vollstandig |
| Belegerfassung | Funktioniert vollstandig | Funktioniert vollstandig |

## FAQ

- **F: Ist die Verschlusselungs-Passphrase dasselbe wie mein Anmeldepasswort?**
  **A:** Nein. Die Verschlusselungs-Passphrase ist separat und wird niemals an den Server gesendet. Dein Anmeldepasswort authentifiziert dein Konto; die Verschlusselungs-Passphrase schutzt deine Daten.

- **F: Was passiert, wenn ich meine Passphrase vergesse und den Wiederherstellungsschlussel verliere?**
  **A:** Zuvor verschlusselte Daten auf dem Server werden dauerhaft unlesbar. Du kannst die Verschlusselung zurucksetzen und neu beginnen, aber alte verschlusselte Daten konnen nicht wiederhergestellt werden.

- **F: Konnen die App-Entwickler meine verschlusselten Daten lesen?**
  **A:** Nein. Der Server speichert nur verschlusselte Datenblocke. Ohne deine Passphrase oder deinen Wiederherstellungsschlussel kann niemand deine Daten entschlusseln.

- **F: Verlangsamt die Verschlusselung die App?**
  **A:** Die Ersteinrichtung dauert einige Sekunden fur die Schlusselableitung. Danach ist das Ver- und Entschlusseln einzelner Felder nahezu sofort.

- **F: Kann ich die Verschlusselung nach der Aktivierung wieder deaktivieren?**
  **A:** Du kannst die Verschlusselung zurucksetzen, wodurch die Verschlusselungseinrichtung entfernt wird. Daten, die auf dem Server verschlusselt wurden, bleiben jedoch verschlusselt und werden unlesbar.

---

*Siehe auch: [Einstellungen](./11-settings.md) | [Konten](./09-accounts.md) | [Export & Berichte](./16-export-reports.md)*
