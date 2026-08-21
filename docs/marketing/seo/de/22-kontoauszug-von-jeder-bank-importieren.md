---
title: "Was passiert, wenn deine Bank nicht auf der Liste steht"
meta_description: "Deine Bank steht nicht auf der Liste? So erkennt KI Spalten in einer CSV-Datei oder liest einen PDF-Auszug, damit du fast jede Bank importieren kannst."
target_keyword: "kontoauszug von jeder bank importieren"
slug: "kontoauszug-von-jeder-bank-importieren"
pair: "ai-bank-import"
lang: "de"
date: "2026-08-20"
---

# Was passiert, wenn deine Bank nicht auf der Liste steht

Du lädst deine Datei hoch und erwartest, dass die App die Spalten automatisch zuordnet - stattdessen bekommst du einen Zuordnungsbildschirm oder, schlimmer, eine leere Liste. Deine Bank gehört einfach nicht zu denen, die die App sofort erkennt. Das ist besonders ärgerlich, wenn du gerade beschlossen hast, mehrere Monate an Ausgaben mit einem Import nachzuholen, und die Datei einer kleineren Bank, eines Wechselstubendienstes oder einer lokalen Genossenschaftsbank sich nicht in ordentliche Spalten fügen will.

Die gute Nachricht: "nicht auf der Liste" heißt nicht "kann nicht importiert werden". Dieser Artikel zeigt genau, was im Hintergrund passiert, wenn AI Budget Assistant ein Dateiformat nicht erkennt, und warum der Mechanismus, der dann greift, sicherer ist, als es auf den ersten Blick wirkt.

## Warum keine Bankliste jemals vollständig ist

Jede Budget-App, die Importe unterstützt, muss vorab entscheiden, welche Banken sie direkt erkennt. AI Budget Assistant erkennt automatisch unter anderem mBank, PKO, Revolut, ING, Millennium und Pekao, dazu Wise sowie PDF-Auszüge von Erste und Alior. Das deckt die meisten gängigen Konten in Polen ab, aber Bankkonten beschränken sich nicht auf die großen Namen. Es gibt kleinere Banken, Geschäftskonten mit einem eigenwilligen Export, ausländische Konten und Exporte aus anderen Finanz-Apps, die jemand beim Wechsel von einem Tool zum anderen mitnehmen will.

Für jedes dieser Formate dauerhaft einen eigenen Parser zu pflegen wäre nicht machbar, und jedes neue Format wäre trotzdem für eine Weile "nicht unterstützt", bis es jemandem auffällt und eine Regel dafür geschrieben wird. Statt darauf zu warten, dass die Liste bis zu deiner Bank wächst, hat die App deshalb einen Mechanismus, der selbst versucht, die Struktur einer noch nie gesehenen Datei zu verstehen.

## Was passiert, wenn eine Datei nicht erkannt wird

Lädst du eine CSV- oder XLSX-Datei hoch, und keiner der eingebauten Parser erkennt ihren Aufbau, kommt ein KI-Modell ins Spiel. Seine Aufgabe ist eng begrenzt: Es liest weder Beträge noch Daten selbst, sondern zeigt nur, **welche Spalte welche ist** - welche das Buchungsdatum enthält, welche den Betrag, welche die Beschreibung oder den Händlernamen. Diese Spaltennamen werden anschließend Wort für Wort mit den tatsächlich vorhandenen Kopfzeilen deiner Datei abgeglichen. Würde sich das Modell eine Spalte "ausdenken", die es in der Datei gar nicht gibt, wird die gesamte Antwort verworfen, nicht stillschweigend übernommen. Erst nach dieser Prüfung lesen dieselben, deterministischen Regeln, die auch die manuelle Spaltenzuordnung bedienen, tatsächlich Zahlen und Daten aus der Datei aus.

Bei PDF-Auszügen, einer Funktion des Pro-Plans, funktioniert der Mechanismus anders, weil sich aus einem PDF nicht einfach Spaltennamen herausziehen lassen - hier muss das Modell die Buchungszeilen selbst aus dem extrahierten Text der Seite herausarbeiten. Das ist dieselbe Art von Aufgabe, die zuvor handgeschriebene Parser für Erste oder Alior erledigt haben, nur dass statt eigenem Code für jede Bank das Modell mit einem Layout klarkommt, das noch niemand beschrieben hat.

## Was dieser Mechanismus niemals tut

Diese Unterscheidung ist wichtig, denn man denkt schnell, "KI importiert den Auszug" bedeute, das Modell rate einfach die Zahlen. Das stimmt nicht. Bei CSV und XLSX gibt das Modell niemals einen Betrag oder ein Datum zurück - es liefert nur Spaltennamen, und die werden immer mit den echten Kopfzeilen deiner Datei abgeglichen. Die eigentlichen Zahlen und Daten liest derselbe, vorhersehbare Code, der die manuelle Spaltenzuordnung schon seit Jahren übernimmt. Das macht den Mechanismus zu einem Helfer beim Erkennen der Struktur, nicht zu jemandem, der deine Ausgaben nach Gefühl einträgt.

Eine hundertprozentige Treffsicherheit beim ersten Versuch ist das trotzdem nicht - das schafft kein Formaterkennungsmechanismus. Deshalb bekommst du, bevor irgendetwas in deinem Budget landet, eine Vorschau zur Kontrolle, dazu mehr weiter unten.

## Was du siehst und wofür du zustimmst, bevor etwas dein Handy verlässt

Bevor irgendein Teil der Datei zum KI-Modell geht, fragt die App um Zustimmung, einmal pro Konto, und zeigt dir genau, was gesendet wird. Bei einer CSV- oder XLSX-Datei ist das die Kopfzeile plus bis zu zehn Beispiel-Datenzeilen - nicht die ganze Datei und nicht deine komplette Transaktionshistorie. Bei einem PDF-Auszug sind es die ersten zwanzig extrahierten Textzeilen. Du siehst das auf dem Zustimmungsbildschirm, bevor irgendetwas passiert, sodass die Entscheidung bewusst getroffen wird und nicht standardmäßig erfolgt.

Hat dein Konto vollständige Ende-zu-Ende-Verschlüsselung (den Volldatenschutz-Modus der App), läuft dieser Mechanismus überhaupt nicht. Daten, die die App selbst nicht entschlüsseln kann, können auch an kein KI-Modell gesendet werden - für solche Konten steht deshalb nur die manuelle Spaltenzuordnung zur Verfügung, sicherer, wenn auch mit einem Klick mehr.

## Du prüfst und korrigierst, bevor irgendetwas gespeichert wird

Nachdem das Modell eine Zuordnung vorgeschlagen hat, siehst du kein rohes Ergebnis ohne Zusammenhang. Du siehst eine Reihe bearbeitbarer "Chips", die zeigen, was erkannt wurde, etwa "Datum → Data operacji" oder "Betrag → Suma transakcji". Ist einer davon falsch, öffnet "Falsch? Korrigieren" denselben manuellen Spalten-Mapper, schon mit dem Vorschlag des Modells vorausgefüllt, sodass du eine Spalte korrigierst statt von null anzufangen.

Das ist dieselbe Vorschau-Stufe, die jeden Import in AI Budget Assistant begleitet, egal ob die Bank sofort erkannt wurde oder nur mit Hilfe der KI: eine vollständige Liste der Buchungen zur Kontrolle, bevor irgendetwas dein Budget erreicht, mit Kategorien, die anhand des Händlers bereits automatisch vorgeschlagen sind.

## Das zweite Mal geht schneller

Stellt sich eine Spaltenzuordnung für ein bestimmtes Format als richtig heraus, wandert ihr Muster - nur die Spaltennamen selbst und die Art, wie Daten geschrieben sind, ohne jegliche deiner persönlichen Daten oder Buchungen - in ein globales Wörterbuch der Formate. Der nächste Nutzer, der einen Auszug von derselben Bank hochlädt, braucht den KI-Schritt gar nicht mehr - das Format wird sofort erkannt, genau wie mBank oder PKO. In gewissem Sinn bist du also der Erste, der dein Format für alle danach "freischaltet".

## So probierst du es aus

Hast du irgendwo eine Datei von einer Bank liegen, bei der du den Import vorher aufgegeben hast, weil die App sie nicht erkannt hat, lohnt sich ein neuer Versuch. Lade die CSV-, XLSX- oder PDF-Datei in [AI Budget Assistant](https://ai-budget.pl) hoch, und erkennt keiner der eingebauten Parser sie, siehst du den oben beschriebenen Zustimmungsbildschirm statt einer leeren Liste. Nach der Zustimmung bekommst du eine Vorschau mit einem Zuordnungsvorschlag zur Kontrolle, genau wie bei jedem anderen Import.

Den gesamten Ablauf eines Imports, vom Herunterladen der Datei bis zur Vermeidung von Duplikaten bei einem erneuten Import, beschreibt unser Leitfaden [Kontoauszug importieren statt alles abzutippen](/blog/de/kontoauszug-importieren/). Willst du dich gar nicht mit Dateien beschäftigen und die App Ausgaben direkt aus den Kartenbenachrichtigungen deiner Bank erfassen lassen, schau dir an, wie [Ausgaben automatisch erfassen](/blog/de/ausgaben-automatisch-erfassen/) funktioniert. AI Budget Assistant ist kostenlos im Browser unter [ai-budget.pl](https://ai-budget.pl) nutzbar, ohne Kartenpflicht, und für Android bei [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant) erhältlich.

---

## FAQ: Import einer Bank, die nicht auf der Liste steht

**Was passiert, wenn meine Bank nicht direkt unterstützt wird?**

Lädst du eine CSV- oder XLSX-Datei hoch, die keiner der eingebauten Parser erkennt, versucht AI Budget Assistant selbst zu erkennen, welche Spalte Datum, Betrag und Beschreibung ist, und zeigt dir das Ergebnis zur Kontrolle und Korrektur. Bei PDF-Auszügen (Pro-Funktion) zieht der Mechanismus die Buchungszeilen direkt aus dem Text des Dokuments. In beiden Fällen siehst du eine vollständige Vorschau, bevor irgendetwas gespeichert wird.

**Kann sich die KI irren und einen falschen Betrag eintragen?**

Bei CSV- und XLSX-Dateien liest das KI-Modell niemals selbst Beträge oder Daten aus - es zeigt nur, welche Spalte welche ist, und diese Namen werden mit den echten Kopfzeilen deiner Datei abgeglichen, sodass eine erfundene Spalte verworfen wird. Die Zahlen selbst liest derselbe Mechanismus wie bei der manuellen Zuordnung. Unabhängig davon bekommst du vor dem Speichern eine Vorschau aller Buchungen, um zu prüfen und zu korrigieren, was nicht passt.

**Wird der Inhalt meines Kontoauszugs irgendwohin gesendet?**

Bevor irgendein Teil der Datei zum KI-Modell geht, siehst du einen einmaligen Zustimmungsbildschirm pro Konto, der genau zeigt, was gesendet wird: die Kopfzeile plus bis zu zehn Beispielzeilen bei CSV oder XLSX, oder die ersten zwanzig Textzeilen bei einem PDF-Auszug. Konten mit vollständiger Ende-zu-Ende-Verschlüsselung nutzen diesen Mechanismus überhaupt nicht, weil die App gar nicht auf ihre Daten zugreifen kann, um sie zu senden.

**Funktioniert der KI-gestützte Import genauso gut wie bei mBank oder PKO?**

Das hängt vom Dateiformat ab, aber der Mechanismus ist darauf ausgelegt, mit der Zeit besser zu werden: Stellt sich die Spaltenzuordnung für eine neue Bank als richtig heraus, wandert allein der Aufbau der Datei (ohne deine Daten) in ein globales Wörterbuch, sodass ein künftiger Import desselben Bankformats den KI-Schritt gar nicht mehr braucht. Trotzdem lohnt sich immer ein Blick in die Vorschau, bevor du den Import bestätigst, genau wie bei jeder anderen Bank.

---

*Ähnliche Beiträge: [Kontoauszug importieren statt alles abzutippen](/blog/de/kontoauszug-importieren/) | [Ausgaben automatisch erfassen statt alles selbst eintippen](/blog/de/ausgaben-automatisch-erfassen/)*
