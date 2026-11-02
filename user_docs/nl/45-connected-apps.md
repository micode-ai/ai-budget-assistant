# Gekoppelde apps & ontwikkelaars

> Laat een andere app die je gebruikt – je boekhoudsoftware bijvoorbeeld – met je uitgaven in AI Budget werken, zie precies wat die app mag, en sluit hem met één tik weer af. Ontwikkelaars kunnen zulke apps bouwen op de AI Budget API.

## Wat het betekent om een app te koppelen

Sommige producten kunnen vanuit hun eigen schermen met je AI Budget-gegevens werken: een boekhoudapp kan je uitgaven en bonnetjes ophalen, of uitgaven voor je toevoegen. Om dat toe te staan koppel je de app aan **één of meer** van je AI Budget-rekeningen.

De app ziet nooit je wachtwoord. Als je in de app op 'AI Budget koppelen' klikt, kom je op een pagina van AI Budget. Daar log je in zoals altijd en zie je:

- de naam van de app, de website en wie hem gemaakt heeft;
- **Geverifieerd door AI Budget** (een app die wij gecontroleerd hebben, zoals onze eigen) of **Niet geverifieerd door AI Budget**;
- de lijst met machtigingen die de app vraagt;
- **Te koppelen rekeningen** – bij elke rekening een vakje. Vink elke rekening aan die de app mag gebruiken; **Toestaan** blijft uitgeschakeld tot er minstens één is aangevinkt. Kan er maar één rekening gekoppeld worden, dan is die al aangevinkt. Rekeningen die je alleen mag bekijken of die volledig versleuteld zijn, staan grijs met de reden, en een rekening met tekstversleuteling is als alleen-lezen gemarkeerd.

Tik op **Toestaan** om te koppelen, of op **Weigeren** om zonder koppeling terug te gaan naar de app. Sta alleen apps toe die je vertrouwt.

**De app opnieuw koppelen.** Is de app al gekoppeld, dan opent het scherm met de rekeningen die hij al heeft aangevinkt, plus elke andere rekening die nog gekoppeld kan worden. Wat je aanvinkt is de volledige lijst: vink een nieuwe rekening aan om hem toe te voegen, of haal een vinkje weg om de app van die rekening af te sluiten. De toegang tot de rekeningen die aangevinkt blijven, werkt zonder onderbreking door.

Heeft een app meerdere rekeningen, dan geeft hij bij elk verzoek zelf aan om welke het gaat – jij hoeft niets te doen.

## Wat elke machtiging toestaat

- **Je uitgaven zien: bedragen, datums, categorieën, artikelen en tags** – de app kan de uitgaven van de gekoppelde rekening lezen, inclusief de artikelen op een bonnetje en latere wijzigingen en verwijderingen.
- **Uitgaven toevoegen, wijzigen en verwijderen** – de app mag in die rekening schrijven. Uitgaven die hij toevoegt tonen op het uitgavenscherm **Toegevoegd via** met de naam van de app.
- **Foto's van je bonnetjes downloaden** – de app kan de foto of pdf van het bonnetje bij een uitgave downloaden.
- **Je uitgavencategorieën zien** – de app kan je categorielijst lezen, zodat hij nieuwe uitgaven goed indeelt.

Elke gekoppelde app ziet ook de naam, het type en de valuta van de rekeningen die je hebt aangevinkt, en jouw naam. Je e-mailadres krijgt hij nooit, en een rekening die je niet hebt aangevinkt ziet hij niet.

## Apps bekijken en ontkoppelen

Open **Instellingen → Gekoppelde apps**. Elke app is één rij, met de rekeningen waaraan hij gekoppeld is, wie hem wanneer gekoppeld heeft, wanneer hij voor het laatst gebruikt is en welke machtigingen hij heeft.

Om **één rekening** af te sluiten, tik je ernaast op **Rekening verwijderen** en bevestig je. De app verliest die rekening meteen – zijn volgende verzoek ervoor wordt geweigerd – terwijl zijn andere rekeningen blijven werken. Verwijder je de laatste rekening, dan is de app helemaal ontkoppeld.

Om de hele app af te sluiten, tik je op **Ontkoppelen** en bevestig je. Hij verliest in één keer de toegang tot al zijn rekeningen. Uitgaven die hij al heeft toegevoegd blijven in je rekeningen staan. Wil je de app weer gebruiken, koppel hem dan opnieuw vanuit de app.

Telkens als een app gekoppeld wordt of er rekeningen bij krijgt, sturen we een e-mail naar degene die dat deed, met de toegevoegde rekeningen. Krijg je zo'n mail en herken je de app niet, ontkoppel hem dan meteen.

Zie je **Gekoppelde apps** niet in de Instellingen, dan is het koppelen van apps nog niet beschikbaar.

## Gedeelde rekeningen

Alleen een **eigenaar** of **bewerker** van een rekening kan er een app aan koppelen; wie een rekening alleen mag bekijken, ziet hem grijs.

Een app die aan een gedeelde rekening gekoppeld is, ziet de uitgaven van **alle** leden, niet alleen die van degene die hem gekoppeld heeft. Daarom zien alle eigenaren en bewerkers van zo'n rekening de app onder **Gekoppelde apps**, met wie hem gekoppeld heeft, en kunnen ze hem van die rekening verwijderen.

Van een koppeling zie je alleen de rekeningen waarvan je zelf eigenaar of bewerker bent – nooit de andere rekeningen die degene die de app koppelde heeft gekozen. Tik je op **Ontkoppelen**, dan verliest de app alleen die rekeningen van jou; voor degene die hem heeft ingesteld blijft hij gekoppeld, en alleen die persoon kan hem helemaal ontkoppelen. Koppelt een bewerker een app, dan krijgen ook de eigenaren van de gekoppelde rekeningen een e-mail, met alleen hun eigen rekeningen erin.

Wordt degene die de app gekoppeld heeft later alleen-lezer, of verlaat die een rekening, dan werkt de app niet meer voor die rekening; zijn andere rekeningen blijven ongemoeid. Een verwijderde rekening wordt automatisch van de app losgekoppeld.

## Versleutelde rekeningen

- Een rekening met **volledige versleuteling** (ook de bedragen) kan helemaal niet gekoppeld worden – de app zou er niets in kunnen lezen.
- Een rekening met **tekstversleuteling** kan **alleen-lezen** gekoppeld worden: de app ziet bedragen, datums en categorieën, maar omschrijvingen, notities, winkels, artikelnamen, tags en andere versleutelde tekst blijven verborgen, en hij kan geen uitgaven toevoegen of wijzigen.

Wat elk niveau omvat, lees je in [End-to-end-versleuteling](./15-encryption.md).

## Voor ontwikkelaars

Je kunt je eigen app bouwen op de AI Budget API – gratis. Open **Instellingen → Ontwikkelaars** en tik op **App maken**: geef een naam, een website en de redirect-adressen die hij gebruikt, en kies **Server-app** of **Mobiele of browser-app**. De **Client-ID** krijg je meteen; een server-app krijgt daarnaast een client secret die **maar één keer** getoond wordt – kopieer hem direct.

De volledige API-referentie en een stapsgewijze handleiding (in het Engels, Pools en Russisch) staan op [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), ook te bereiken via **API-documentatie** op het scherm Ontwikkelaars. Je kunt tot 10 apps registreren.
