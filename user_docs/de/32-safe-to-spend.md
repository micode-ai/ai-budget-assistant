# Vorausplanung — Sicher ausgeben, Leistbarkeit & Auto-Erfassung

> Drei Tools, die zusammenarbeiten, damit du sicher ausgeben kannst: eine tägliche Budgetzahl, eine „Kann ich mir das leisten?"-Chatfrage und automatische Ausgabenerfassung aus Bank-Benachrichtigungen (nur Android).

## Sicher ausgeben heute

Der Startbildschirm-Hero zeigt eine Zahl **Sicher ausgeben** — den Betrag, den du heute ausgeben kannst und dabei alle bekannten Verpflichtungen bis Monatsende noch abdeckst.

### Was einberechnet wird

Die Zahl wird berechnet aus:
- **Kontostand** — deine aktuellen Guthaben über alle Währungen, umgerechnet in deine Anzeigewährung.
- **Bevorstehende Abonnements** — aktive Abonnements, die vor Monatsende verlängert werden (aus dem Abonnement-Manager).
- **Bevorstehende wiederkehrende Ausgaben** — Ausgaben im Wochen-, Monats- oder Jahresrhythmus, die vor Monatsende fällig sind.
- **Sparziel-Beiträge** — der tägliche Betrag, der nötig ist, um deine Sparziele im Plan zu halten.
- **Erwartetes Einkommen** — wenn die App ein regelmäßiges monatliches Einkommen erkennt (gleicher Betrag, ~30-Tage-Abstand, mindestens zweimal in den letzten 90 Tagen), wird es als erwartetes Einkommen hinzugefügt und der nächste Zahltag als Horizont verwendet.

### Formel

```
Sicher ausgeben = (Kontostand + Erwartetes Einkommen − Verpflichtungen) ÷ Verbleibende Tage
```

Das Ergebnis wird auf null begrenzt — du siehst nie eine negative Zahl. Wenn die Verpflichtungen den Kontostand übersteigen, zeigt die Zahl 0 mit einem erklärenden Hinweis.

### Aufschlüsselung

Tippe auf die Zahl, um ein Aufschlüsselungsblatt zu öffnen, das jede Komponente zeigt: Kontostand, erwartetes Einkommen, bevorstehende Abonnements, wiederkehrende Ausgaben und Sparziel-Beiträge. Alle Beträge sind in deiner Anzeigewährung; ein Hinweis erscheint, wenn eine Umrechnung einen Näherungskurs verwendet hat.

### Widget

„Sicher ausgeben" ist als Startbildschirm-Widget verfügbar. Du kannst es in **Einstellungen → Widgets** ein- oder ausblenden.

## Kann ich mir das leisten? (Leistbarkeits-Assistent)

Stelle im KI-Chat Fragen wie „Kann ich mir einen Flug für 200 € leisten?" oder „Kann ich einen neuen Laptop für 3500 zł kaufen?". Der Chat verwendet dieselbe Engine wie „Sicher ausgeben" und gibt ein eindeutiges Ja oder Nein zurück — die KI erläutert nur das Ergebnis, sie rät nie.

Mögliche Antworten:
- **Ja** — der Betrag liegt im heutigen sicheren Budget.
- **Ja, aber knapp** — es passt in dein verfügbares Guthaben, verbraucht aber den Großteil davon.
- **Nein** — es übersteigt dein verfügbares Guthaben.
- **Ja, aber verzögert ein Ziel** — leistbar, aber dein Sparziel „X" verschiebt sich um ca. N Tage.
- **Warte bis zum Zahltag** — leistbar nach dem nächsten erwarteten Einkommenseingang (das vorgeschlagene Datum wird angezeigt).

## Android-Auto-Erfassung

Auf Android kann die App automatisch eine Ausgabe aus den Push-Benachrichtigungen deiner Bank erstellen — damit du keine Transaktion verpasst, auch wenn du gerade nicht in der App bist.

### So aktivierst du es

1. Gehe zu **Einstellungen → Transaktionen importieren → Auto-Erfassung (Android)**.
2. Lies den Datenschutzhinweis und tippe auf **Aktivieren**.
3. Die App öffnet die Systemeinstellungen für den Benachrichtigungszugriff. Suche **AI Budget Assistant** in der Liste und aktiviere es.
4. Kehre zur App zurück — der Status zeigt **Berechtigung erteilt**.

### Datenschutz

Der Benachrichtigungstext wird **ausschließlich auf deinem Gerät** verarbeitet. Händlername, Betrag und Währung werden lokal extrahiert; nur die resultierende Ausgabe wird mit dem Server synchronisiert — der rohe Benachrichtigungstext wird nirgends gesendet.

### Unterstützte Banken (Europa)

Die Auto-Erfassung funktioniert mit Benachrichtigungen von großen Privatkundenbanken in ganz Europa. Unterstützte Länder: Polen (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), Deutschland/Österreich (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), Frankreich (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Spanien (BBVA, Santander, CaixaBank, Bankinter), Niederlande (ING, Rabobank, ABN AMRO, bunq), Ukraine (PrivatBank, monobank, Oschadbank) und Russland (Sberbank, Tinkoff, Alfa-Bank). Die grenzüberschreitenden Neobanken Revolut und N26 werden ebenfalls unterstützt. Die vollständige Liste der unterstützten Apps wird auf dem Auto-Erfassungs-Bildschirm angezeigt.

**Hinweis zu Händlerkategorien:** Für Banken außerhalb Polens wird möglicherweise keine Kategorie automatisch vorgeschlagen. Der Ausgabe wird ohne Kategorie erfasst und kann manuell korrigiert werden — die App lernt aus Ihren Korrekturen.

### Deduplizierung

Wenn eine Benachrichtigung mehrfach zugestellt wird oder du dieselbe Transaktion auch per CSV importierst, dedupliziert die App automatisch. Jede erfasste Benachrichtigung erhält einen eindeutigen Fingerabdruck; Duplikate werden still verworfen.

### Erfassungen prüfen

Tippe auf den Erfassungshinweis („54 zł erfasst · Żabka — zum Prüfen tippen"), um die Ausgabendetails zu öffnen und Betrag, Händler und Kategorie vor der Synchronisierung zu prüfen oder zu korrigieren.

### Nur Android

Die Auto-Erfassung ist eine Android-Funktion. Auf iOS und im Web erscheint dieser Bereich nicht. Eine Alternative für iOS ist das Scannen eines Belegfotos über die bestehende Belegerfassung.
