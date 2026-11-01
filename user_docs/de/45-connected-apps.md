# Verbundene Apps & Entwickler

> Lass eine andere App, die du nutzt – zum Beispiel deine Buchhaltungssoftware –, mit deinen Ausgaben in AI Budget arbeiten, sieh genau, was sie darf, und sperre sie mit einem Tipp wieder aus. Entwickler können solche Apps auf der AI Budget API bauen.

## Was es heißt, eine App zu verbinden

Manche Produkte können direkt in ihren eigenen Bildschirmen mit deinen AI-Budget-Daten arbeiten: Eine Buchhaltungs-App kann deine Ausgaben und Belege übernehmen oder Ausgaben für dich anlegen. Dafür verbindest du die App mit **einem** deiner AI-Budget-Konten.

Dein Passwort sieht die App nie. Wenn du dort auf „Mit AI Budget verbinden“ klickst, landest du auf einer Seite von AI Budget, meldest dich wie gewohnt an und siehst:

- den Namen der App, ihre Website und wer sie entwickelt hat;
- **Von AI Budget verifiziert** (eine App, die wir geprüft haben, etwa unsere eigene) oder **Nicht von AI Budget verifiziert**;
- die Berechtigungen, die die App anfragt;
- **Zu verbindendes Konto** – hier wählst du, welches Konto die App nutzen darf.

Mit **Erlauben** verbindest du die App, mit **Ablehnen** kehrst du ohne Verbindung zur App zurück. Erlaube nur Apps, denen du vertraust.

## Was jede Berechtigung erlaubt

- **Deine Ausgaben sehen: Beträge, Daten, Kategorien, Positionen und Tags** – die App kann die Ausgaben des verbundenen Kontos lesen, samt den Positionen eines Belegs und späteren Änderungen und Löschungen.
- **Ausgaben hinzufügen, ändern und löschen** – die App darf in dieses Konto schreiben. Ausgaben, die sie anlegt, zeigen auf der Ausgabenseite **Hinzugefügt über** und den Namen der App.
- **Deine Belegfotos herunterladen** – die App kann das Belegbild oder PDF herunterladen, das an einer Ausgabe hängt.
- **Deine Ausgabenkategorien sehen** – die App kann deine Kategorienliste lesen, damit sie neue Ausgaben richtig einordnet.

Jede verbundene App sieht außerdem Namen, Typ und Währung des Kontos sowie deinen Namen. Deine E-Mail-Adresse bekommt sie nie, und deine anderen Konten sieht sie nicht.

## Apps ansehen und trennen

Öffne **Einstellungen → Verbundene Apps**. Zu jeder App siehst du das verbundene Konto, wer sie wann verbunden hat, wann sie zuletzt genutzt wurde und ihre Berechtigungen.

Tippe auf **Trennen** und bestätige. Die App verliert sofort den Zugriff auf dieses Konto – schon ihre nächste Anfrage wird abgewiesen. Ausgaben, die sie bereits angelegt hat, bleiben in deinem Konto. Um die App wieder zu nutzen, verbinde sie erneut aus der App heraus.

Bei jeder neuen Verbindung schicken wir der Person, die sie hergestellt hat, eine E-Mail. Erkennst du die App darin nicht, trenne sie sofort.

Siehst du **Verbundene Apps** nicht in den Einstellungen, ist das Verbinden von Apps noch nicht verfügbar.

## Geteilte Konten

Nur **Inhaber** und **Bearbeiter** eines Kontos können eine App damit verbinden; wer ein Konto nur ansehen darf, sieht es ausgegraut.

Eine App, die mit einem geteilten Konto verbunden ist, sieht die Ausgaben **aller** Mitglieder, nicht nur die der Person, die sie verbunden hat. Deshalb sehen alle Inhaber und Bearbeiter unter **Verbundene Apps** jede App, die mit dem Konto verbunden ist, samt der Person, die sie verbunden hat – und jede und jeder von ihnen kann sie trennen. Verbindet ein Bearbeiter eine App, bekommen auch die Inhaber des Kontos die E-Mail.

Wird die Person, die die App verbunden hat, später zur reinen Betrachterin oder verlässt sie das Konto, funktioniert die App für dieses Konto nicht mehr.

## Verschlüsselte Konten

- Ein Konto mit **vollständiger Verschlüsselung** (auch die Beträge sind verschlüsselt) lässt sich gar nicht verbinden – die App könnte darin nichts lesen.
- Ein Konto mit **Textverschlüsselung** lässt sich **nur zum Lesen** verbinden: Die App sieht Beträge, Daten und Kategorien, aber Beschreibungen, Notizen, Händler, Positionsnamen, Tags und anderer verschlüsselter Text bleiben verborgen, und sie kann keine Ausgaben anlegen oder ändern.

Was jede Stufe umfasst, steht unter [Ende-zu-Ende-Verschlüsselung](./15-encryption.md).

## Für Entwickler

Du kannst eigene Apps auf der AI Budget API bauen – kostenlos. Öffne **Einstellungen → Entwickler** und tippe auf **App erstellen**: Gib einen Namen, eine Website und die Weiterleitungsadressen (Redirect-URIs) an und wähle **Server-App** oder **Mobile oder Browser-App**. Die **Client-ID** bekommst du sofort; eine Server-App erhält zusätzlich ein Client-Secret, das **nur ein einziges Mal** angezeigt wird – kopiere es gleich.

Die vollständige API-Referenz und eine Schritt-für-Schritt-Anleitung (auf Englisch, Polnisch und Russisch) findest du unter [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), auch verlinkt über **API-Dokumentation** im Entwickler-Bildschirm. Du kannst bis zu 10 Apps registrieren.
