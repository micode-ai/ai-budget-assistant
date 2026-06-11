# Dashboard

> Je financiële commandocentrum. Bekijk je budgetstatus, inkomsten, uitgaven en portemonneesaldo's in één oogopslag, met snelle acties om met één tik een uitgave toe te voegen. Je kunt afzonderlijke secties tonen of verbergen via [Instellingen](./11-settings.md) → Dashboard-widgets.

## Overzicht

Het Dashboard is het eerste scherm dat je ziet na het inloggen. Het toont je huidige accountcontext en de belangrijkste financiële cijfers voor de huidige maand.

![Dashboard met snelle acties en budgetoverzicht](../img/home-1.jpg)

## Accountwisselaar

Tik linksboven op de accountnaam (bijv. **Familie**) om het uitklapmenu **Account wisselen** te openen. Je kunt schakelen tussen je Persoonlijke, Gedeelde en Zakelijke accounts. Alle gegevens op het Dashboard worden bijgewerkt naar het geselecteerde account.

Naast de accountnaam staat een aparte **valutaknop** (bijv. `zł`) — tik erop om de weergavevaluta direct te wijzigen.

## Snelle acties

De snelle acties onder de header zijn een raster van knoppen voor de meest voorkomende taken. Wanneer er meer acties zijn dan in één rij passen, lopen ze door naar de volgende rij zodat alle acties zichtbaar blijven.

Beschikbare acties:

| Actie | Beschrijving |
|---|---|
| **Uitgave toevoegen** | Opent het handmatige uitgavenformulier |
| **Bon scannen** | Opent de camera om een bon te fotograferen voor AI-extractie |
| **Spraakinvoer** | Spreek je uitgave op natuurlijke wijze in |
| **Inkomsten via spraak** | Spreek je inkomsten op natuurlijke wijze in (standaard verborgen) |
| **Factuur scannen** | Fotografeer een factuur om inkomsten te registreren (standaard verborgen) |
| **Wisselen** | Opent het valutawisselformulier |
| **Wisselkoers** | Opent de valutaomrekener |
| **Overboekingen** | Opent het formulier voor portemonnee-overboekingen |

Je kunt deze balk aanpassen: ga naar **Instellingen → Dashboard-widgets**, open de sectie **Snelle acties**, zet acties aan of uit en sleep de handvatten om ze te herordenen. **Inkomsten via spraak** en **Factuur scannen** zijn standaard verborgen — schakel ze daar in als je inkomsten bijhoudt via spraak of factuurscan.

## Financiële gezondheidsscore

De widget **Financiële gezondheidsscore** toont één score van 0–100 die je algehele financiële gezondheid voor de huidige maand samenvat:

- **Groen (70–100)** — financiën zijn in topvorm
- **Geel (40–69)** — sommige punten hebben aandacht nodig
- **Rood (0–39)** — er zijn aanzienlijke problemen gedetecteerd

De cirkelvormige meter rechtsboven op de kaart vult zich evenredig met je score. Tik op de kaart om een uitsplitsingsblad te openen met vier onderdelen:

| Onderdeel | Max. ptn | Beschrijving |
|---|---|---|
| Budgetnaleving | 25 | % van actieve budgetten dat de limiet niet overschrijdt |
| Spaarquote | 25 | Zet je maandelijkse spaarpercentage lineair om (0% → 0 ptn, 20%+ → 25 ptn) |
| Doelvoortgang | 25 | % van actieve spaardoelen die op schema liggen voor hun deadline |
| Schuldgezondheid | 25 | Evenredig afgetrokken voor achterstallige schulden |

> **"Onvoldoende gegevens"** verschijnt wanneer minder dan twee onderdelen gegevens hebben (bijv. een gloednieuw account zonder budgetten, doelen, schulden of inkomsten).

De score wordt volledig op het apparaat berekend — geen internetverbinding of AI-aanroepen nodig.

## Gamification-widget

Onder de snelle acties toont een compacte kaart je gamification-voortgang:

- **Level** — je huidige level met een XP-voortgangsbalk naar het volgende level
- **Reeks** — het aantal dagen van je dagelijkse bijhoudreeks met een vuur- of sneeuwvlokemoji

Tik op deze kaart om het volledige **Prestaties**-scherm te openen met alle badges, reeksdetails en categoriefilters.

> Zie [Prestaties & Gamification](./13-gamification.md) voor details over hoe XP, levels en prestaties werken.

## Maandbudgetkaart

- Toont je huidige uitgaven afgezet tegen je maandbudget (bijv. **2 846,83 zl van 20 000,00 zl**)
- Kleurgecodeerde voortgangsbalk: groen (onder controle), geel (limiet nadert), rood/oranje (bijna over of over budget)
- Toont het **gebruikte percentage** (bijv. 86% gebruikt)
- Tik op de kaart om naar het tabblad **Budgetten** te gaan voor details

> **Let op:** Als er geen maandbudget is ingesteld, zie je een hint om er een te maken.

## Inkomsten & Uitgaven

![Dashboard gescrold — inkomsten, uitgaven, portemonnee](../img/home-2.jpg)

Een gecombineerde kaart die je maandtotalen naast elkaar toont:

- **Inkomsten** (links, groen) — je totale inkomsten voor de huidige maand (bijv. **+$2.482,52**). Tik om naar het tabblad **Transacties** te gaan (Inkomstenweergave)
- **Uitgaven** (rechts) — je totale uitgaven voor de huidige maand (bijv. **-$4.838,99**). Tik om naar het tabblad **Transacties** te gaan (Uitgavenweergave)

## Nettowinst

Onder de inkomsten- en uitgavenkaarten toont de widget **Nettowinst** hoeveel geld je deze maand daadwerkelijk hebt gespaard of verloren, en volgt de trend over de afgelopen 6 maanden als een lijngrafiek:

- **Nettowinst huidige maand** — boven de grafiek weergegeven in groen (positief) of rood (negatief)
- **Trend van 6 maanden** — een lijngrafiek die de maandelijkse nettowinst (inkomsten − uitgaven) over de afgelopen 6 maanden toont
- Tik op een datapunt in de grafiek om de exacte waarde voor die maand te zien

> **Formule:** Nettowinst = Totale inkomsten − Totale uitgaven (beide omgerekend naar je basisvaluta)

## Nettokapitaal

De widget **Nettokapitaal** toont je totale nettowaarde over alle portemonneevaluta's, omgerekend naar je basisvaluta:

- **Totaal nettokapitaal** — de som van alle portemonneesaldo's omgerekend naar je instellingenvaluta, weergegeven in groen (positief) of rood (negatief)
- **Uitsplitsing per valuta** — het huidige saldo van elke valuta wordt onder het totaal vermeld

> **Let op:** Nettokapitaal verschijnt pas nadat je je beginsaldo's in de portemonnee hebt ingesteld. Zie [Portemonnee & Wissel](./10-wallet-and-exchange.md) om ze te configureren.

## Fat Finder-kaart

Onder de schuldensectie toont de **Fat Finder**-kaart een samenvatting van je maandelijkse uitgaventoets:

- **Totale mogelijke besparing** — hoeveel je per maand zou kunnen besparen
- **Top 3 bevindingen** — een korte lijst met ernststippen en besparingsbedragen
- **Volledig rapport bekijken** — tik om het gedetailleerde Fat Finder-scherm te openen

Deze kaart vereist een **Pro- of Business-abonnement**. Gebruikers met een gratis abonnement zien een upgradeprompt.

> Zie [Fat Finder](./19-fat-finder.md) voor de volledige functiehandleiding.

## Kalender

De **Kalender**-widget toont een maandkalenderraster met gekleurde stippen die dagen met transacties aangeven:

- **Groene stip** — inkomsten geregistreerd op die dag
- **Rode stip** — uitgave geregistreerd op die dag
- **Vandaag** is gemarkeerd met een oranje cirkel
- **Maandnavigatie** — gebruik de pijlen links/rechts om tussen maanden te wisselen

Onder het kalenderraster toont een samenvattingsrij:

- **Inkomsten** — totale inkomsten voor de geselecteerde maand (omgerekend naar je basisvaluta)
- **Uitgaven** — totale uitgaven voor de geselecteerde maand
- **Nettowinst** — inkomsten min uitgaven, groen bij positief, rood bij negatief

Tik op **Tik om details te bekijken** om het volledige Kalender-scherm met drie tabbladen te openen:

| Tabblad | Inhoud |
|---|---|
| **Categorieën** | Inkomsten- en uitgavenuitsplitsingen per categorie — elke rij toont het categoriepictogram, de naam, het percentage en het bedrag. De nettowinst staat onderaan |
| **Portemonnees** | Het huidige saldo voor elke valutaportemonnee met het percentage van het totaal |
| **Transacties** | Chronologische lijst van alle transacties voor de maand. Tik op een dag in de kalender om naar die specifieke dag te filteren; tik nogmaals om de selectie op te heffen |

> **Tip:** Alle bedragen in de Kalender worden automatisch omgerekend naar je basisvaluta, zodat je nauwkeurige totalen ziet, zelfs over meerdere valuta's heen.

## Portemonneesaldo's

- Horizontaal scrollbare kaarten die je saldo in elke valuta tonen (bijv. **EUR 16.723,00**, **PLN 2 192,89**, **USD $56...**)
- Tik op **Alles bekijken** om naar de volledige Portemonnee-weergave met gedetailleerde uitsplitsingen te gaan
- Als er geen saldo's zijn ingesteld, zie je een prompt om je beginsaldo toe te voegen

## Trek omlaag om te vernieuwen

Trek ergens op het Dashboard omlaag om alle gegevens te vernieuwen en met de server te synchroniseren.

## Veelgestelde vragen

- **V: Waarom toont het Dashboard overal $0?**
  **A:** Je hebt nog geen uitgaven of inkomsten toegevoegd. Gebruik de snelle-actieknoppen om je eerste transactie toe te voegen.

- **V: Kan ik aanpassen wat er op het Dashboard verschijnt?**
  **A:** Ja. Ga naar **Instellingen → Dashboard-widgets** en zet afzonderlijke secties aan of uit. Je voorkeuren worden opgeslagen en blijven behouden na een herstart. Je kunt widgets ook verslepen om ze te herordenen. De balk met snelle acties is op dezelfde manier aanpasbaar — open de sectie **Snelle acties** in Instellingen → Dashboard-widgets om de knoppen te tonen, verbergen of herordenen.

---

*Zie ook: [Uitgaven & Inkomsten](./03-expenses-and-income.md) | [Portemonnee & Wissel](./10-wallet-and-exchange.md) | [Fat Finder](./19-fat-finder.md) | [Analyse](./06-analytics.md)*
