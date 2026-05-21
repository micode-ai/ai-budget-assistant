# Szenario-Simulator

> Schieberegler bewegen, um Ausgaben- und Einkommenskategorien anzupassen — und sofort sehen, wie sich die Ersparnisse über 3, 6 oder 12 Monate verändern.

## Übersicht

Der **Szenario-Simulator** beantwortet „Was wäre wenn?"-Fragen, ohne echte Daten zu verändern. Reduziere Lebensmittelausgaben um 20%, füge einen Nebenjob von 500 € hinzu — und sieh sofort, wie viel in 6 Monaten angespart werden könnte.

Alle Berechnungen erfolgen lokal. Es werden keine Daten gesendet, die Transaktionshistorie bleibt unverändert.

## Zugriff

Öffne den **Analyse**-Tab und tippe auf das **Szenario-Simulator**-Banner oben auf dem Bildschirm.

## Woher kommen die Beträge

Der Simulator verwendet die **letzten 3 Monate** an Transaktionen und berechnet einen monatlichen Durchschnitt pro Kategorie:

```
monatlicher Durchschnitt = Gesamtbetrag der Kategorie über 3 Monate ÷ 3
```

Alle Beträge werden mit aktuellen Wechselkursen in die Basiswährung umgerechnet.

## Ausgaben anpassen

Jede Ausgabenkategorie wird mit ihrem aktuellen monatlichen Durchschnitt und einem Schieberegler von **−100 %** bis **+100 %** in 5 %-Schritten angezeigt.

- Nach **links** ziehen (negativ) — Ausgaben reduzieren, Leiste wird grün
- Nach **rechts** ziehen (positiv) — Ausgaben erhöhen, Leiste wird rot
- Die Beschriftung zeigt den resultierenden Betrag

## Einkommen anpassen

Einkommenskategorien funktionieren genauso. Rechts = Erhöhung, Links = Reduzierung.

### Zusätzliches Einkommen hinzufügen

Tippe auf **Zusatzeinkommen hinzufügen**, um eine neue Einkommensquelle einzutragen (z. B. Freelance-Arbeit). Beschreibung und monatlichen Betrag eingeben. Mehrere Einträge möglich.

## Projektions-Diagramm

Das Diagramm zeigt die kumulativen Ersparnisse über den gewählten Zeitraum:

- **Graue Linie** — aktueller Pfad (keine Änderungen)
- **Farbige Linie** — Szenario-Pfad (mit Anpassungen)

Mit den Chips **3 / 6 / 12 Monate** kann der Horizont geändert werden.

## Zusammenfassungskarten

Drei Karten unter dem Diagramm zeigen die Szenario-Gesamtbeträge für 3, 6 und 12 Monate. Der aktuelle Horizont ist hervorgehoben. Jede Karte zeigt:

- Kumulative Ersparnisse laut Szenario
- Kumulative Ersparnisse laut aktuellem Pfad (zum Vergleich)
- Differenz

## Zusammenfassungsleiste (oben)

Die Karte ganz oben aktualisiert sich in Echtzeit:

| Linke Seite | Rechte Seite |
|---|---|
| Aktuelle monatliche Ersparnisse | Monatliche Ersparnisse laut Szenario |
| (unverändert) | ↑ oder ↓ Differenz |

## Szenario speichern

Tippe oben in der Aktionsleiste auf **Szenario speichern**, um den aktuellen Zustand aller Schieberegler und den Horizont unter einem Namen zu speichern (z. B. „Gastronomie −30 %"). Gespeicherte Szenarien bleiben auf dem Gerät erhalten.

- **Free-Plan**: bis zu 5 gespeicherte Szenarien
- **Pro / Business**: unbegrenzt

## Gespeichertes Szenario laden

Tippe auf **Gespeicherte Szenarien** (Ordner-Symbol) in der Aktionsleiste, um die Liste zu öffnen. Auf eine Zeile tippen stellt alle Schieberegler und den Horizont sofort wieder her. Zum Löschen das Papierkorb-Symbol in der jeweiligen Zeile antippen.

## Projektion teilen

Tippe unten auf **Teilen** (neben „Alles zurücksetzen"), um die native Teilen-Funktion mit einer Textzusammenfassung der aktuellen Projektion zu öffnen. Die Zusammenfassung enthält aktuelle und Szenario-Ersparnisse, die monatliche Differenz sowie die kumulativen Gesamtbeträge für den gewählten Horizont.

## Zurücksetzen

Tippe unten auf **Alles zurücksetzen**, um alle Schieberegler und Zusatzeinkommen auf null zu setzen. Gespeicherte Szenarien werden davon nicht berührt.

## FAQ

- **F: Verändern die Schieberegler meine echten Daten?**
  **A:** Nein. Der Simulator liest nur die Transaktionshistorie für Durchschnittswerte. Es wird nichts gespeichert oder verändert.

- **F: Warum sind die Kategoriebeträge niedriger als erwartet?**
  **A:** Die Beträge sind ein 3-Monats-Durchschnitt. War ein Monat ungewöhnlich günstig, fällt der Schnitt niedriger aus.

- **F: Eine Einkommenskategorie fehlt.**
  **A:** Nur Kategorien mit mindestens einer Transaktion in den letzten 3 Monaten werden angezeigt.

---

*Siehe auch: [Analyse](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Sparziele](./18-savings-goals.md)*
