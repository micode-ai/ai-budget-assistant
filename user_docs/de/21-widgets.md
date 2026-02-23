# Startbildschirm-Widgets

> Fügen Sie Android-Widgets zu Ihrem Startbildschirm hinzu – für sofortigen Zugriff auf Ihre Ausgabendaten oder um Ausgaben zu erfassen, ohne die App zu öffnen.

## Was sind Widgets?

Widgets sind kleine interaktive Panels auf Ihrem Android-Startbildschirm. AI Budget Assistant bietet vier Widgets:

| Widget | Größe | Inhalt |
|--------|-------|--------|
| **Budget – Heute** | Klein | Heutige Ausgaben + Veränderung gegenüber gestern |
| **Budget – Woche** | Mittel | Balkendiagramm der letzten 7 Tage |
| **Budget – Übersicht** | Groß | Budgetfortschritt + Top-Ausgabenkategorien |
| **Budget – Schnell hinzufügen** | Kompakter Streifen | Drei Schaltflächen |

> **Nur Android.** iOS unterstützt keine Startbildschirm-Widgets. Alle Funktionen sind in der App verfügbar.

---

## So fügen Sie ein Widget hinzu

1. **Halten** Sie eine leere Stelle auf dem Startbildschirm gedrückt
2. Tippen Sie auf **Widgets**
3. Scrollen Sie zu **AI Budget Assistant**
4. **Halten** Sie das gewünschte Widget gedrückt und ziehen Sie es auf den Startbildschirm
5. Lassen Sie los, um es zu platzieren

---

## Budget – Heute (Klein)

Schnelle Tagesübersicht:

- **Heutiger Gesamtbetrag** der Ausgaben
- **Delta-Anzeige** – mehr oder weniger als gestern (grün = weniger, rot = mehr)

**Größe**: 110 × 40 dp. Tippen Sie auf das Widget, um die App zu öffnen.

---

## Budget – Woche (Mittel)

Wöchentliche Übersicht auf einen Blick:

- **Balkendiagramm** der Ausgaben für jeden der letzten 7 Tage
- **Heutiger Gesamtbetrag** unterhalb des Diagramms

**Größe**: 250 × 110 dp. Tippen Sie auf das Widget, um die App zu öffnen.

---

## Budget – Übersicht (Groß)

Ihr Finanz-Dashboard auf dem Startbildschirm:

- **Budgetfortschrittsbalken** für jedes aktive Budget
- **Top-Ausgabenkategorien** mit Beträgen für den aktuellen Zeitraum

**Größe**: 250 × 180 dp. Tippen Sie auf das Widget, um die App zu öffnen.

---

## Budget – Schnell hinzufügen

Starten Sie die Ausgabenerfassung mit einem Tipp – ohne die App zu öffnen.

```
┌──────────────────────────────────────────────┐
│  🎤 Sprache  │  📷 Scannen  │  ✏️ Manuell  │
└──────────────────────────────────────────────┘
```

| Schaltfläche | Aktion |
|-------------|--------|
| 🎤 **Sprache** | Öffnet die Sprachaufnahme |
| 📷 **Scannen** | Öffnet den Belegscanner |
| ✏️ **Manuell** | Öffnet das Formular zur manuellen Eingabe |

**Größe**: 250 × 60 dp. Kein Hintergrund-Refresh – keine Auswirkung auf den Akku.

---

## Aktualisierungsintervall

| Widget | Intervall |
|--------|-----------|
| Budget – Heute | Alle 30 Minuten |
| Budget – Woche | Alle 30 Minuten |
| Budget – Übersicht | Alle 30 Minuten |
| Budget – Schnell hinzufügen | Statisch |

---

## FAQ

**F: Warum erscheinen die Widgets nicht in der Widget-Auswahl?**
A: Stellen Sie sicher, dass die App installiert ist und Sie sich mindestens einmal angemeldet haben.

**F: Das Widget zeigt „Keine Daten". Was soll ich tun?**
A: Öffnen Sie die App und fügen Sie mindestens eine Ausgabe hinzu oder warten Sie auf den nächsten Synchronisierungszyklus. Unter **Einstellungen → Jetzt synchronisieren** können Sie die Synchronisierung manuell starten.

**F: Kann ich die Widgets in der Größe ändern?**
A: Heute und Schnell hinzufügen haben eine feste Größe. Woche kann horizontal, Übersicht horizontal und vertikal angepasst werden.
