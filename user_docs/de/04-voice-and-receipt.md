# Spracheingabe & Beleg scannen

> Lass die KI die Arbeit machen. Sprich deine Ausgabe naturlich aus oder fotografiere einen Beleg — die App extrahiert Betrag, Beschreibung, Handler und Kategorie automatisch.

## Sprachausgabe

![Sprachausgabe-Bildschirm](../img/voice-expense-4.jpg)

### So funktioniert es

1. Tippe auf **Spracheingabe** bei den Schnellaktionen der Ubersicht, oder tippe auf **+** auf dem Transaktionen-Bildschirm und wahle **Spracheingabe**
2. Du siehst ein grosses Mikrofonsymbol mit dem Text **"Tippen, um zu sprechen"**
3. Tippe auf die Mikrofon-Schaltflache, um die Aufnahme zu starten
4. Sprich naturlich, zum Beispiel: *"Kaffee bei Starbucks, funf Euro"*
5. Tippe erneut, um die Aufnahme zu stoppen
6. Die App verarbeitet deine Sprache und extrahiert die Ausgabendetails

### Bestatigungsbildschirm

Nach der Verarbeitung siehst du eine Bestatigung mit den erkannten Daten:

- **Betrag** — aus deiner Sprache extrahiert (bearbeitbar)
- **Beschreibung** — wofur die Ausgabe war (bearbeitbar)
- **Handler** — wo du ausgegeben hast (bearbeitbar)
- **Kategorie** — automatisch zugewiesen (bearbeitbar)
- **Zuverlassigkeit**-Indikator — **Hohe Zuverlassigkeit** oder **Mittlere Zuverlassigkeit**

Uberprufe die Details, nimm Korrekturen vor, dann:
- Tippe auf **Ausgabe speichern**, um zu bestatigen und zu speichern
- Tippe auf **Erneut versuchen**, um erneut aufzunehmen

Nach dem Speichern kannst du auf **Weitere hinzufugen** tippen, um eine neue Sprachausgabe aufzunehmen.

### Tipps fur beste Ergebnisse

- Sprich deutlich und nenne sowohl den Artikel/die Beschreibung als auch den Betrag
- Nenne den Handlernamen, wenn relevant (z.B. "Mittagessen bei McDonald's, zwolf Euro")
- Gib die Wahrung an, wenn sie sich von deiner Standardwahrung unterscheidet
- Halte es einfach — eine Ausgabe pro Aufnahme

## Beleg scannen

![Beleg scannen-Bildschirm](../img/scan-receipt-4.jpg)

### So funktioniert es

1. Tippe auf **Beleg scannen** bei den Schnellaktionen der Ubersicht, oder tippe auf **+** auf dem Transaktionen-Bildschirm und wahle **Beleg scannen**
2. Du siehst drei Optionen:
   - **Foto aufnehmen** — offnet deine Kamera zum Fotografieren des Belegs
   - **Aus Galerie wahlen** — wahle ein vorhandenes Foto
   - **PDF hochladen** — wahle eine PDF-Datei (digitale Rechnungen, gescannte Belege, bis 10 MB)
3. Optional kannst du **Zusatzliche Anweisungen fur KI** eingeben (z.B. "Gleichmassig auf zwei Personen aufteilen", "Trinkgeld ignorieren")
4. Die App analysiert den Beleg und extrahiert die Daten

### Bestatigungsbildschirm

Nach der KI-Analyse siehst du:

- **Gesamtbetrag** — vom Beleg extrahiert (bearbeitbar)
- **Beschreibung** — generierte Zusammenfassung (bearbeitbar)
- **Handler** — Geschaft-/Restaurantname (bearbeitbar)
- **Kategorie** — automatisch zugewiesen (bearbeitbar)
- **Datum** — vom Beleg (bearbeitbar)
- **Artikel** — einzelne Positionen mit Mengen und Preisen (falls erkannt) — tippe auf einen Artikel, um ihn zu bearbeiten, zu löschen oder einen fehlenden hinzuzufügen (siehe **Artikel bearbeiten** unten)
- **Rabatt** — Rabattbetrag (falls auf dem Beleg vorhanden)
- **Zuverlassigkeit**-Indikator — **Hohe Zuverlassigkeit** oder **Mittlere Zuverlassigkeit**
- **Kassenbon-Bild speichern**-Schalter — das Foto an die Ausgabe anhangen

Uberprufe und korrigiere Details, dann:
- Tippe auf **Ausgabe speichern**, um zu bestatigen
- Tippe auf **Erneut scannen**, um ein anderes Foto zu versuchen

### Tipps fur beste Ergebnisse

- Fotografiere bei guter Beleuchtung — vermeide Schatten und Blendung
- Stelle sicher, dass der gesamte Beleg sichtbar und flach ist
- Halte die Kamera ruhig, um Unscharfe zu vermeiden
- Verwende **Zusatzliche Anweisungen fur KI** fur besondere Handhabung (z.B. "Das ist in EUR", "Ersten Artikel ignorieren")

### Artikel bearbeiten

Die KI-Extraktion ist nicht immer perfekt — eine Ziffer im Preis kann fehlen, ein Rabatt kann in einen Einzelpreis hineinrutschen, oder eine Zeile kann beim Scannen ganz übersehen werden. Du musst nicht neu scannen oder die ganze Ausgabe löschen, um das zu korrigieren:

- **Tippe auf einen Artikel** in der Liste, um Name, Menge, Einzelpreis oder Gesamtpreis zu bearbeiten. Tippe auf **Speichern**, um die Korrektur zu übernehmen.
- **Tippe auf das Papierkorb-Symbol** neben einem Artikel, um ihn zu entfernen — praktisch bei einer doppelten oder erfundenen Zeile.
- **Tippe auf + Artikel hinzufügen** am Ende der Liste, um eine vom Scan übersehene Zeile hinzuzufügen.

Jeder Artikel wird angezeigt — es gibt keine Begrenzung, egal wie viele der Beleg enthält. Jede Änderung aktualisiert sofort die Kategorienaufteilung und die Summen, sodass das Gespeicherte immer dem entspricht, was auf dem Bildschirm zu sehen ist. Der Gesamtbetrag, Rabatt und Pfand des Belegs bleiben wie gescannt — nur die einzelnen Artikel sind bearbeitbar.

### Aufteilung nach Kategorien

Kassenbons vom Supermarkt enthalten oft mehrere Arten von Artikeln in einem Einkauf — Lebensmittel, Haushaltsartikel, Alkohol. Wenn die App mehr als eine Art von Artikel auf einem Beleg erkennt, teilt sie die Ausgabe automatisch auf die passenden Kategorien auf, anstatt alles einer einzigen zuzuordnen.

- Auf dem Bestätigungsbildschirm erscheint über der Artikelliste eine Reihe von Kategorie-Chips mit der Bezeichnung **Nach Kategorie aufteilen** (zum Beispiel „Lebensmittel 180 · Haushalt 35 · Alkohol 25"), die zeigt, wie der Gesamtbetrag aufgeteilt wird.
- Tippe auf **Kategorien ändern**, um eine Liste aller Artikel zu öffnen und anzupassen, zu welcher Kategorie sie gehören. Deine Änderungen gelten sofort — und werden gemerkt, sodass dasselbe Produkt beim nächsten Scan korrekt kategorisiert wird.
- Wenn die Artikel nicht ausreichend genau zum Gesamtbetrag des Belegs passen, greift die App auf eine einzige Kategorie zurück, statt zu raten.
- Pfand für Flaschen und Dosen wird erkannt und als eigene Kategorie angezeigt, damit du siehst, wie viel deiner Ausgaben aus Verpackung besteht, die du zurückbekommst.
- Das zählt jetzt auch für deine Kategorie-Budgets — ein Budget für eine Kategorie, die nur innerhalb einer Beleg-Aufteilung vorkommt, etwa Alkohol oder Pfand, wird endlich korrekt erfasst, und ein Lebensmittel-Budget zählt die Haushaltsartikel oder das Pfand vom selben Beleg nicht mehr mit.
- Manchmal passt keine deiner bestehenden Kategorien zu einer Gruppe von Artikeln. In diesem Fall schlägt die App eine brandneue Kategorie vor, angezeigt als Chip mit einem **+**-Zeichen (zum Beispiel „+ Haushaltschemie 10"). Sie wird noch nicht angelegt — tippe auf **Kategorien ändern**, um ihre Artikel stattdessen einer bestehenden Kategorie zuzuweisen oder sie wie vorgeschlagen zu belassen. Die neue Kategorie wird erst angelegt, wenn du den Beleg speicherst.

Funktioniert genauso, egal ob du über die App oder über die Telegram-, WhatsApp- oder Slack-Bots scannst.

### Einen ganzen Stapel Belege scannen

Hast du eine Woche Papierbelege gesammelt? Nach dem Speichern bietet die Bestätigung zwei Optionen statt den Bildschirm einfach zu schließen:

- **Weiteren scannen** — springt direkt zurück zur Kamera, ohne den Bildschirm zu verlassen, damit du einen ganzen Stapel hintereinander abarbeiten kannst
- **Fertig** — schließt ab und bringt dich zurück, wo du gestartet bist

Während du scannst, zeigt ein kleiner Zähler, wie viele Belege du in dieser Sitzung bereits gespeichert hast. Alle 15 Belege meldet sich die App mit einer freundlichen Erinnerung, dass du weitermachen oder eine Pause einlegen kannst — dein Fortschritt ist so oder so schon gespeichert. Der Zähler setzt sich zurück, sobald du den Bildschirm verlässt; er dient nur dazu, dir während einer Sitzung ein Gefühl für den Fortschritt zu geben.

### Bereits gescannte Belege

Die App warnt dich, bevor ein Beleg doppelt in deinen Ausgaben landet:

- **Dieselbe Datei erneut** — wählst du ein Foto oder PDF, das schon gescannt und gespeichert wurde, wirst du *vor* dem Auslesen gefragt, sodass keine KI-Anfrage verbraucht wird. **Öffnen** zeigt die gespeicherte Ausgabe, **Trotzdem scannen** liest den Beleg erneut, **Abbrechen** bricht ab.
- **Derselbe Beleg, neues Foto** — gibt es nach dem Auslesen schon eine Ausgabe mit demselben Geschäft, Betrag und Datum (±1 Tag), zeigt der Bestätigungsbildschirm einen gelben Hinweis mit einer **Öffnen**-Schaltfläche. Speichern bleibt möglich: Es kann ein echter zweiter Einkauf sein.
- **Bereits von der Bank erfasst** — stammt die passende Ausgabe aus einer Bankbenachrichtigung oder einem Kontoauszug-Import, sagt der Hinweis das und bietet **Zu einer Ausgabe zusammenführen** an. Ist es angehakt, behält das Speichern den Beleg (Positionen, Foto und Kategorie) und ersetzt den Bankeintrag, sodass der Einkauf nur einmal zählt. Stimmen nur Betrag und Datum überein, ist das Kästchen anfangs nicht angehakt — vor dem Zusammenführen prüfen.

Die Bots in Telegram, WhatsApp und Slack warnen genauso und bieten eine Schaltfläche **Trotzdem scannen** an.

### Aus einer anderen App teilen (Android)

Du hast einen Beleg als Screenshot, eine Bestätigung aus der Banking-App oder einen E-Beleg als PDF? Den Scanner musst du nicht öffnen:

1. Tippe in einer beliebigen App (Galerie, Gmail, Bank, Händler-App) auf **Teilen**
2. Wähle **AI Budget**
3. Die App öffnet direkt den ausgefüllten Bestätigungsbildschirm — prüfen und **Speichern** tippen

Du kannst **Bilder und PDFs** teilen, bis zu **10 Dateien auf einmal** (PDF bis 10 MB). Mehrere Dateien werden nacheinander zu einzelnen Ausgaben — der Titel zeigt den Fortschritt („Beleg 2 von 5“), **Weiter** führt zur nächsten Datei. Kann eine Datei nicht gelesen werden, wähle **Überspringen** oder **Manuell eingeben**. Beim Schließen fragt die App, bevor wartende Dateien verworfen werden. Jede Datei zählt als ein Belegscan gegen dein KI-Limit; ist es aufgebraucht, bleiben die übrigen Dateien für später.

Teilen funktioniert nur unter Android. Auf dem iPhone und in der Web-App nutze **Beleg scannen**.

### E-Belege per E-Mail weiterleiten

Viele Geschäfte und Online-Shops schicken dir einen Beleg oder eine Bestellbestätigung per E-Mail. Statt ihn zu scannen, kannst du ihn an deine eigene private Adresse weiterleiten – jede weitergeleitete E-Mail erscheint in der App als Ausgabe, die auf dich wartet. **Nichts wird gespeichert, bevor du bestätigst.**

> **Wird schrittweise eingeführt.** Die Funktion wird nach und nach freigeschaltet. Wenn du **E-Mail-Belege** in den **Einstellungen** siehst, kannst du sie nutzen. Siehst du sie noch nicht, ist sie für dein Konto noch nicht verfügbar.

#### Deine Adresse

1. Öffne **Einstellungen** → **E-Mail-Belege**
2. Tippe auf **Meine Adresse erstellen** (nur Inhaber und Bearbeiter eines Kontos können das)
3. Tippe unter **Deine private Adresse** auf **Kopieren**
4. Wähle unter **Belege hinzufügen zu** das Konto, in dem bestätigte Belege gespeichert werden (es werden nur Konten angezeigt, die du bearbeiten darfst)

Die Adresse gehört dir, nicht dem Konto – Mitglieder eines gemeinsamen Kontos sehen die E-Mails, die du weiterleitest, nie.

#### Weiterleitung in Gmail einrichten

1. Öffne in Gmail **Einstellungen** → **Alle Einstellungen aufrufen** → **Weiterleitung und POP/IMAP** → **Weiterleitungsadresse hinzufügen** und füge deine private Adresse ein
2. Gmail schickt einen Bestätigungscode an diese Adresse. Er erscheint in der App unter **Einstellungen** → **E-Mail-Belege** auf einer Karte **Gmail-Bestätigungscode** mit einer Schaltfläche **Kopieren**. Gib ihn in Gmail ein. Der Code wird nur in der App angezeigt – nie in einer Benachrichtigung – und nur etwa 30 Minuten lang; ist er verschwunden, lass ihn dir von Gmail erneut senden
3. Erstelle einen **Filter** (**Einstellungen** → **Filter und blockierte Adressen**) für die Absenderadresse des Shops oder einen Betreff wie „Beleg“ oder „Bestellung“ und wähle **Weiterleiten an** deine Adresse

Leite nicht deine gesamte Post weiter – nutze einen Filter, für deine Privatsphäre und damit unpassende Nachrichten nicht dein KI-Limit verbrauchen.

#### Weiterleitung in Outlook einrichten

1. Öffne in Outlook **Einstellungen** → **E-Mail** → **Regeln** und füge eine Regel für Nachrichten vom Shop oder mit „Beleg“ im Betreff hinzu
2. Wähle die Aktion **Weiterleiten an** und gib deine private Adresse ein

Manche Outlook.com- und Microsoft-365-Konten blockieren die automatische Weiterleitung an externe Adressen. Falls das bei dir so ist, leite jeden Beleg manuell weiter – eine manuelle Weiterleitung vom Handy funktioniert genauso.

#### Einen Beleg bestätigen

Sobald ein weitergeleiteter Beleg gelesen wurde, bekommst du eine Benachrichtigung, und auf dem Transaktionen-Bildschirm erscheint ein Banner **E-Mail-Belege zu bestätigen: N**. Die Liste öffnest du jederzeit auch über **Einstellungen** → **E-Mail-Belege** → **Posteingang der E-Mail-Belege öffnen**.

- Der Reiter **Zu bestätigen** zeigt die Belege, die auf dich warten. Tippe auf einen, um den gewohnten Bestätigungsbildschirm für Belege zu öffnen, prüfe die Angaben und tippe auf **Ausgabe speichern**
- Sieht der Beleg aus wie eine Ausgabe, die du schon hast, erscheint dieselbe Duplikat-Warnung wie beim Scannen – einschließlich **Zu einer Ausgabe zusammenführen**
- Tippe auf **Verwerfen**, um einen Beleg ohne Speichern zu verwerfen
- Der Reiter **Erledigt** zeigt, was übersprungen wurde: ein Beleg, den du schon hast, eine E-Mail ohne Beleg, einer, der nicht gelesen werden konnte, oder einer, der wegen deines erreichten KI-Limits ungelesen blieb – wo es passt, tippe auf **Erneut versuchen**

Jeder gelesene E-Beleg zählt als ein Belegscan gegen dein KI-Limit; Duplikate und E-Mails ohne Beleg werden übersprungen, ohne es zu verbrauchen. Schickt ein Shop nur einen Link zum Beleg, leite stattdessen das PDF weiter – Links werden nie geöffnet. Ein Foto des Belegs kann bei der Ausgabe gespeichert werden; ein PDF oder eine reine Text-E-Mail wird nicht angehängt. Die Liste braucht eine Internetverbindung.

#### Wenn deine Adresse bekannt wird

Tippe auf **Adresse erneuern**. Die alte Adresse funktioniert sofort nicht mehr, und an sie gesendete Mails werden abgelehnt. Ändere dann die Weiterleitungsregel in deinem Postfach auf die neue Adresse (Gmail fragt erneut nach einem Bestätigungscode). Um gar keine E-Belege mehr zu empfangen, tippe auf **Adresse deaktivieren**.

#### Datenschutz und Aufbewahrung

- Unser Server liest eine weitergeleitete E-Mail während der Verarbeitung, genau wie jeden Beleg, den du scannst
- Gespeichert wird nur der Beleg selbst, nie die ganze E-Mail. Links in der E-Mail werden nie geöffnet, Bilder darin nie geladen
- Der gespeicherte Beleg wird gelöscht, sobald du ihn bestätigst oder verwirfst; unbestätigte Einträge werden nach 30 Tagen automatisch gelöscht
- E-Mail-Belege sind für Konten mit **Stufe 2 — Vollständige Verschlüsselung** **nicht verfügbar**. Mit Verschlüsselung der Stufe 1 funktionieren sie, unbestätigte Einträge werden dann aber nach 7 Tagen gelöscht. Siehe [Verschlüsselung](./15-encryption.md)

## Spracheingabe Einnahmen

Erfasse erhaltene Zahlungen per Sprache — gleicher Ablauf wie bei der Sprachausgabe, optimiert für Einnahmen.

### So funktioniert es

1. Tippe auf **Spracheingabe Einnahmen** bei den Schnellaktionen der Übersicht, oder tippe auf das Mikrofonsymbol in der Fußzeile des **Einnahme hinzufügen**-Formulars
2. Tippe auf die (grüne) Mikrofon-Schaltfläche, um die Aufnahme zu starten
3. Sprich natürlich, zum Beispiel: *"500 vom Kunden erhalten, Beratungshonorar"*
4. Tippe erneut, um die Aufnahme zu stoppen
5. Die App extrahiert den Betrag, die Beschreibung und die am besten passende **Einnahmenkategorie**

### Bestätigungsbildschirm

- **Betrag** — aus deiner Sprache extrahiert (bearbeitbar)
- **Beschreibung** — wofür die Zahlung war (bearbeitbar)
- **Kategorie** — Einnahmenkategorie automatisch zugewiesen (bearbeitbar)
- **Währung** — erkannt oder auf deine Standardwährung zurückgesetzt

Tippe auf **Einnahme speichern**, um zu bestätigen, oder auf **Erneut versuchen**, um neu aufzunehmen.

### Tipps für beste Ergebnisse

- Nenne den Betrag und eine kurze Beschreibung
- Gib die Währung an, wenn sie sich von deiner Standardwährung unterscheidet

---

## Rechnung scannen

Fotografiere oder lade eine Rechnung oder ein Zahlungsdokument hoch, um Einnahmen automatisch zu erfassen.

### So funktioniert es

1. Tippe auf **Rechnung scannen** bei den Schnellaktionen der Übersicht, oder tippe auf das Dokumentsymbol in der Fußzeile des **Einnahme hinzufügen**-Formulars
2. Wähle **Foto aufnehmen**, **Aus Galerie wählen** oder **PDF hochladen**
3. Optional kannst du **Zusätzliche Anweisungen für KI** eingeben
4. Die App extrahiert den Gesamtbetrag, das Datum und die Kategorie

### Bestätigungsbildschirm

- **Gesamtbetrag** — aus dem Dokument extrahiert
- **Beschreibung** — generierte Zusammenfassung
- **Kategorie** — Einnahmenkategorie automatisch zugewiesen
- **Datum** — aus dem Dokument

Überprüfe die Details, tippe auf ✓ zum Speichern oder auf das Stiftsymbol, um das vollständige Einnahme-Formular mit vorausgefüllten Daten zu öffnen.

> **Hinweis:** Die Rechnungs-OCR extrahiert nur Gesamtbetrag und Datum. Einzelpositionen aus Rechnungen werden absichtlich ignoriert, um Doppelzählungen bei mehrzeiligen Abrechnungsdokumenten zu vermeiden.

---

## FAQ

- **F: Welche Sprachen unterstutzt die Spracheingabe?**
  **A:** Die Spracheingabe funktioniert am besten in der Sprache, auf die deine App eingestellt ist. Sie unterstutzt alle 8 App-Sprachen.

- **F: Kann ich Belege in jeder Sprache scannen?**
  **A:** Ja, die KI kann Belege in den meisten Sprachen verarbeiten und extrahiert Betrage und Artikel unabhangig von der Belegsprache.

- **F: Welche PDF-Dateien werden unterstutzt?**
  **A:** Sowohl digitale PDFs (z.B. Amazon- oder PayPal-Rechnungen) als auch gescannte PDF-Belege werden unterstutzt. Maximale Dateigrose: 10 MB. Digitale PDFs mit selektierbarem Text werden schneller und genauer verarbeitet. Bei gescannten PDFs sollte der Scan klar und kontraststark sein.

- **F: Warum war der Betrag nach dem Scannen falsch?**
  **A:** Die KI-Extraktion ist nicht immer perfekt. Uberprufe immer den Bestatigungsbildschirm und korrigiere Fehler vor dem Speichern. Unscharfe oder beschadigte Belege konnen weniger genaue Ergebnisse liefern. Wenn eine einzelne Position falsch ist, tippe darauf, um sie direkt zu bearbeiten — siehe **Artikel bearbeiten** oben.

- **F: Verbrauchen Spracheingabe/Belegscan meine KI-Anfragen?**
  **A:** Ja, jede Spracheingabe oder jeder Belegscan verbraucht eine KI-Anfrage aus deinem monatlichen Kontingent.

- **F: Warum wurde ein Beleg in meinen Diagrammen auf mehrere Kategorien aufgeteilt?**
  **A:** Wenn ein Beleg deutlich unterschiedliche Arten von Artikeln enthält (zum Beispiel Lebensmittel und Alkohol), teilt die App ihn automatisch auf die passenden Kategorien in deinen Ausgabendiagrammen auf — und in deinen Kategorie-Budgets ebenso. Tippe auf **Kategorien ändern** auf dem Bestätigungsbildschirm des Belegs, um es anzupassen — Korrekturen werden für das nächste Mal gemerkt.

---

*Siehe auch: [Ausgaben & Einkommen](./03-expenses-and-income.md) | [KI-Chat](./07-ai-chat.md)*
