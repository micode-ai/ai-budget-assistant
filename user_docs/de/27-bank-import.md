# Transaktionen aus Ihrer Bank importieren

> Importieren Sie Transaktionen aus einem CSV- oder PDF-Kontoauszug Ihrer Bank oder aus einer beliebigen Bank über den universellen Spaltenzuordner.

## Unterstützte Banken

- **mBank** — CSV-Export
- **PKO BP** — CSV-Export
- **Erste Bank** — PDF-Kontoauszug
- **Alior Bank** — PDF-Kontoauszug
- **Wise** — CSV-Export (siehe [Wise-Import](./26-wise-import.md))
- **Other** — beliebige Bank, über den universellen Spaltenzuordner (CSV)

Weitere Banken werden laufend hinzugefügt. Wenn Ihre Bank noch nicht aufgeführt ist, verwenden Sie **Other** und ordnen Sie die Spalten manuell zu.

## So importieren Sie

1. Gehen Sie zu **Einstellungen → Transaktionen importieren**
2. Wählen Sie Ihre Bank aus der Liste (oder **Other (custom CSV)**, wenn sie nicht aufgeführt ist)
3. Wählen Sie die aus Ihrer Bank exportierte Datei — eine **CSV**-Datei für mBank/PKO, einen **PDF**-Kontoauszug für Erste/Alior
4. Die App zeigt eine Vorschau, in der jede Zeile als Ausgabe, Einnahme oder Währungsumtausch markiert ist
5. Deaktivieren Sie alle Zeilen, die Sie nicht möchten, und tippen Sie dann auf **Importieren**

Die App überspringt Zeilen, die in Ihrem Konto bereits vorhanden sind — egal ob Sie diese früher importiert oder manuell eingegeben haben — indem sie Datum, Betrag und Währung abgleicht. Dadurch entstehen beim Import keine Duplikate. Abgeglichene Zeilen sind standardmäßig nicht ausgewählt; aktivieren Sie eine solche Zeile, wenn es sich tatsächlich um eine separate Transaktion handelt.

## Wo Sie die Datei in Ihrer Bank finden

- **mBank**: Web-Banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)

## Was importiert wird

Jede Zeile wird zu einer Ausgabe, einer Einnahme oder einem Währungsumtausch (wenn die App eine gekoppelte Devisentransaktion am gleichen Datum in verschiedenen Währungen erkennt). Kategorien werden automatisch für bekannte Händler vorgeschlagen (Biedronka, Żabka, Orlen, Lidl, Rossmann usw.) — Sie können diese später ändern.

## „Other" — universeller CSV-Zuordner

Wenn Ihre Bank nicht in der Liste steht, wählen Sie **Other (custom CSV)**. Die App zeigt eine Vorschau Ihrer Datei und fordert Sie auf, die Spalten für Datum, Betrag und Beschreibung zu benennen. Sie können diese Zuordnung unter einem Namen speichern; die nächste CSV-Datei mit demselben Spaltenaufbau wird dann automatisch importiert.

## Ihre Bank nicht dabei?

Am unteren Ende von **Einstellungen → Transaktionen importieren** finden Sie eine Karte **„Ihre Bank nicht dabei?"**. Tippen Sie darauf, geben Sie den Namen Ihrer Bank ein und fügen Sie ein Beispiel des von ihr ausgegebenen Kontoauszugs bei (CSV oder PDF). Senden Sie die Anfrage, und wir werden die Unterstützung für diese Bank hinzufügen. Ihre Anfrage geht direkt an unser Team — sie wird nicht öffentlich gepostet.

## Zeichenkodierung

Bei CSV-Dateien erkennt die App automatisch UTF-8 und Windows-1250 (die am häufigsten verwendete Kodierung polnischer Banken). Wenn in der Vorschau polnische Zeichen unleserlich dargestellt werden, wählen Sie die Kodierung im Zuordner manuell aus. PDF-Kontoauszüge werden direkt gelesen — keine Kodierungsauswahl erforderlich.

---

*Siehe auch: [Wise-Import](./26-wise-import.md) | [Ausgaben und Einnahmen](./03-expenses-and-income.md) | [Einstellungen](./11-settings.md)*
