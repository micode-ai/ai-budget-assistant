# Transaktionen aus Ihrer Bank importieren

> Importieren Sie Transaktionen direkt aus CSV-Exporten polnischer Großbanken oder einer beliebigen Bank mithilfe des universellen Spalten-Mappers.

## Unterstützte Banken

Sie können Transaktionen direkt aus CSV-Exporten der wichtigsten polnischen Banken importieren: **mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA**. Für jede andere Bank ermöglicht der universelle Spalten-Mapper, das Format manuell zu beschreiben.

## So importieren Sie

1. Gehen Sie zu **Einstellungen → Transaktionen importieren**
2. Wählen Sie Ihre Bank aus der Liste (oder „Andere (benutzerdefiniertes CSV)" für nicht unterstützte Banken)
3. Wählen Sie die CSV-Datei aus, die Sie aus Ihrem Online-Banking exportiert haben
4. Die App zeigt eine Vorschau, in der jede Zeile als Ausgabe, Einnahme oder Währungstausch markiert ist
5. Deaktivieren Sie nicht gewünschte Zeilen und tippen Sie auf **Importieren**

Die App merkt sich, welche Zeilen bereits importiert wurden (anhand von Datum, Betrag und Beschreibung) — das zweimalige Hochladen derselben CSV-Datei erzeugt keine Duplikate.

## Wo Sie die CSV-Datei in Ihrer Bank finden

- **mBank**: Online-Banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Lista operacji → Pobierz → CSV
- **ING Bank Śląski**: Moje ING → Historia → Eksportuj → CSV
- **Bank Millennium**: Web → Historia rachunku → Eksport → CSV
- **Pekao SA**: Pekao24 → Historia → Eksport → CSV

## Was importiert wird

Jede Zeile wird entweder zu einer Ausgabe, einer Einnahme oder einem Währungstausch (wenn die App eine gepaarte FX-Transaktion am gleichen Datum in verschiedenen Währungen erkennt). Kategorien werden für bekannte Händler (Biedronka, Żabka, Orlen, Lidl usw.) automatisch vorgeschlagen — Sie können diese später ändern.

## „Andere" — universeller CSV-Mapper

Falls Ihre Bank nicht in der Liste ist, wählen Sie „Andere (benutzerdefiniertes CSV)". Die App zeigt eine Vorschau Ihrer Datei und fragt, welche Spalte Datum, Betrag und Beschreibung enthält. Sie können dieses Mapping mit einem Namen speichern — die nächste CSV-Datei mit demselben Spaltenformat wird automatisch importiert.

## Zeichenkodierung

Die App erkennt automatisch UTF-8 und Windows-1250 (die häufigste Kodierung polnischer Banken). Falls die Vorschau fehlerhafte polnische Zeichen anzeigt, wählen Sie die Kodierung im Mapper manuell aus.

---

*Siehe auch: [Wise-Import](./26-wise-import.md) | [Ausgaben und Einnahmen](./03-expenses-and-income.md) | [Einstellungen](./11-settings.md)*
