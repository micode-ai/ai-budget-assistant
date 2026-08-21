---
title: "Wat gebeurt er als je bank niet op de lijst staat"
meta_description: "Staat jouw bank niet op de lijst? Zo herkent AI de kolommen in een CSV of leest een PDF-afschrift, zodat je bijna elke bank toch kunt importeren."
target_keyword: "bankafschrift van elke bank importeren"
slug: "bankafschrift-van-elke-bank-importeren"
pair: "ai-bank-import"
lang: "nl"
date: "2026-08-20"
---

# Wat gebeurt er als je bank niet op de lijst staat

Je uploadt je bestand in de verwachting dat de app de kolommen automatisch koppelt, en in plaats daarvan krijg je een koppelscherm, of erger, een lege transactielijst. Jouw bank hoort simpelweg niet bij de banken die de app meteen herkent. Dat is een bekende teleurstelling, vooral op het moment dat je net had besloten om in één keer maanden aan uitgaven bij te werken, en het bestand van een kleinere bank, een wisselkantoor of een lokale coöperatieve bank zich niet netjes in kolommen laat zetten.

Het goede nieuws: "niet op de lijst" betekent niet "niet te importeren". Dit artikel legt precies uit wat er op de achtergrond gebeurt wanneer AI Budget Assistant het formaat van een bestand niet herkent, en waarom het mechanisme dat dan in werking treedt veiliger is dan het op het eerste gezicht lijkt.

## Waarom geen banklijst ooit compleet is

Elke budget-app die import ondersteunt, moet vooraf beslissen welke banken hij direct herkent. AI Budget Assistant herkent automatisch onder meer mBank, PKO, Revolut, ING, Millennium en Pekao, plus Wise en PDF-afschriften van Erste en Alior. Dat dekt de meeste gangbare rekeningen in Polen, maar bankrekeningen zijn niet beperkt tot de grote namen. Er zijn kleinere banken, zakelijke rekeningen met een niet-standaard export, buitenlandse rekeningen, en exports uit andere financiële apps die iemand probeert over te zetten bij het wisselen van tool.

Voor elk van die formaten permanent een eigen parser onderhouden is niet haalbaar, en elk nieuw formaat zou toch een tijdje "niet ondersteund" blijven totdat iemand het opmerkte en er een regel voor schreef. In plaats van te wachten tot de lijst uitgroeit tot jouw bank, heeft de app daarom een mechanisme dat zelf probeert de structuur te doorgronden van een bestand dat hij nog nooit heeft gezien.

## Wat er gebeurt als een bestand niet wordt herkend

Wanneer je een CSV- of XLSX-bestand uploadt en geen van de ingebouwde parsers de opmaak herkent, komt er een AI-model in beeld. De taak daarvan is smal en concreet: het leest geen bedragen of datums zelf, het geeft alleen aan **welke kolom welke is** - welke de transactiedatum bevat, welke het bedrag, welke de omschrijving of winkelnaam. Die kolomnamen worden vervolgens woord voor woord vergeleken met de koppen die daadwerkelijk in je bestand staan. Zou het model een kolom "verzinnen" die niet in het bestand voorkomt, dan wordt het hele antwoord verworpen, niet stilletjes aangenomen. Alleen na die controle lezen dezelfde, deterministische regels die ook handmatige kolomkoppeling afhandelen, daadwerkelijk de cijfers en datums uit het bestand.

Bij PDF-afschriften, een functie van het Pro-abonnement, werkt het mechanisme anders, omdat je niet zomaar kolomnamen uit een PDF kunt halen - het model moet de transactieregels zelf uit de geëxtraheerde paginatekst destilleren. Dat is dezelfde soort taak die handgeschreven parsers voor Erste of Alior al deden, alleen komt het model in plaats van eigen code per bank uit met een opmaak die nog niemand heeft beschreven.

## Wat dit mechanisme nooit doet

Dit onderscheid is belangrijk, want het is verleidelijk te denken dat "AI importeert het afschrift" betekent dat het model de cijfers gewoon raadt. Dat is niet zo. Aan de CSV- en XLSX-kant geeft het model nooit een bedrag of een datum terug - het geeft alleen kolomnamen terug, en die worden altijd vergeleken met de echte koppen in je bestand. De cijfers en datums zelf worden gelezen door dezelfde voorspelbare code die al jaren handmatige kolomkoppeling afhandelt. Dat maakt het mechanisme een hulpmiddel bij het herkennen van structuur, niet iemand die je uitgaven op gevoel invoert.

Dat is nog steeds geen garantie voor volledige nauwkeurigheid meteen bij de eerste poging - geen enkel formaatherkenningsmechanisme biedt dat. Daarom krijg je, voordat er iets in je budget terechtkomt, een voorbeeld om te controleren, waarover hieronder meer.

## Wat je ziet en waarmee je instemt voordat er iets je telefoon verlaat

Voordat enig deel van het bestand het AI-model bereikt, vraagt de app om toestemming, eenmalig per account, en toont precies wat er verstuurd wordt. Voor een CSV- of XLSX-bestand is dat de kopregel plus maximaal tien voorbeeldregels - niet het hele bestand en niet je volledige transactiegeschiedenis. Voor een PDF-afschrift zijn dat de eerste twintig geëxtraheerde tekstregels. Je ziet dit op het toestemmingsscherm voordat er iets gebeurt, zodat de beslissing bewust is en geen standaardinstelling.

Heeft je account volledige end-to-end-versleuteling (de volledige privacymodus van de app), dan draait dit mechanisme helemaal niet. Gegevens die de app zelf niet kan ontsleutelen, kunnen ook niet naar een AI-model worden gestuurd - voor zulke accounts is daarom alleen handmatige kolomkoppeling beschikbaar, veiliger, al kost het één tik extra.

## Jij controleert en corrigeert voordat er iets wordt opgeslagen

Nadat het model een koppeling voorstelt, zie je geen ruw resultaat zonder context. Je ziet een rij bewerkbare "chips" die tonen wat er herkend is, zoiets als "Datum → Data operacji" of "Bedrag → Suma transakcji". Klopt er een niet, dan opent "Verkeerd? Corrigeer" dezelfde handmatige kolomkoppelaar, al voor-ingevuld met het voorstel van het model, zodat je één kolom corrigeert in plaats van vanaf nul te beginnen.

Dit is dezelfde voorbeeldstap die bij elke import in AI Budget Assistant komt, of de bank nu meteen werd herkend of alleen met hulp van AI: een volledige lijst met transacties om te controleren voordat er iets in je budget terechtkomt, met categorieën die al automatisch zijn voorgesteld op basis van de winkel.

## De tweede keer gaat sneller

Zodra een kolomkoppeling voor een bepaald formaat correct blijkt, wordt de vorm ervan - alleen de kolomnamen zelf en hoe datums genoteerd zijn, zonder enige van je persoonlijke gegevens of transacties - opgeslagen in een globaal woordenboek van formaten. De volgende gebruiker die een afschrift van dezelfde bank uploadt, heeft de AI-stap helemaal niet meer nodig - het formaat wordt meteen herkend, net als bij mBank of PKO. In zekere zin ben jij degene die je formaat "ontsluit" voor iedereen die na jou komt.

## Zo probeer je het uit

Heb je nog ergens een bestand van een bank waarvan je het importeren eerder had opgegeven omdat de app het niet herkende, dan is het de moeite waard om het opnieuw te proberen. Upload de CSV, XLSX of PDF in [AI Budget Assistant](https://ai-budget.pl), en herkent geen van de ingebouwde parsers het, dan zie je het hierboven beschreven toestemmingsscherm in plaats van een lege lijst. Na je toestemming krijg je een voorbeeld met een voorgestelde koppeling om te controleren, net als bij elke andere import.

Het volledige verloop van een import, van het ophalen van het bestand bij je bank tot het voorkomen van dubbelingen bij een nieuwe import, staat in onze gids [bankafschrift importeren in je budget-app](/blog/nl/bankafschrift-importeren/). Wil je helemaal geen bestanden meer aanraken en wil je dat de app uitgaven meteen vastlegt vanuit de betaalmeldingen van je bank, bekijk dan hoe [uitgaven automatisch bijhouden](/blog/nl/uitgaven-automatisch-bijhouden/) werkt. De app is gratis te gebruiken in de browser op [ai-budget.pl](https://ai-budget.pl), zonder creditcard, en beschikbaar voor Android op [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## Veelgestelde vragen: een afschrift importeren van een bank die niet op de lijst staat

**Wat gebeurt er als mijn bank niet direct wordt ondersteund?**

Upload je een CSV of XLSX die geen van de ingebouwde parsers herkent, dan probeert AI Budget Assistant zelf te achterhalen welke kolom de datum, het bedrag en de omschrijving is, en toont het resultaat om te controleren en te corrigeren. Bij PDF-afschriften (Pro-functie) haalt het mechanisme de transactieregels rechtstreeks uit de tekst van het document. In beide gevallen krijg je een volledig voorbeeld voordat er iets wordt opgeslagen.

**Kan de AI zich vergissen en een verkeerd bedrag invullen?**

Aan de kant van CSV- en XLSX-bestanden leest het AI-model zelf nooit bedragen of datums - het geeft alleen aan welke kolom welke is, en die namen worden vergeleken met de echte koppen in je bestand, waardoor een verzonnen kolom wordt verworpen. De cijfers zelf worden gelezen door hetzelfde mechanisme als bij handmatige koppeling. In elk geval krijg je vóór het opslaan een voorbeeld van alle transacties, om te controleren en te corrigeren wat er niet klopt.

**Wordt de inhoud van mijn afschrift ergens naar toegestuurd?**

Voordat enig fragment van het bestand het AI-model bereikt, zie je een toestemmingsscherm, eenmalig per account, dat precies toont wat er verstuurd wordt: de kopregel plus maximaal tien voorbeeldregels voor een CSV of XLSX, of de eerste twintig tekstregels voor een PDF-afschrift. Accounts met volledige end-to-end-versleuteling gebruiken dit mechanisme helemaal niet, omdat de app geen toegang heeft tot hun gegevens om ze naar het model te sturen.

**Werkt AI-ondersteunde import net zo goed als voor mBank of PKO?**

Dat hangt af van het bestandsformaat, maar het mechanisme is zo ontworpen dat de herkenning na verloop van tijd steeds beter wordt: zodra de kolomkoppeling voor een nieuwe bank correct blijkt, wordt alleen de opmaak van het bestand (zonder je gegevens) opgeslagen in een globaal woordenboek, zodat een volgende import van hetzelfde bankformaat de AI-stap niet meer nodig heeft. Het blijft altijd de moeite waard om het voorbeeld te bekijken voordat je de import bevestigt, net als bij elke andere bank.

---

*Verwante artikelen: [Bankafschrift importeren in je budget-app](/blog/nl/bankafschrift-importeren/) | [Uitgaven automatisch bijhouden zonder alles te typen](/blog/nl/uitgaven-automatisch-bijhouden/)*
