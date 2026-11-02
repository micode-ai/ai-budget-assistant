# Verbundene Apps & Entwickler

> Lass eine andere App, die du nutzt – zum Beispiel deine Buchhaltungssoftware –, mit deinen Ausgaben in AI Budget arbeiten, sieh genau, was sie darf, und sperre sie mit einem Tipp wieder aus. Entwickler können solche Apps auf der AI Budget API bauen.

## Was es heißt, eine App zu verbinden

Manche Produkte können direkt in ihren eigenen Bildschirmen mit deinen AI-Budget-Daten arbeiten: Eine Buchhaltungs-App kann deine Ausgaben und Belege übernehmen oder Ausgaben für dich anlegen. Dafür verbindest du die App mit **einem oder mehreren** deiner AI-Budget-Konten.

Dein Passwort sieht die App nie. Wenn du dort auf „Mit AI Budget verbinden“ klickst, landest du auf einer Seite von AI Budget, meldest dich wie gewohnt an und siehst:

- den Namen der App, ihre Website und wer sie entwickelt hat;
- **Von AI Budget verifiziert** (eine App, die wir geprüft haben, etwa unsere eigene) oder **Nicht von AI Budget verifiziert**;
- die Berechtigungen, die die App anfragt;
- **Zu verbindende Konten** – zu jedem Konto ein Kästchen. Hake jedes Konto an, das die App nutzen darf; **Erlauben** bleibt gesperrt, bis mindestens eines angehakt ist. Lässt sich nur ein Konto verbinden, ist es schon angehakt. Konten, die du nur ansehen darfst oder die vollständig verschlüsselt sind, sind mit Begründung ausgegraut; ein Konto mit Textverschlüsselung ist als nur lesbar markiert.

Mit **Erlauben** verbindest du die App, mit **Ablehnen** kehrst du ohne Verbindung zur App zurück. Erlaube nur Apps, denen du vertraust.

**App erneut verbinden.** Ist die App schon verbunden, öffnet sich der Bildschirm mit den Konten, die sie bereits hat, schon angehakt – dazu alle weiteren Konten, die sich noch verbinden lassen. Was du ankreuzt, ist die vollständige Liste: Hake ein neues Konto an, um es hinzuzufügen, oder nimm einen Haken weg, um die App von diesem Konto zu trennen. Der Zugriff auf die Konten, die angehakt bleiben, läuft ohne Unterbrechung weiter.

Hat eine App mehrere Konten, teilt sie uns bei jeder Anfrage mit, um welches es geht – du musst nichts tun.

## Was jede Berechtigung erlaubt

- **Deine Ausgaben sehen: Beträge, Daten, Kategorien, Positionen und Tags** – die App kann die Ausgaben des verbundenen Kontos lesen, samt den Positionen eines Belegs und späteren Änderungen und Löschungen.
- **Ausgaben hinzufügen, ändern und löschen** – die App darf in dieses Konto schreiben. Ausgaben, die sie anlegt, zeigen auf der Ausgabenseite **Hinzugefügt über** und den Namen der App.
- **Deine Belegfotos herunterladen** – die App kann das Belegbild oder PDF herunterladen, das an einer Ausgabe hängt.
- **Deine Ausgabenkategorien sehen** – die App kann deine Kategorienliste lesen, damit sie neue Ausgaben richtig einordnet.

Jede verbundene App sieht außerdem Namen, Typ und Währung der Konten, die du angehakt hast, sowie deinen Namen. Deine E-Mail-Adresse bekommt sie nie, und ein Konto, das du nicht angehakt hast, sieht sie nicht.

## Apps ansehen und trennen

Öffne **Einstellungen → Verbundene Apps**. Jede App ist eine Zeile mit den Konten, mit denen sie verbunden ist, wer sie wann verbunden hat, wann sie zuletzt genutzt wurde und ihren Berechtigungen.

Um **ein Konto** zu trennen, tippe daneben auf **Konto entfernen** und bestätige. Die App verliert dieses Konto sofort – ihre nächste Anfrage dafür wird abgewiesen –, ihre anderen Konten funktionieren weiter. Wird das letzte Konto entfernt, ist die App vollständig getrennt.

Um die ganze App zu trennen, tippe auf **Trennen** und bestätige. Sie verliert den Zugriff auf alle ihre Konten auf einmal. Ausgaben, die sie bereits angelegt hat, bleiben in deinen Konten. Um die App wieder zu nutzen, verbinde sie erneut aus der App heraus.

Jedes Mal, wenn eine App verbunden wird oder neue Konten bekommt, schicken wir der Person, die das getan hat, eine E-Mail mit den hinzugefügten Konten. Erkennst du die App darin nicht, trenne sie sofort.

Siehst du **Verbundene Apps** nicht in den Einstellungen, ist das Verbinden von Apps noch nicht verfügbar.

## Geteilte Konten

Nur **Inhaber** und **Bearbeiter** eines Kontos können eine App damit verbinden; wer ein Konto nur ansehen darf, sieht es ausgegraut.

Eine App, die mit einem geteilten Konto verbunden ist, sieht die Ausgaben **aller** Mitglieder, nicht nur die der Person, die sie verbunden hat. Deshalb sehen alle Inhaber und Bearbeiter eines solchen Kontos die App unter **Verbundene Apps**, samt der Person, die sie verbunden hat, und können sie von diesem Konto entfernen.

Du siehst von einer Verbindung immer nur die Konten, die du selbst besitzt oder bearbeitest – nie die übrigen Konten, die die verbindende Person gewählt hat. Tippst du auf **Trennen**, verliert die App nur diese deine Konten; für die Person, die sie eingerichtet hat, bleibt sie verbunden, und nur diese Person kann sie vollständig trennen. Verbindet ein Bearbeiter eine App, bekommen auch die Inhaber der verbundenen Konten eine E-Mail, in der nur ihre eigenen Konten stehen.

Wird die Person, die die App verbunden hat, später zur reinen Betrachterin oder verlässt sie ein Konto, funktioniert die App für dieses Konto nicht mehr; ihre anderen Konten bleiben unberührt. Ein gelöschtes Konto wird automatisch aus der App entfernt.

## Verschlüsselte Konten

- Ein Konto mit **vollständiger Verschlüsselung** (auch die Beträge sind verschlüsselt) lässt sich gar nicht verbinden – die App könnte darin nichts lesen.
- Ein Konto mit **Textverschlüsselung** lässt sich **nur zum Lesen** verbinden: Die App sieht Beträge, Daten und Kategorien, aber Beschreibungen, Notizen, Händler, Positionsnamen, Tags und anderer verschlüsselter Text bleiben verborgen, und sie kann keine Ausgaben anlegen oder ändern.

Was jede Stufe umfasst, steht unter [Ende-zu-Ende-Verschlüsselung](./15-encryption.md).

## Für Entwickler

Du kannst eigene Apps auf der AI Budget API bauen – kostenlos. Öffne **Einstellungen → Entwickler** und tippe auf **App erstellen**: Gib einen Namen, eine Website und die Weiterleitungsadressen (Redirect-URIs) an und wähle **Server-App** oder **Mobile oder Browser-App**. Die **Client-ID** bekommst du sofort; eine Server-App erhält zusätzlich ein Client-Secret, das **nur ein einziges Mal** angezeigt wird – kopiere es gleich.

Die vollständige API-Referenz und eine Schritt-für-Schritt-Anleitung (auf Englisch, Polnisch und Russisch) findest du unter [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), auch verlinkt über **API-Dokumentation** im Entwickler-Bildschirm. Du kannst bis zu 10 Apps registrieren.
