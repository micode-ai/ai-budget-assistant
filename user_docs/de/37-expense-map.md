# Ausgabenkarte

> Sieh deine Ausgaben auf einer Karte. Gescannte Kassenbons werden anhand der Filialadresse platziert; füge deinen Standort hinzu oder setze manuell einen Pin.

Sieh deine Ausgaben auf einer Karte. Ausgaben können einen Standort tragen — entnommen aus der auf einem gescannten Kassenbon aufgedruckten Filialadresse, vom GPS deines Telefons im Moment der Ausgabenerfassung, oder manuell gesetzt — und die App kann jede gefilterte Ausgabenliste als anklickbare Pins auf einer Karte anzeigen.

## Woher die Standorte stammen

Eine Ausgabe erhält ihren Standort aus einer von drei Quellen (die höherwertige gewinnt):

1. **Manueller Pin** — du platzierst oder verschiebst den Pin selbst auf dem Standort-Bildschirm der Ausgabe.
2. **Kassenbon-Adresse** — wenn du einen Kassenbon scannst, liest die App die darauf aufgedruckte Filialadresse und wandelt sie automatisch in Kartenkoordinaten um. Das funktioniert auch, wenn du den Beleg erst später zu Hause scannst.
3. **GPS zum Erfassungszeitpunkt** — optional kann die App im Hintergrund deine aktuelle Position anhängen, wenn du eine Ausgabe direkt vor Ort erfasst (manuelle Eingabe, Spracheingabe oder automatische Erfassung per Bank-Benachrichtigung).

Importierte Transaktionen (Bank-CSV-/PDF-Dateien) erhalten keinen Standort.

## GPS-Erfassung aktivieren

Die GPS-Erfassung ist **standardmäßig ausgeschaltet**. So aktivierst du sie:

1. Öffne **Einstellungen → Daten & Berichte**.
2. Schalte im Bereich **Standort** die Option **Standort an neue Ausgaben anhängen** ein.
3. Erlaube die Standortberechtigung, wenn das System danach fragt.

Ist die Option aktiviert, erhalten neue Ausgaben, die du unterwegs erfasst, automatisch deine aktuelle Position. Du kannst den Standort einer Ausgabe jederzeit einsehen und entfernen und den Schalter jederzeit wieder ausschalten.

## Kartenansicht im Tab „Ausgaben"

Tippe im Tab **Ausgaben** auf das Kartensymbol neben dem Suchsymbol, um von der Liste zur Karte zu wechseln. Die Karte zeigt dieselben Ausgaben wie die Liste — deine Zeitraum-, Kategorie- und Händlerfilter gelten weiterhin. Tippe erneut auf das Symbol, um zur Liste zurückzukehren.

- Nahe beieinanderliegende Ausgaben werden zu nummerierten Clustern gruppiert; tippe auf einen Cluster, um hineinzuzoomen.
- Tippe auf einen Pin, um Händler und Betrag zu sehen; tippe auf **Öffnen**, um zu dieser Ausgabe zu springen.
- Wenn einige gefilterte Ausgaben keinen Standort haben, zeigt ein kleiner Banner an, wie viele es sind.

## Standort im Ausgaben-Bildschirm

Hat eine Ausgabe einen Standort, zeigt ihr Detailbildschirm eine kleine Karte mit dem Pin und der Adresse (oder den Koordinaten). Von dort aus kannst du:

- **Standort bearbeiten** — öffnet eine Vollbildkarte, auf der du durch Antippen den Pin platzieren, ihn ziehen oder **Mein Standort** verwenden kannst, um zu deinem aktuellen Ort zu springen.
- **Standort entfernen** — das Papierkorb-Symbol neben der Karte entfernt den Pin mit einem Tipp.

Eine Ausgabe ohne Standort zeigt stattdessen eine Schaltfläche **Standort hinzufügen** (nur für Bearbeiter).

## Reisekarte

Reisekonten erhalten einen eigenen Einstiegspunkt: Öffne das Reisekonto und tippe auf **Reisekarte**. Die App wechselt zu dieser Reise und öffnet den Tab „Ausgaben" im Kartenmodus — ein visuelles Tagebuch, wohin das Geld der Reise geflossen ist. Kombiniert mit Kassenbon-Scan und GPS-Erfassung landen die meisten Reiseausgaben automatisch auf der Karte.

## Datenschutz

- Die GPS-Erfassung ist strikt Opt-in und standardmäßig ausgeschaltet; die Berechtigung wird erst angefragt, wenn du den Schalter aktivierst.
- Die Adresserkennung aus dem Kassenbon nutzt ausschließlich die auf dem Beleg aufgedruckte Adresse — dein Standort wird dabei nicht verwendet.
- Ein Standort ist Teil des Ausgabendatensatzes: Mitglieder eines gemeinsamen Kontos, die die Ausgabe sehen können, sehen auch ihren Standort.
- Du kannst den Standort jeder Ausgabe jederzeit entfernen.
