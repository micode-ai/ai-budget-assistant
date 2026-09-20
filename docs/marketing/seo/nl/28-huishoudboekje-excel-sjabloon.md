---
title: "Huishoudboekje in Excel: sjabloon en de grens ervan"
meta_description: "Een werkend Excel-sjabloon voor je huishoudboekje: kolommen, categorieën en somformules, plus het eerlijke moment dat een spreadsheet tekortschiet."
target_keyword: "huishoudboekje in Excel"
slug: "huishoudboekje-excel-sjabloon"
pair: "excel-budget"
lang: "nl"
date: "2026-09-20"
---

# Huishoudboekje in Excel: sjabloon en wanneer het tekortschiet

Je zoekt een sjabloon voor je huishoudboekje in Excel, omdat je vandaag wilt beginnen, niet nog een artikel over motivatie wilt lezen. Terecht: een spreadsheet is echt genoeg om te starten, hij is gratis en je ziet elke formule zelf. Dit stuk geeft je een opzet die je in tien minuten kunt overnemen, en zegt daarna eerlijk op welk moment een spreadsheet je begint te beperken en wat er dan meestal gebeurt.

## Wat een goed Excel-sjabloon voor je huishoudboekje echt nodig heeft

De meeste huishoudboekje-spreadsheets die ik heb gezien, maken dezelfde fout: te veel tabbladen, te weinig structuur. Een werkend sjabloon heeft eigenlijk vier dingen nodig.

**Eén tabblad met transacties.** Niet drie bladen voor drie rekeningen en een apart briefje voor contant geld. Eén doorlopende lijst, één rij per uitgave.

**Een vaste lijst met categorieën.** Tien tot vijftien categorieën is de juiste maat: wonen, boodschappen, uit eten, vervoer, vaste lasten, gezondheid, abonnementen, shoppen, kinderen (indien van toepassing), sparen, schuldaflossing, ontspanning. Minder, en je verliest precies het detail dat een budget nuttig maakt. Meer, en het invoeren van een uitgave wordt zelf een klusje.

**Een overzichtstabblad.** Een kale lijst met transacties zegt op zichzelf niets. Je hebt een plek nodig die uitgaven per categorie en per maand optelt, zodat de cijfers ook echt iets zeggen.

**Een saldokolom.** Zien wat er nog over is, niet alleen wat je uitgaf, is precies het verschil tussen een dagboek en een budget.

## Een simpele opzet die je kunt overnemen

Je tabblad "Transacties" heeft vijf kolommen nodig: **Datum**, **Categorie**, **Omschrijving**, **Bedrag**, **Rekening/betaalmethode**. Meer is bij de start niet nodig. Voeg pas een kolom toe zodra je het gemis echt voelt.

Gebruik voor het overzicht een voorwaardelijke somformule: `SOM.ALS` in de Nederlandse versie van Excel, `SUMIF` in de Engelse en in Google Spreadsheets (de exacte naam hangt af van de taalinstelling van je bestand). Eén rij per categorie, één kolom per maand, en elke cel telt de bedragen op het transactietabblad op die aan beide voorwaarden tegelijk voldoen.

Je saldo bereken je het simpelst als een lopende som: startsaldo plus inkomsten min uitgaven, oplopend bijgehouden per rij of per maand op het overzichtstabblad. Het hoeft niet slim te zijn, het moet je alleen laten zien of je in de plus staat voordat het einde van de maand je verrast.

Dat is het zo ongeveer. Excel en Google Spreadsheets gedragen zich hier identiek, dus gebruik wat je toch al open hebt staan.

## Waar een spreadsheet begint te haperen

Eerlijk is eerlijk: voor wie het leuk vindt om hem bij te houden en simpele financiën heeft, houdt een spreadsheet jarenlang stand. Het probleem zit niet in de formules. Het zit erin dat iedere regel door een mens met de hand moet worden ingetypt, elke keer opnieuw.

Eén grote aankoop per maand is geen probleem. Twintig kleintjes (een koffie, een buskaartje, een zak chips, een bezorgmaaltijd) en de moeite om elke apart in te voeren begint zwaarder te wegen dan het nut van het bijhouden. Precies daarom loopt een budget vast: [wrijving](/blog/nl/uitgaven-bijhouden/), niet een gebrek aan wilskracht. De meeste mensen beginnen vol enthousiasme aan een budgetspreadsheet en laten hem binnen een paar weken stilletjes varen, uitgeput door precies het handmatige invoeren waar ze zelf aan begonnen.

Het tweede probleem duikt op zodra twee mensen samen budgetteren. De een wordt de eigenaar van het bestand en mailt het rond, de ander vult uitgaven met vertraging in of helemaal niet, en na een maand hebben jullie twee verschillende versies van hoeveel er echt nog over is.

## Wanneer het de moeite waard is om verder te gaan

Een paar signalen dat dit geen disciplineprobleem meer is, maar een gereedschapsprobleem:

- Er gaan regelmatig vier, vijf dagen voorbij voordat je het bestand opent en inhaalt.
- Je partner is stilletjes gestopt met invullen, omdat het bestand "van jou" is.
- Je wilt een uitgave zien op het moment dat hij gebeurt, niet hem een week later uit een bonnetje reconstrueren.
- Bijna alles betaal je met kaart of telefoon, waardoor elke transactie opnieuw met de hand in de spreadsheet zetten dubbel werk begint te voelen.

Geen van deze signalen betekent dat budgetteren niet voor je werkt. Ze betekenen dat de spreadsheet niet meer past bij hoe je echt geld uitgeeft.

## Wat er na de spreadsheet komt

Wat een spreadsheet overneemt, moet bewaren wat erin werkte, dus duidelijke categorieën, maandtotalen, een zichtbaar saldo, en precies weghalen wat hem de das omdeed: elke regel met de hand intypen. Dat is dezelfde wrijving die [onze gids over de beste budget app](/blog/nl/beste-budget-app/) uitgebreider behandelt, en die bepaalt of een tool langer dan twee weken overleeft, niet de lengte van de functielijst.

In AI Budget Assistant voeg je een uitgave toe met je stem ("tien euro voor de lunch"), door een bonnetje te fotograferen, of, op Android, zonder je telefoon aan te raken, omdat de app zelf de betaalmelding van je bank leest en de uitgave vastlegt. De geschiedenis die je al bij je bank hebt staan, upload je één keer als CSV of PDF in plaats van hem regel voor regel over te typen; [onze gids over het importeren van een bankafschrift](/blog/nl/bankafschrift-importeren/) laat precies die stap zien. Voor stellen werkt hetzelfde idee, alleen loggen jullie allebei vanaf je eigen telefoon in op één gedeeld, realtime overzicht, in plaats van een bestand heen en weer te mailen.

Je kunt zonder kaartgegevens beginnen, rechtstreeks in je browser op [ai-budget.pl](https://ai-budget.pl), of hem op Android installeren via [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: huishoudboekje in Excel

**Is er een gratis Excel-sjabloon voor een huishoudboekje?**
Je kunt er zelf een in ongeveer tien minuten bouwen volgens de opzet uit dit artikel: een transactietabblad met vijf kolommen, een vaste lijst met categorieën en een overzichtstabblad met een voorwaardelijke somformule. Kant-en-klare sjablonen uit de Excel- of Google Spreadsheets-galerij werken ook, maar die hebben meestal meer tabbladen dan je nodig hebt om te starten.

**Excel of Google Spreadsheets: wat is beter voor een huishoudboekje?**
Voor een huishoudboekje is het verschil vooral cosmetisch. Beide kennen dezelfde voorwaardelijke somformules en draaitabellen. Google Spreadsheets wint het als jullie met z'n tweeën budgetteren en tegelijk vanaf verschillende apparaten in hetzelfde bestand willen werken, zonder het rond te mailen.

**Hoe zorg ik dat ik niet vergeet mijn huishoudboekje in Excel bij te werken?**
Dat is echt lastig. Een vast moment kiezen, bijvoorbeeld zondagavond, helpt, maar de echte oplossing is de tijd om één uitgave in te voeren terugbrengen tot een paar seconden. Precies daarom bestaan bonnetjes scannen en spraakinvoer in budget-apps: ze halen exact de stap weg die mensen overslaan.

**Wanneer stap ik over van een spreadsheet naar een budget app?**
Als je regelmatig gaten in je invoer opmerkt, als de ander in jullie budget is gestopt met uitgaven invullen, of als bijna alles al kaartbetalingen zijn die je liever zou importeren dan overtypen. De spreadsheet zelf was nooit het probleem, het handmatige invoeren erachter meestal wel.

---

*Gerelateerde artikelen: [Uitgaven bijhouden: zo doe je het zonder gedoe](/blog/nl/uitgaven-bijhouden/) | [Beste budget app in 2026: een eerlijke koopgids](/blog/nl/beste-budget-app/) | [Bankafschriften automatisch importeren in je budget-app](/blog/nl/bankafschrift-importeren/)*
