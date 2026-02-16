# Export & Berichte

> Generiere PDF-, Excel- und CSV-Berichte deiner Finanzen. Sieh dir monatliche Ausgabenzusammenfassungen an, erstelle verschlüsselte Backups und erhalte automatisierte E-Mail-Zusammenfassungen.

## Überblick

Der Bildschirm **Export & Berichte** ermöglicht es dir, Finanzberichte zu generieren, monatliche Zusammenfassungen anzusehen, Berichte herunterzuladen/zu teilen und Daten-Backups zu verwalten. Greife darauf vom Analysen-Tab über die Schaltfläche **Bericht exportieren** zu, oder über **Einstellungen** > **Berichte & E-Mail** > **Bericht generieren**.

## Berichtsformate

Drei Exportformate verfügbar:

| Format | Beschreibung | Verfügbarkeit |
|---|---|---|
| **CSV** | Kommagetrennte Werte, kompatibel mit Excel und Google Sheets | Alle Pläne |
| **PDF** | Formatierter Bericht mit Zusammenfassung, Kategorieaufschlüsselung und Transaktionsliste | Pro & Business |
| **Excel** | Mehrblatt-Arbeitsmappe mit Zusammenfassung, Ausgaben und Einkommensblättern | Pro & Business |

## Einen Bericht generieren

1. Wähle ein **Format** (CSV, PDF oder Excel)
2. Wähle einen **Zeitraum** (Letzte Woche, Dieser Monat, Letztes Quartal, Dieses Jahr)
3. Tippe auf **Generieren**
4. Sobald fertig, erscheint der Bericht in den kürzlich erstellten Berichten unten
5. Tippe auf einen Bericht, um ihn herunterzuladen und zu teilen

Berichte werden 7 Tage gespeichert und dann automatisch gelöscht.

## Monatliche Zusammenfassung (Pro+)

Eine Momentaufnahme deiner aktuellen Monatsfinanzaktivität:

- **Gesamteinkommen** und **Gesamtausgaben**
- **Sparquote** — Prozentsatz des gesparten Einkommens
- **Top-Kategorien** — deine größten Ausgabenkategorien mit Beträgen
- Daten werden 7 Tage zwischengespeichert und automatisch aktualisiert

## Kürzlich erstellte Berichte

Eine Liste deiner kürzlich generierten Berichte mit:

- Formatsymbol (CSV/PDF/Excel)
- Dateiname und Erstellungsdatum
- Dateigröße
- Tippen zum Herunterladen und Teilen über das System-Teilen-Blatt

## Daten-Backup

Verfügbar in **allen Plänen**:

- **Backup exportieren** — erstellt ein vollständiges JSON-Backup deiner Kontodaten (Ausgaben, Einkommen, Budgets, Kategorien, Tags, Projekte, Geldbörsen usw.)
- **Backup wiederherstellen** — importiere ein zuvor exportiertes Backup
- Wenn Verschlüsselung aktiviert ist, werden verschlüsselte Felder unverändert im Backup enthalten

Greife auf Backups über **Einstellungen** > **Berichte & E-Mail** zu.

## E-Mail-Berichte

Automatisierte E-Mail-Zusammenfassungen, die in deinen Posteingang geliefert werden:

| Funktion | Beschreibung | Erforderlicher Plan |
|---|---|---|
| **Wöchentliche E-Mail-Zusammenfassung** | Wöchentliche Ausgabenübersicht mit Top-Kategorien | Business |
| **Monatliche E-Mail-Zusammenfassung** | Monatliche Zusammenfassung mit Monat-zu-Monat-Vergleich | Pro & Business |

Konfiguriere diese in **Einstellungen** > **Berichte & E-Mail**:

- Schalte wöchentliche/monatliche E-Mails ein/aus
- Wähle den Wochentag für wöchentliche Berichte (standardmäßig Montag)

## Verschlüsselung & Berichte

- **Stufe 0** (keine Verschlüsselung) — alle Daten werden korrekt in Berichten angezeigt
- **Stufe 1** (Textverschlüsselung) — Beträge werden korrekt angezeigt; Kategorienamen und Beschreibungen können in vom Server generierten Berichten leer erscheinen. Die monatliche Zusammenfassung löst Kategorienamen aus deinen lokalen Gerätedaten auf
- **Stufe 2** (vollständige Verschlüsselung) — Berichte sind nicht verfügbar (Beträge sind serverseitig verschlüsselt)

## FAQ

- **F: Warum sehe ich leere Kategorienamen in meinem PDF-Bericht?**
  **A:** Wenn du E2EE aktiviert hast (Stufe 1), sind Kategorienamen auf dem Server verschlüsselt. Der vom Server generierte Bericht kann sie nicht entschlüsseln. Beträge bleiben genau.

- **F: Wie lange werden Berichte gespeichert?**
  **A:** Berichte werden nach 7 Tagen automatisch gelöscht. Lade sie zeitnah nach der Generierung herunter.

- **F: Kann ich Daten von einem gemeinsamen Konto exportieren?**
  **A:** Ja, jedes Kontomitglied kann Berichte und Backups für das gemeinsame Konto generieren.

- **F: Was ist in einem Backup enthalten?**
  **A:** Alles: Ausgaben, Einkommen, Budgets, Kategorien, Tags, Projekte, Geldbörsen, Überweisungen und Währungsumrechnungen für das aktuelle Konto.

---

*Siehe auch: [Analysen](./06-analytics.md) | [Einstellungen](./11-settings.md) | [Abonnement-Pläne](./12-subscription.md) | [Verschlüsselung](./15-encryption.md)*
