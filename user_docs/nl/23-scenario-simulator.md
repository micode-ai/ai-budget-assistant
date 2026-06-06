# Scenariosimulator

> Versleep schuifregelaars om je uitgaven- en inkomstencategorieën aan te passen — en zie precies hoeveel je spaargeld kan veranderen over 3, 6 of 12 maanden.

## Overzicht

Met de **Scenariosimulator** kun je "wat als?"-vragen over je financiën beantwoorden zonder echte gegevens aan te raken. Verschuif een schuifregelaar om je voedseluitgaven met 20% te verlagen, voeg een bijbaaninkomen van 1.000 zł toe, en zie direct hoe je cumulatieve spaargeld er over 6 maanden uitziet.

Alle berekeningen zijn lokaal — er worden geen gegevens ergens naartoe gestuurd, en er verandert niets in je werkelijke uitgavengeschiedenis.

## Hoe je het opent

Open het tabblad **Analyses** en tik op de banner **Scenariosimulator** boven aan het scherm.

## Hoe de cijfers worden berekend

De simulator gebruikt je **laatste 3 maanden aan transacties** om een maandgemiddelde per categorie te schatten:

```
maandgemiddelde = totaal voor categorie over de laatste 3 maanden ÷ 3
```

Alle bedragen worden omgerekend naar je basisvaluta met de huidige wisselkoersen.

## Uitgaven aanpassen

Elke uitgavencategorie verschijnt met het huidige maandgemiddelde en een schuifregelaar van **−100%** tot **+100%** in stappen van 5%.

- Sleep naar **links** (negatief) om bezuinigingen te modelleren — de balk wordt groen
- Sleep naar **rechts** (positief) om hogere uitgaven te modelleren — de balk wordt rood
- Het label onder de schuifregelaar toont het resulterende bedrag

## Inkomsten aanpassen

Inkomstencategorieën werken op dezelfde manier. Sleep naar rechts voor een salarisverhoging, sleep naar links voor een verlaging.

### Extra inkomsten toevoegen

Tik op **Extra inkomsten toevoegen** in de sectie Inkomsten om een eenmalige bron in te voeren (bijv. een bijproject of freelancewerk). Voer een omschrijving en een maandbedrag in. Je kunt meerdere rijen met extra inkomsten toevoegen.

## Projectiegrafiek

De grafiek toont het cumulatieve spaargeld over de geselecteerde periode:

- **Grijze lijn** — huidige koers (geen wijzigingen)
- **Gekleurde lijn** — scenariokoers (met jouw aanpassingen)

Gebruik de chips **3 / 6 / 12 maanden** boven de grafiek om de projectieperiode te wijzigen.

## Samenvattingskaarten

Drie kaarten onder de grafiek tonen de scenariototalen voor 3, 6 en 12 maanden naast elkaar. De momenteel geselecteerde periode is gemarkeerd. Elke kaart toont:

- Cumulatief spaargeld van het scenario
- Huidig cumulatief spaargeld (ter vergelijking)
- Verschil ten opzichte van de huidige koers

## Samenvattingsbalk (boven aan het scherm)

De kaart helemaal boven aan het scherm wordt in realtime bijgewerkt:

| Linkerkant | Rechterkant |
|---|---|
| Huidig maandelijks spaargeld | Maandelijks spaargeld van het scenario |
| (ongewijzigd) | ↑ of ↓ verschil |

## Scenario's opslaan

Tik op **Scenario opslaan** in de actiebalk bovenaan om de huidige stand van de schuifregelaars en de projectieperiode op te slaan onder een naam die je kiest (bijv. "Uit eten 30% minder"). Opgeslagen scenario's blijven op je apparaat bewaard — je kunt er op elk moment naar terugkeren.

- **Gratis abonnement**: maximaal 5 opgeslagen scenario's
- **Pro / Business**: onbeperkt

## Een opgeslagen scenario laden

Tik op **Opgeslagen scenario's** (mappictogram) in de actiebalk om de lijst met opgeslagen scenario's te openen. Tik op een rij om alle schuifregelaars en de periode direct naar die staat te herstellen. Om een opgeslagen scenario te verwijderen, tik op het prullenbakpictogram op de rij.

## Een projectie delen

Tik op **Delen** (naast de knop Resetten onder aan het scherm) om het systeem-deelmenu te openen met een tekstsamenvatting van de huidige projectie. De samenvatting bevat:

- Huidig versus scenario maandelijks spaargeld
- Maandelijks verschil
- Cumulatieve totalen voor de geselecteerde periode

Er worden geen gegevens geüpload — het deelmenu gebruikt alleen tekst, lokaal gegenereerd.

## Resetten

Tik op **Alles resetten** onderaan om elke schuifregelaar en alle extra inkomsten naar nul terug te zetten. Opgeslagen scenario's worden niet beïnvloed door het resetten.

## Veelgestelde vragen

- **V: Beïnvloedt het wijzigen van schuifregelaars mijn echte gegevens?**
  **A:** Nee. De simulator is alleen-lezen — hij leest alleen je historische gegevens om gemiddelden te berekenen. Er wordt niets opgeslagen of gewijzigd.

- **V: Waarom lijken de categoriebedragen lager dan verwacht?**
  **A:** De bedragen zijn een gemiddelde over 3 maanden. Als je in een van die maanden ongewoon weinig hebt uitgegeven (bijv. je was weg), is het gemiddelde lager.

- **V: Mijn inkomstencategorie ontbreekt.**
  **A:** Alleen categorieën met minstens één transactie in de laatste 3 maanden verschijnen in de simulator.

- **V: De projectie lijkt fout — mijn spaargeld wordt als negatief weergegeven.**
  **A:** Als je huidige uitgaven hoger zijn dan je inkomsten, is de basislijn al negatief. De simulator laat zien met hoeveel het scenario dat gat verbetert of verergert.

---

*Zie ook: [Analyses](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Spaardoelen](./18-savings-goals.md)*
