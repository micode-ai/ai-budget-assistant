# Wise-Import

> Übertragen Sie Ihre gesamte Wise-Transaktionshistorie in einem Schritt. Laden Sie einen CSV-Auszug hoch, und die App erstellt automatisch die passenden Ausgaben, Einnahmen und Währungsumrechnungen.

## Überblick

Wenn Sie Wise nutzen, können Sie mit **Wise-Import** einen ganzen Kontoauszug auf einmal in Ihr Konto übernehmen. Schluss mit dem einzelnen Abtippen — laden Sie einfach eine CSV von Wise herunter, übergeben Sie sie der App und prüfen Sie vor dem Bestätigen, was angelegt wird.

Der Import deckt drei Arten von Datensätzen ab:

- **Ausgaben** — Geld, das Ihr Wise-Guthaben verlassen hat (Abbuchungen)
- **Einnahmen** — Geld, das eingegangen ist (Gutschriften)
- **Währungsumrechnungen** — wenn Sie innerhalb von Wise zwischen Guthaben getauscht haben (z. B. USD → EUR)

Jede importierte Transaktion wird so markiert, dass die App weiß, dass sie aus Wise stammt — laden Sie denselben Auszug zweimal hoch, werden Duplikate automatisch erkannt und übersprungen.

## Schritt 1 — CSV aus Wise exportieren

1. Öffnen Sie Wise (Webanwendung unter **wise.com** oder die Wise-App).
2. Gehen Sie zu **Transactions → Statements and Reports**.
3. Wählen Sie den **Zeitraum** (bis zu 469 Tage pro Datei).
4. Wählen Sie **CSV** als Format und die gewünschte Währung / das gewünschte Guthaben.
5. Laden Sie die Datei auf Ihr Telefon herunter.

> **Tipp:** Wise erzeugt eine CSV pro Währung. Wenn Sie mehrere Währungen importieren möchten, wiederholen Sie den Export für jede und importieren Sie sie nacheinander.

## Schritt 2 — In der App importieren

1. Öffnen Sie die App und gehen Sie zu **Einstellungen → Wise-Import**.
2. Tippen Sie auf **CSV-Datei auswählen** und wählen Sie die heruntergeladene Datei.
3. Die App verarbeitet die Datei (meist unter einer Sekunde) und zeigt Ihnen eine Vorschau.

## Schritt 3 — Prüfen und bestätigen

Die Vorschau listet jede Transaktion aus der CSV mit einem Kontrollkästchen auf.

- **Ausgaben** werden mit einem roten Abwärts-Symbol dargestellt, **Einnahmen** mit einem grünen Aufwärts-Symbol, **Währungsumrechnungen** mit einem Tausch-Symbol und beiden Seiten der Umrechnung (z. B. `120.00 USD → 109.50 EUR`).
- Neben gängigen Händlern (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix usw.) erscheint ein kleiner **Vorschlag für eine Kategorie**. Wenn im aktiven Konto bereits eine Kategorie mit gleichem Namen existiert, wird sie automatisch zugeordnet.
- Bereits zuvor importierte Zeilen sind **abgeblendet und mit „Bereits importiert" markiert** — sie lassen sich nicht erneut auswählen, was Sie vor Duplikaten schützt.
- Haken Sie alles ab, was Sie nicht importieren möchten (z. B. Überweisungen zwischen Ihren eigenen Konten).

Wenn die Auswahl passt, tippen Sie auf **N Zeilen importieren**. Die App schreibt alles in einer einzigen Transaktion in Ihr Konto — entweder werden alle ausgewählten Zeilen angelegt oder keine.

## Was wird übernommen

| Feld | Quelle |
|---|---|
| Datum | Spalte `Date` |
| Betrag | `Amount` (absolut) + `Total fees` eingerechnet |
| Währung | Spalte `Currency` |
| Beschreibung | `Description`, ersatzweise `Merchant` oder `Payment Reference` |
| Kategorie | Vorschlag bei bekanntem Händler; sonst keine |
| Quelle | Als `import` markiert, damit Sie in Analysen danach filtern können |

## Währungsumrechnungen

Wenn dieselbe Wise-Überweisung zwei Währungen berührt (Sie tauschen z. B. 100 USD in Euro), liefert Wise zwei Zeilen — eine Abbuchung in USD, eine Gutschrift in EUR. Die App erkennt solche Paare an der gemeinsamen `Payment Reference` und erstellt einen einzigen **Währungsumrechnung**-Datensatz statt zwei unzusammenhängender Transaktionen. Die Umrechnung erscheint unter **Geldbörse → Umrechnungen** mit dem korrekten Wechselkurs.

## Erneuter Import

Den gleichen CSV-Auszug erneut hochzuladen ist sicher. Jede Zeile trägt ihre Wise-`TransferWise ID`, und die App weigert sich, für eine bereits importierte ID einen zweiten Datensatz anzulegen. Das bedeutet:

- Sie können einen längeren Zeitraum erneut exportieren und hochladen — nur die neuen Zeilen werden angelegt.
- Sie können eine Vorschau abbrechen und später neu starten — bereits bestätigte Zeilen sind in der App gespeichert.

## FAQ

- **F: Funktioniert das auch mit anderen Banken?**
  **A:** Aktuell werden nur Wise-CSV-Exporte unterstützt. Andere Banken verwenden andere Spaltennamen. Stellen Sie einen Feature-Wunsch, wenn Sie eine andere Bank unterstützt haben möchten.

- **F: Kann ich einen PDF- oder XLSX-Auszug importieren?**
  **A:** Noch nicht. Exportieren Sie Wise-Auszüge im CSV-Format.

- **F: Wird die Datei irgendwo abgelegt, worüber ich mir Sorgen machen müsste?**
  **A:** Die CSV wird an den AI-Budget-Assistant-Server gesendet, im Arbeitsspeicher verarbeitet und nach Erstellen der Vorschau verworfen. Gespeichert werden nur die strukturierten Zeilen, die Sie bestätigen — nicht die Originaldatei.

- **F: Was passiert mit den Gebühren, die Wise mir berechnet hat?**
  **A:** Wise gibt Gebühren in einer eigenen Spalte `Total fees` aus. Die App rechnet die Gebühr in dieselbe Ausgabe ein, damit die Summe dem entspricht, was tatsächlich Ihr Guthaben verlassen hat.

- **F: Ich habe die falschen Zeilen importiert — kann ich das rückgängig machen?**
  **A:** Ja. Die importierten Zeilen sind ganz normale Ausgaben/Einnahmen — öffnen Sie sie und löschen Sie sie wie jede andere Transaktion. Nach dem Löschen können Sie dieselbe Zeile später erneut importieren.

- **F: Meine CSV hat keine Kopfzeile / ein anderes Format. Was tun?**
  **A:** Stellen Sie sicher, dass Sie einen Auszug aus **Transactions → Statements and Reports → CSV** exportiert haben. Das ältere „Activity Export"-Format ist anders und wird nicht unterstützt.

- **F: Werden meine Kategorien aus Wise übernommen?**
  **A:** Die Wise-eigene Kategorisierung wird teilweise verwendet, um für bekannte Händler Kategorien vorzuschlagen. Die App legt keine neuen Kategorien automatisch an — gibt es keine Übereinstimmung, wird die Zeile ohne Kategorie importiert, und Sie können sie später nachträglich kategorisieren.

---

*Siehe auch: [Ausgaben und Einnahmen](./03-expenses-and-income.md) | [Geldbörse und Umrechnung](./10-wallet-and-exchange.md) | [Konten](./09-accounts.md) | [Einstellungen](./11-settings.md)*
