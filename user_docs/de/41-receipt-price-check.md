# Kassenbon-Preischeck — kostet das mehr als sonst?

> Direkt nachdem du einen Kassenbon scannst, wird jede Position mit dem Medianpreis verglichen, den du für genau dieses Produkt in genau diesem Geschäft schon einmal bezahlt hast — damit dir ein nicht angewendeter Rabatt auffällt, während du noch an der Kasse stehst.

## Was es ist

Jeder gescannte Kassenbon wird still mit deiner eigenen Kaufhistorie abgeglichen: dem Medianpreis, den du für genau dieses Produkt in genau diesem Geschäft in den letzten 12 Wochen bezahlt hast. Kostet eine Position spürbar mehr, wird das sofort angezeigt — während du an der Kasse noch nachfragen oder in die Tüte schauen kannst, statt in einem Bericht zu verschwinden, den du nie öffnen wirst.

Das ist reine Rechenarbeit auf Basis deiner eigenen früheren Belege. Es steckt keine KI dahinter, und es gibt nichts einzuschalten oder einzurichten.

## Was diese Funktion nie behauptet

Sie behauptet nie, dass du übervorteilt oder betrogen wurdest oder dass dir absichtlich ein Rabatt vorenthalten wurde — das kann ein Kassenbon gar nicht beweisen. Steht keine Rabattzeile drauf, zeigt nichts, dass überhaupt einer hätte gelten sollen — die App klagt also niemanden an. Die Formulierung ist immer dieselbe, ehrliche: **teurer als üblich — ein Blick auf den Kassenbon lohnt sich**. Eine Aktion, die still nicht angewendet wurde, ist die häufigste echte Ursache, und diese Formulierung macht genau darauf aufmerksam, ohne mit dem Finger auf das Geschäft zu zeigen.

Was die App dir zeigt, ist, was sie oberhalb deiner üblichen Preise **gefunden** hat — nie, was du **gespart** hast, denn ob du überhaupt etwas damit gemacht hast, lässt sich nicht wissen.

## Wo du es siehst

- **Direkt nach dem Scannen eines Kassenbons** — eine Karte wie „2 Artikel kosten mehr als üblich" mit dem Hinweis „Etwa 6,20 zł mehr, als du hier normalerweise zahlst — ein Blick auf den Kassenbon lohnt sich" darunter. Tippe sie auf, um jedes markierte Produkt zu sehen: was du normalerweise zahlst, was du diesmal gezahlt hast, und die Differenz. Sie hindert dich nie am Speichern des Belegs und ändert nie selbst einen Betrag — es ist eine Information, keine Korrektur.
- **In den Chat-Bots** (Telegram, WhatsApp, Slack) — das Scannen eines Kassenbons über einen Bot fügt der Bestätigungsnachricht eine zusätzliche Zeile hinzu, wenn etwas gefunden wurde, denn Bot-Scans durchlaufen genau denselben Check wie die App.
- **Im Tab Analyse** — eine Zeile „Dieses Jahr X über deinen üblichen Preisen gefunden", nur angezeigt, wenn tatsächlich etwas aufgetaucht ist.
- **In deinen Hinweisen** — jeder gescannte Kassenbon mit einem Fund kann außerdem als ein Hinweis in deiner Glocke erscheinen, damit du nicht selbst daran denken musst.

## Wie viel Vertrauen ein Fund verdient

Ein Produkt braucht mindestens **zwei** frühere Käufe im selben Geschäft, bevor der Check überhaupt etwas dazu sagt — auf einem neuen Konto ist es deshalb erst einmal still, und je mehr du scannst, desto treffsicherer wird es. Ein Fund, der auf genau zwei früheren Käufen beruht, ist mit „**basierend auf nur zwei früheren Käufen**" gekennzeichnet, damit du weißt, wie viel Gewicht du ihm geben solltest; drei oder mehr frühere Käufe sind ein deutlich stärkeres Signal.

## Was verglichen wird — und was ganz bewusst nicht

- Nur **dasselbe Produkt im selben Geschäft**. Ein Preis in einem Laden wird nie mit demselben Produkt verglichen, das woanders gekauft wurde.
- Nur **dieselbe Währung** — für diesen Vergleich wird nie etwas umgerechnet.
- Unterschiedliche Packungsgrößen zählen als unterschiedliche Produkte: Der Scanner behält die Größe im Produktnamen (z. B. „Mleko Łaciate 3,2% 1L"), sodass eine 1-l- und eine 0,5-l-Flasche getrennt erfasst werden — genau wie es sein soll.
- Ein riesiger Preissprung wird bewusst ignoriert statt gemeldet — viel wahrscheinlicher ist ein anderes Produkt (oder eine falsch gelesene Zeile) als eine echte Preisänderung.

## Die Jahressumme

Wurde jemals in mehr als einer Währung etwas gefunden, zeigt der Tab Analyse nur eine Summe — deine eigene Währung, falls dort etwas aufgetaucht ist, sonst den größten Einzelbetrag. Beträge werden nie über Währungen hinweg addiert, denn das würde eine Umrechnung bedeuten, die diese Funktion bewusst nie vornimmt.

## Gut zu wissen

- Funktioniert automatisch bei jedem gescannten Kassenbon — per Kamera, Galerie, PDF und bei Belegen, die über Telegram, WhatsApp oder Slack gescannt werden.
- Ein Fund blockiert nie das Speichern des Belegs und ändert nie selbst einen Betrag.
- Preise und Differenzen werden in der Währung des jeweiligen Belegs angezeigt.
