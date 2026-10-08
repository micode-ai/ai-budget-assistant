# Spraakinvoer & Bonnen scannen

> Laat de AI het werk doen. Spreek je uitgave natuurlijk uit of fotografeer een bon — de app haalt automatisch het bedrag, de omschrijving, de verkoper en de categorie eruit.

## Spraakuitgave

![Scherm Spraakuitgave](../img/voice-expense-4.jpg)

### Hoe het werkt

1. Tik op **Spraakinvoer** bij de snelle acties op het Dashboard, of tik op **+** op het scherm Transacties en selecteer **Spraakinvoer**
2. Je ziet een groot microfoonpictogram met de tekst **"Tik om te beginnen met spreken"**
3. Tik op de microfoonknop om de opname te starten
4. Spreek natuurlijk, bijvoorbeeld: *"Koffie bij Starbucks, vijf dollar"*
5. Tik nogmaals om de opname te stoppen
6. De app verwerkt je spraak en haalt de uitgavedetails eruit

### Bevestigingsscherm

Na verwerking zie je een bevestiging met de uitgelezen gegevens:

- **Bedrag** — uit je spraak gehaald (bewerkbaar)
- **Omschrijving** — waar de uitgave voor was (bewerkbaar)
- **Verkoper** — waar je hebt uitgegeven (bewerkbaar)
- **Categorie** — automatisch toegewezen (bewerkbaar)
- **Betrouwbaarheids**indicator — hoge betrouwbaarheid of gemiddelde betrouwbaarheid

Controleer de details, breng eventuele correcties aan en daarna:
- Tik op **Uitgave opslaan** om te bevestigen en op te slaan
- Tik op **Opnieuw proberen** om opnieuw op te nemen

Na het opslaan kun je op **Nog een toevoegen** tikken om een nieuwe spraakuitgave op te nemen.

### Tips voor het beste resultaat

- Spreek duidelijk en noem zowel het item/de omschrijving als het bedrag
- Noem de naam van de verkoper als die relevant is (bijv. "Lunch bij McDonald's, twaalf euro")
- Geef de valuta op als die afwijkt van je standaard
- Houd het simpel — één uitgave per opname

## Bon scannen

![Scherm Bon scannen](../img/scan-receipt-4.jpg)

### Hoe het werkt

1. Tik op **Bon scannen** bij de snelle acties op het Dashboard, of tik op **+** op het scherm Transacties en selecteer **Bon scannen**
2. Je ziet drie opties:
   - **Foto maken** — opent je camera om de bon te fotograferen
   - **Kies uit galerij** — selecteer een bestaande foto
   - **Pdf uploaden** — kies een pdf-bestand (digitale facturen, gescande bonnen tot 10 MB)
3. Optioneel kun je **Aanvullende instructies voor de AI** invoeren (bijv. "Gelijk verdelen tussen twee personen", "Negeer de fooi")
4. De app analyseert de bon en haalt de gegevens eruit

### Bevestigingsscherm

Na de AI-analyse zie je:

- **Totaalbedrag** — uit de bon gehaald (bewerkbaar)
- **Omschrijving** — gegenereerde samenvatting (bewerkbaar)
- **Verkoper** — naam van de winkel/het restaurant (bewerkbaar)
- **Categorie** — automatisch toegewezen (bewerkbaar)
- **Datum** — van de bon (bewerkbaar)
- **Items** — afzonderlijke regelitems met aantallen en prijzen (indien gedetecteerd) — tik op een item om het te bewerken, te verwijderen of een gemist item toe te voegen (zie **Items bewerken** hieronder)
- **Korting** — kortingsbedrag (indien aanwezig op de bon)
- **Betrouwbaarheids**indicator — hoog of gemiddeld
- Schakelaar **Bonafbeelding opslaan** — houd de foto gekoppeld aan de uitgave

Controleer en corrigeer eventuele details en daarna:
- Tik op **Uitgave opslaan** om te bevestigen
- Tik op **Opnieuw scannen** om een andere foto te proberen

### Tips voor het beste resultaat

- Fotografeer bij goed licht — vermijd schaduwen en weerkaatsing
- Zorg dat de hele bon zichtbaar en vlak is
- Houd de camera stil om vervaging te voorkomen
- Gebruik **Aanvullende instructies voor de AI** voor speciale behandeling (bijv. "Dit is in EUR", "Negeer het eerste item")

### Items bewerken

AI-extractie is niet altijd perfect — een cijfer in de prijs kan wegvallen, een korting kan in een stukprijs terechtkomen, of een regel kan bij het scannen helemaal gemist worden. Je hoeft niet opnieuw te scannen of de hele uitgave te verwijderen om dit te corrigeren:

- **Tik op een item** in de lijst om de naam, hoeveelheid, stukprijs of totaalprijs te bewerken. Tik op **Opslaan** om de correctie toe te passen.
- **Tik op het prullenbakicoon** naast een item om het te verwijderen — handig voor een dubbele of verzonnen regel.
- **Tik op + Product toevoegen** onderaan de lijst om een regel toe te voegen die de scan gemist heeft.

Elk item wordt getoond — er is geen limiet, hoeveel de bon er ook heeft. Elke wijziging werkt de categorieverdeling en de totalen direct bij, zodat wat je opslaat altijd overeenkomt met wat je op het scherm ziet. Het totaalbedrag, de korting en het statiegeld van de bon blijven zoals gescand — alleen de afzonderlijke items zijn bewerkbaar.

### Categorieverdeling

Kassabonnen van de supermarkt combineren vaak meerdere soorten aankopen in één keer — eten, huishoudelijke producten, alcohol. Wanneer de app meer dan één soort item op een bon herkent, verdeelt hij de uitgave automatisch over de bijbehorende categorieën in plaats van alles onder één categorie te plaatsen.

- Op het bevestigingsscherm verschijnt boven de itemlijst een rij categoriechips met het label **Verdelen op categorie** (bijvoorbeeld "Boodschappen 180 · Huishouden 35 · Alcohol 25"), die laat zien hoe het totaalbedrag wordt opgesplitst.
- Tik op **Categorieën wijzigen** om een lijst van alle items te openen en aan te passen tot welke categorie elk item behoort. Je wijzigingen gelden meteen — en worden onthouden, zodat hetzelfde product de volgende keer dat je het scant automatisch goed wordt gecategoriseerd.
- Als de items niet voldoende overeenkomen met het totaalbedrag van de bon, valt de app terug op één categorie in plaats van te gokken.
- Statiegeld voor flessen en blikjes wordt herkend en als eigen categorie weergegeven, zodat je ziet hoeveel van je uitgaven verpakking is die je terugkrijgt.
- Dit telt nu ook mee voor je categoriebudgetten — een budget op een categorie die alleen binnen een bonverdeling voorkomt, zoals Alcohol of statiegeld, wordt eindelijk correct bijgehouden, en een Boodschappen-budget telt de huishoudelijke producten of het statiegeld van dezelfde bon niet meer mee.
- Soms past geen van je bestaande categorieën bij een groep items. In dat geval stelt de app een gloednieuwe categorie voor, weergegeven als een chip met een **+**-teken (bijvoorbeeld "+ Schoonmaakmiddelen 10"). Die wordt nog niet aangemaakt — tik op **Categorieën wijzigen** om de items ervan aan een bestaande categorie toe te wijzen, of hem te laten zoals voorgesteld. De nieuwe categorie wordt pas echt aangemaakt zodra je de bon opslaat.

Werkt hetzelfde of je nu scant via de app of via de Telegram-, WhatsApp- of Slack-bots.

### Een stapel bonnen achter elkaar scannen

Heb je een week aan papieren bonnen verzameld? Na het opslaan van een bon krijg je twee keuzes in plaats van dat het scherm gewoon sluit:

- **Nog een scannen** — gaat direct terug naar de camera zonder het scherm te verlaten, zodat je een hele stapel achter elkaar kunt afhandelen
- **Klaar** — rondt af en brengt je terug naar waar je begon

Terwijl je scant, laat een kleine teller zien hoeveel bonnen je deze sessie al hebt opgeslagen. Elke 15 bonnen geeft de app een vriendelijke herinnering dat je door kunt gaan of een pauze kunt nemen — je voortgang is sowieso al opgeslagen. De teller wordt gereset zodra je het scherm verlaat; hij is er alleen om je een gevoel van voortgang te geven tijdens één sessie.

### Al gescande bonnen

De app waarschuwt je voordat een bon twee keer in je uitgaven belandt:

- **Hetzelfde bestand opnieuw** — kies je een foto of PDF die al gescand en opgeslagen is, dan krijg je de vraag *vóór* het uitlezen, zodat er geen AI-verzoek wordt verbruikt. **Openen** toont de opgeslagen uitgave, **Toch scannen** leest de bon opnieuw, **Annuleren** annuleert.
- **Dezelfde bon, nieuwe foto** — bestaat er na het uitlezen al een uitgave met dezelfde winkel, hetzelfde bedrag en dezelfde datum (±1 dag), dan toont het bevestigingsscherm een gele melding met een knop **Openen**. Opslaan kan nog steeds: het kan echt een tweede aankoop zijn.
- **Al vastgelegd door je bank** — kwam de overeenkomende uitgave uit een bankmelding of een geïmporteerd afschrift, dan zegt de melding dat en biedt **Samenvoegen tot één uitgave** aan. Aangevinkt bewaart opslaan het bonnetje (artikelen, foto en categorie) en vervangt het de bankregel, zodat de aankoop één keer telt. Komen alleen bedrag en datum overeen, dan staat het vakje eerst uit — controleer vóór het samenvoegen.

De bots in Telegram, WhatsApp en Slack waarschuwen op dezelfde manier en bieden een knop **Toch scannen**.

### Delen vanuit een andere app (Android)

Heb je een bon als screenshot, een bevestiging uit je bank-app of een e-bon als pdf? Je hoeft de scanner niet te openen:

1. Tik in een willekeurige app (galerij, Gmail, je bank, een winkel-app) op **Delen**
2. Kies **AI Budget**
3. De app opent meteen het ingevulde bevestigingsscherm — controleer het en tik op **Opslaan**

Je kunt **afbeeldingen en pdf's** delen, tot **10 bestanden tegelijk** (pdf tot 10 MB). Meerdere bestanden worden na elkaar losse uitgaven — de titel toont de voortgang ('Bon 2 van 5') en **Volgende** gaat naar het volgende bestand. Kan een bestand niet worden gelezen, kies dan **Overslaan** of **Handmatig invoeren**. Bij sluiten vraagt de app eerst voordat wachtende bestanden worden weggegooid. Elk bestand telt als één bonscan binnen je AI-limiet; is die op, dan blijven de overige bestanden voor later.

Delen werkt alleen op Android. Gebruik op iPhone en in de web-app **Bon scannen**.

### E-bonnetjes doorsturen per e-mail

Veel winkels en webshops mailen je een bonnetje of een orderbevestiging. In plaats van het te scannen kun je het doorsturen naar je eigen privéadres — elke doorgestuurde e-mail verschijnt in de app als een uitgave die op je wacht. **Er wordt niets opgeslagen tot je het bevestigt.**

> **Wordt geleidelijk uitgerold.** Deze functie wordt stap voor stap ingeschakeld. Zie je **Bonnetjes per e-mail** in **Instellingen**, dan kun je hem gebruiken. Zie je hem nog niet, dan is hij nog niet beschikbaar voor je account.

#### Je adres

1. Open **Instellingen** → **Bonnetjes per e-mail**
2. Tik op **Mijn adres aanmaken** (alleen eigenaren en bewerkers van een account kunnen dit)
3. Tik onder **Je privéadres** op **Kopiëren**
4. Kies onder **Bonnetjes toevoegen aan** het account waarin bevestigde bonnetjes worden opgeslagen (alleen accounts die je kunt bewerken staan erbij)

Het adres is van jou, niet van het account — leden van een gedeeld account zien de e-mails die jij doorstuurt nooit.

#### Doorsturen instellen in Gmail

1. Open in Gmail **Instellingen** → **Alle instellingen bekijken** → **Doorsturen en POP/IMAP** → **Een doorstuuradres toevoegen** en plak je privéadres
2. Gmail stuurt een bevestigingscode naar dat adres. Die verschijnt in de app onder **Instellingen** → **Bonnetjes per e-mail** op een kaart **Gmail-bevestigingscode** met een knop **Kopiëren**. Voer hem in Gmail in. De code staat alleen in de app — nooit in een melding — en maar ongeveer 30 minuten; is hij weg, laat Gmail hem dan opnieuw sturen
3. Maak een **filter** (**Instellingen** → **Filters en geblokkeerde adressen**) voor het afzenderadres van de winkel of een onderwerp zoals "bonnetje" of "bestelling" en kies **Doorsturen naar** je adres

Stuur niet al je e-mail door — gebruik een filter, voor je privacy en zodat niet-gerelateerde berichten je AI-limiet niet opgebruiken.

#### Doorsturen instellen in Outlook

1. Open in Outlook **Instellingen** → **E-mail** → **Regels** en voeg een regel toe voor berichten van de winkel of met "bonnetje" in het onderwerp
2. Kies de actie **Doorsturen naar** en voer je privéadres in

Sommige Outlook.com- en Microsoft 365-accounts blokkeren automatisch doorsturen naar externe adressen. Is dat bij jou zo, stuur dan elk bonnetje handmatig door — handmatig doorsturen vanaf je telefoon werkt net zo goed.

#### Een bonnetje bevestigen

Zodra een doorgestuurd bonnetje is gelezen, krijg je een melding en verschijnt er een banner op het scherm Transacties: **Bonnetjes per e-mail om te bevestigen: N**. Je kunt de lijst ook altijd openen via **Instellingen** → **Bonnetjes per e-mail** → **Inbox met bonnetjes per e-mail openen**.

- Het tabblad **Te bevestigen** toont de bonnetjes die op je wachten. Tik op een bonnetje om het vertrouwde bevestigingsscherm voor bonnen te openen, controleer de gegevens en tik op **Uitgave opslaan**
- Lijkt het bonnetje op een uitgave die je al hebt, dan zie je dezelfde waarschuwing voor een dubbele bon als bij scannen, inclusief **Samenvoegen tot één uitgave**
- Tik op **Negeren** om een bonnetje te laten vallen zonder het op te slaan
- Het tabblad **Afgehandeld** toont wat is overgeslagen: een bonnetje dat je al hebt, een e-mail zonder bonnetje, een bonnetje dat niet gelezen kon worden of een dat ongelezen bleef omdat je AI-limiet bereikt was — tik waar mogelijk op **Opnieuw proberen**

Elk gelezen e-bonnetje telt als één bonscan binnen je AI-limiet; dubbele bonnen en e-mails zonder bonnetje worden overgeslagen zonder die te gebruiken. Stuurt een winkel alleen een link naar het bonnetje, stuur dan de pdf door — links worden nooit geopend. Een foto van het bonnetje kan bij de uitgave bewaard worden; een pdf of een gewone e-mail wordt niet bijgevoegd. De lijst heeft een internetverbinding nodig.

#### Als je adres uitlekt

Tik op **Adres vernieuwen**. Het oude adres werkt meteen niet meer en e-mail die ernaartoe wordt gestuurd, wordt geweigerd. Pas daarna de doorstuurregel in je mailbox aan naar het nieuwe adres (Gmail vraagt opnieuw om een bevestigingscode). Wil je helemaal geen e-bonnetjes meer ontvangen, tik dan op **Adres uitschakelen**.

#### Privacy en bewaartermijn

- Onze server leest een doorgestuurde e-mail tijdens de verwerking, net als elk bonnetje dat je scant
- Alleen het bonnetje zelf wordt bewaard, nooit de hele e-mail. Links in de e-mail worden nooit geopend en afbeeldingen nooit geladen
- Het opgeslagen bonnetje wordt verwijderd zodra je het bevestigt of negeert; onbevestigde items worden na 30 dagen automatisch verwijderd
- Bonnetjes per e-mail zijn **niet beschikbaar** voor accounts met **Niveau 2 — Volledige versleuteling**. Met versleuteling op Niveau 1 werken ze, maar onbevestigde items worden dan na 7 dagen verwijderd. Zie [Versleuteling](./15-encryption.md)

## Spraakinkomsten

Leg ontvangen betalingen vast met spraak — dezelfde flow als Spraakuitgave, geoptimaliseerd voor inkomsten.

### Hoe het werkt

1. Tik op **Spraakinkomsten** bij de snelle acties op het Dashboard, of tik op het microfoonpictogram in de voettekst van het formulier **Inkomsten toevoegen**
2. Tik op de (groene) microfoonknop om de opname te starten
3. Spreek natuurlijk, bijvoorbeeld: *"500 ontvangen van klant, consultancyhonorarium"*
4. Tik nogmaals om de opname te stoppen
5. De app haalt het bedrag, de omschrijving en de best passende **inkomstencategorie** eruit

### Bevestigingsscherm

- **Bedrag** — uit je spraak gehaald (bewerkbaar)
- **Omschrijving** — waar de betaling voor was (bewerkbaar)
- **Categorie** — inkomstencategorie automatisch toegewezen (bewerkbaar)
- **Valuta** — gedetecteerd of standaard ingesteld op je basisvaluta

Tik op **Inkomsten opslaan** om te bevestigen, of op **Opnieuw proberen** om opnieuw op te nemen.

### Tips voor het beste resultaat

- Noem het bedrag en een korte omschrijving
- Noem de valuta als die afwijkt van je standaard

---

## Factuur scannen

Fotografeer of upload een factuur of betalingsdocument om inkomsten automatisch vast te leggen.

### Hoe het werkt

1. Tik op **Factuur scannen** bij de snelle acties op het Dashboard, of tik op het documentpictogram in de voettekst van het formulier **Inkomsten toevoegen**
2. Kies **Foto maken**, **Kies uit galerij** of **Pdf uploaden**
3. Voer optioneel aanvullende instructies voor de AI in
4. De app haalt het totaalbedrag, de datum en de categorie eruit

### Bevestigingsscherm

- **Totaalbedrag** — uit het document gehaald
- **Omschrijving** — gegenereerde samenvatting
- **Categorie** — inkomstencategorie automatisch toegewezen
- **Datum** — van het document

Controleer de details, tik op ✓ om op te slaan of op het potloodpictogram om het volledige formulier Inkomsten toevoegen te openen met de gegevens vooraf ingevuld.

> **Let op:** Factuur-OCR haalt alleen het totaal en de datum eruit. Regelitems van facturen worden bewust genegeerd om dubbeltellen op factuurdocumenten met meerdere regels te voorkomen.

---

## Veelgestelde vragen

- **V: Welke talen ondersteunt spraakinvoer?**
  **A:** Spraakinvoer werkt het best in de taal waarop je app is ingesteld. Het ondersteunt alle 8 app-talen.

- **V: Kan ik bonnen in elke taal scannen?**
  **A:** Ja, de AI kan bonnen in de meeste talen verwerken en haalt bedragen en items eruit, ongeacht de taal van de bon.

- **V: Welke pdf-bestanden worden ondersteund?**
  **A:** Zowel digitale pdf's (bijv. Amazon- of PayPal-facturen) als gescande pdf-bonnen worden ondersteund. De maximale bestandsgrootte is 10 MB. Digitale pdf's met selecteerbare tekst worden sneller en nauwkeuriger verwerkt. Zorg voor het beste resultaat met gescande pdf's dat de scan helder is en veel contrast heeft.

- **V: Waarom was het bedrag verkeerd na het scannen?**
  **A:** AI-extractie is niet altijd perfect. Controleer altijd het bevestigingsscherm en corrigeer eventuele fouten voordat je opslaat. Wazige of beschadigde bonnen kunnen minder nauwkeurige resultaten geven. Als een specifiek item onjuist is, tik erop om het direct te bewerken — zie **Items bewerken** hierboven.

- **V: Gebruikt spraak-/bonnenscannen mijn AI-verzoeken?**
  **A:** Ja, elke spraakinvoer of bonscan gebruikt één AI-verzoek uit je maandelijkse tegoed.

- **V: Waarom werd één bon over meerdere categorieën verdeeld in mijn grafieken?**
  **A:** Wanneer een bon duidelijk verschillende soorten items combineert (bijvoorbeeld boodschappen en alcohol), verdeelt de app deze automatisch over de bijbehorende categorieën in je uitgavengrafieken — en ook in je categoriebudgetten. Tik op **Categorieën wijzigen** op het bevestigingsscherm van de bon om dit aan te passen — correcties worden onthouden voor de volgende keer.

---

*Zie ook: [Uitgaven & Inkomsten](./03-expenses-and-income.md) | [AI-chat](./07-ai-chat.md)*
