# Ubersicht

> Deine Finanzzentrale. Sieh deinen Budgetstatus, Einkommen, Ausgaben und Geldborsensalden auf einen Blick, mit Schnellaktionen zum Hinzufugen von Ausgaben in einem Tipp. Du kannst einzelne Bereiche unter [Einstellungen](./11-settings.md) → Dashboard-Widgets ein- oder ausblenden.

## Uberblick

Die Ubersicht ist der erste Bildschirm, den du nach der Anmeldung siehst. Sie zeigt deinen aktuellen Kontokontext und wichtige Finanzkennzahlen fur den aktuellen Monat.

![Ubersicht mit Schnellaktionen und Budgetuberblick](../img/home-1.jpg)

## Konto wechseln

In der oberen linken Ecke tippe auf den Kontonamen (z.B. **Family**), um das **Konto wechseln**-Dropdown zu offnen. Du kannst zwischen deinen Personlichen, Gemeinsamen und Geschaftlichen Konten wechseln. Alle Daten auf der Ubersicht werden aktualisiert, um das ausgewahlte Konto widerzuspiegeln.

Neben dem Kontonamen gibt es eine separate **Währungsschaltfläche** (z.B. `zł`) — tippe darauf, um die Anzeigewährung sofort zu wechseln.

## Schnellaktionen

Die Schnellaktionen unterhalb des Headers sind ein Raster von Einzel-Tipp-Kurzbefehlen zu den häufigsten Aufgaben. Wenn mehr Aktionen vorhanden sind als in eine Zeile passen, werden sie in die nächste Zeile umgebrochen, sodass alle Aktionen sichtbar bleiben.

Verfügbare Aktionen:

| Aktion | Beschreibung |
|---|---|
| **Ausgabe hinzufugen** | Öffnet das manuelle Ausgabenformular |
| **Beleg scannen** | Öffnet die Kamera zum Fotografieren eines Belegs für KI-Extraktion |
| **Spracheingabe** | Sprich deine Ausgabe natürlich aus |
| **Einnahme per Sprache** | Sprich deine Einnahme natürlich aus (standardmäßig ausgeblendet) |
| **Rechnung scannen** | Fotografiere eine Rechnung, um eine Einnahme zu erfassen (standardmäßig ausgeblendet) |
| **Umtausch** | Öffnet das Währungsumtausch-Formular |
| **Konverter** | Öffnet den Währungsrechner |
| **Überweisungen** | Öffnet das Formular für Geldbörsen-Überweisungen |

Du kannst diese Leiste anpassen: Gehe zu **Einstellungen → Dashboard-Widgets**, öffne den Bereich **Schnellaktionen**, aktiviere oder deaktiviere beliebige Aktionen und ziehe die Griffe, um sie neu anzuordnen. **Einnahme per Sprache** und **Rechnung scannen** sind standardmäßig ausgeblendet — aktiviere sie dort, wenn du Einnahmen per Sprache oder Rechnungsscan erfasst.

## Finanzielle Gesundheit

Das Widget **Finanzielle Gesundheit** zeigt eine einzelne Punktzahl von 0–100, die Ihre finanzielle Gesundheit im aktuellen Monat zusammenfasst:

- **Grün (70–100)** — Finanzen sind in ausgezeichnetem Zustand
- **Gelb (40–69)** — Einige Bereiche brauchen Aufmerksamkeit
- **Rot (0–39)** — Erhebliche Probleme erkannt

Die Kreisanzeige oben rechts auf der Karte füllt sich proportional zur Punktzahl. Tippen Sie auf die Karte, um eine Detailansicht mit vier Komponenten zu öffnen:

| Komponente | Max Pkt | Beschreibung |
|---|---|---|
| Budgeteinhaltung | 25 | % der aktiven Budgets, die das Limit nicht überschreiten |
| Sparquote | 25 | Bildet Ihren monatlichen Sparanteil linear ab (0% → 0 Pkt, 20%+ → 25 Pkt) |
| Zielfortschritt | 25 | % der aktiven Sparziele auf dem Weg zum Zieldatum |
| Schuldengesundheit | 25 | Proportionaler Abzug für überfällige Schulden |

> **„Nicht genug Daten"** erscheint, wenn weniger als zwei Komponenten Daten haben (z.B. ein brandneues Konto ohne Budgets, Ziele, Schulden oder Einkommen).

Die Punktzahl wird vollständig lokal berechnet – keine Internetverbindung oder KI-Anfragen erforderlich.

## Gamification-Widget

Unterhalb der Schnellaktionen zeigt eine kompakte Gamification-Karte deinen Fortschritt:

- **Level** — dein aktuelles Level mit einem XP-Fortschrittsbalken (z.B. **Level 4 — 60/100 XP**)
- **Serie** — deine aktuelle tagliche Erfassungsserie mit Flammen-Emoji (z.B. **5 Tage**)

Tippe auf das Widget, um den vollstandigen **Erfolge**-Bildschirm zu offnen, wo du alle Abzeichen, Kategorien und deinen Gesamtfortschritt einsehen kannst.

> **Hinweis:** Das Widget erscheint automatisch fur alle Nutzer — keine Einrichtung erforderlich.

## Monatsbudget-Karte

- Zeigt deine aktuellen Ausgaben im Verhaltnis zu deinem Monatsbudget (z.B. **2 846,83 zl von 20 000,00 zl**)
- Farbcodierter Fortschrittsbalken: grun (unter Kontrolle), gelb (Limit nahert sich), rot/orange (nahe am oder uber dem Budget)
- Zeigt den **verbrauchten Prozentsatz** an (z.B. 86% verbraucht)
- Tippe auf die Karte, um zum **Budgets**-Tab zu navigieren

> **Hinweis:** Wenn kein Monatsbudget festgelegt ist, siehst du einen Hinweis, eines zu erstellen.

## Einnahmen & Ausgaben

![Ubersicht gescrollt — Einkommen, Ausgaben, Geldborse](../img/home-2.jpg)

Eine kombinierte Karte mit deinen monatlichen Summen nebeneinander:

- **Einnahmen** (links, grun) — dein Gesamteinkommen fur den aktuellen Monat (z.B. **+2.482,52 $**). Tippe, um zum **Transaktionen**-Tab (Einkommen-Ansicht) zu gelangen
- **Ausgaben** (rechts) — deine Gesamtausgaben fur den aktuellen Monat (z.B. **-4.838,99 $**). Tippe, um zum **Transaktionen**-Tab (Ausgaben-Ansicht) zu gelangen

## Nettogewinn

Unterhalb der Einkommen- und Ausgabenkarten zeigt das **Nettogewinn**-Widget, wie viel Geld du in diesem Monat tatsachlich gespart oder verloren hast, und verfolgt den Trend der letzten 6 Monate als Liniendiagramm:

- **Nettogewinn des aktuellen Monats** — wird oberhalb des Diagramms grun (positiv) oder rot (negativ) angezeigt
- **6-Monats-Trend** — Liniendiagramm mit dem monatlichen Nettogewinn (Einkommen − Ausgaben) der letzten 6 Monate
- Tippe auf einen Datenpunkt, um den genauen Wert fur diesen Monat zu sehen

> **Formel:** Nettogewinn = Gesamteinkommen − Gesamtausgaben (beide in Basiswahrung umgerechnet)

## Nettokapital

Das **Nettokapital**-Widget zeigt dein gesamtes Nettovermogen uber alle Wahrungsgeldborsen, umgerechnet in deine Basiswahrung:

- **Gesamtes Nettokapital** — Summe aller Geldborsensalden in der eingestellten Wahrung, grun (positiv) oder rot (negativ)
- **Aufschlusselung nach Wahrung** — der aktuelle Saldo jeder Wahrung wird darunter aufgefuhrt

> **Hinweis:** Das Nettokapital-Widget erscheint erst, nachdem du deine anfanglichen Geldborsensalden gesetzt hast. Siehe [Geldborse & Umtausch](./10-wallet-and-exchange.md) zur Einrichtung.

## Fat-Finder-Karte

Unterhalb des Schuldenbereichs zeigt die **Fat-Finder**-Karte eine Zusammenfassung deiner monatlichen Ausgabenprufung:

- **Gesamtes Einsparpotenzial** — wie viel du pro Monat sparen konntest
- **Die 3 wichtigsten Befunde** — Kurzliste mit Schweregrad-Punkten und Einsparungsbetragen
- **Vollstandigen Bericht anzeigen** — tippe, um den detaillierten Fat-Finder-Bildschirm zu offnen

Diese Karte erfordert ein **Pro- oder Business-Abonnement**. Nutzer des kostenlosen Plans sehen eine Upgrade-Aufforderung.

> Siehe [Fat Finder](./19-fat-finder.md) fur die vollstandige Funktionsbeschreibung.

## Kalender

Das **Kalender**-Widget zeigt ein monatliches Kalenderraster mit farbigen Punkten an, die Tage mit Transaktionen markieren:

- **Grüner Punkt** — an diesem Tag wurde eine Einnahme erfasst
- **Roter Punkt** — an diesem Tag wurde eine Ausgabe erfasst
- **Heute** wird mit einem orangefarbenen Kreis hervorgehoben
- **Monatsnavigation** — Pfeile nach links/rechts zum Wechseln zwischen Monaten

Unter dem Kalenderraster wird eine Zusammenfassung angezeigt:

- **Einnahmen** — Gesamteinnahmen für den ausgewählten Monat (in Basiswährung umgerechnet)
- **Ausgaben** — Gesamtausgaben für den ausgewählten Monat
- **Nettogewinn** — Einnahmen minus Ausgaben, grün bei positivem, rot bei negativem Ergebnis

Tippen Sie auf **Tippen für Details**, um den vollständigen Kalenderbildschirm mit drei Registerkarten zu öffnen:

| Registerkarte | Inhalt |
|---|---|
| **Kategorien** | Aufschlüsselung von Einnahmen und Ausgaben nach Kategorien — jede Zeile zeigt Kategorie-Symbol, Name, Prozentsatz und Betrag. Nettogewinn am Ende |
| **Konten** | Aktueller Saldo jeder Währungsbrieftasche mit Prozentanteil am Gesamtbetrag |
| **Transaktionen** | Chronologische Liste aller Transaktionen des Monats. Tippen Sie auf einen Tag im Kalender, um nach diesem Tag zu filtern; erneut tippen zum Aufheben des Filters |

> **Tipp:** Alle Beträge im Kalender werden automatisch in Ihre Basiswährung umgerechnet, sodass Sie auch bei mehreren Währungen genaue Gesamtbeträge sehen.

## Geldborsensalden

- Horizontal scrollbare Karten, die deinen Saldo in jeder Wahrung anzeigen (z.B. **EUR 16.723,00**, **PLN 2 192,89**, **USD 56...**)
- Tippe auf **Alle anzeigen**, um zur vollstandigen Geldborse-Ansicht mit detaillierten Aufschlusselungen zu gelangen
- Wenn keine Salden festgelegt sind, siehst du eine Aufforderung, deinen Anfangssaldo hinzuzufugen

## Zum Aktualisieren ziehen

Ziehe auf der Ubersicht nach unten, um alle Daten zu aktualisieren und mit dem Server zu synchronisieren.

## FAQ

- **F: Warum zeigt die Ubersicht uberall 0 $ an?**
  **A:** Du hast noch keine Ausgaben oder Einkommen hinzugefugt. Verwende die Schnellaktions-Schaltflachen, um deine erste Transaktion hinzuzufugen.

- **F: Kann ich anpassen, was auf der Ubersicht angezeigt wird?**
  **A:** Ja. Gehe zu **Einstellungen → Dashboard-Widgets** und schalte einzelne Bereiche ein oder aus. Deine Einstellungen werden gespeichert und bleiben nach Neustarts erhalten. Du kannst auch Widgets ziehen, um sie neu anzuordnen. Die Schnellaktionsleiste ist auf dieselbe Weise anpassbar — öffne den Bereich **Schnellaktionen** in Einstellungen → Dashboard-Widgets, um Schaltflächen ein- oder auszublenden oder neu anzuordnen.

---

*Siehe auch: [Ausgaben & Einkommen](./03-expenses-and-income.md) | [Geldborse & Umtausch](./10-wallet-and-exchange.md) | [Fat Finder](./19-fat-finder.md) | [Analysen](./06-analytics.md)*
