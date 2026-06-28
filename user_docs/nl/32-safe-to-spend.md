# Vooruitplannen — Veilig uitgeven, betaalbaarheid en automatisch vastleggen

> Drie tools die samenwerken zodat je vol vertrouwen kunt uitgeven: een live dagelijks budgetgetal, een chatvrouw "Kan ik dit betalen?" en automatische vastlegging van uitgaven uit bankmeldingen (alleen Android).

## Veilig uitgeven vandaag

Het startscherm toont een getal **Veilig uitgeven** — het bedrag dat je vandaag kunt uitgeven en toch alle bekende verplichtingen voor het einde van de maand kunt dekken.

### Wat er wordt meegenomen

Het getal wordt berekend op basis van:
- **Portemonneebalans** — je huidige saldi in alle valuta's, omgerekend naar je weergavevaluta.
- **Aankomende abonnementen** — actieve abonnementen die voor het einde van de maand verlengd worden (uit de Abonnementenbeheerder).
- **Aankomende terugkerende uitgaven** — uitgaven met een wekelijks, maandelijks of jaarlijks herhaalpatroon die voor het einde van de maand vervallen.
- **Bijdragen aan doelen** — het dagelijkse bedrag dat nodig is om je spaardoelen op schema te houden.
- **Verwacht inkomen** — als de app een regelmatig maandelijks inkomen detecteert (zelfde bedrag, interval van ~30 dagen, minstens twee keer in de afgelopen 90 dagen), wordt dit toegevoegd als verwacht inkomen en wordt de volgende betaaldag als horizon gebruikt.

### Formule

```
Veilig uitgeven = (Balans + Verwacht inkomen − Verplichtingen) ÷ Resterende dagen
```

Het resultaat wordt begrensd op nul — je ziet nooit een negatief getal. Als verplichtingen je balans overschrijden, toont het getal 0 met een toelichting.

### Uitsplitsing

Tik op het getal om een uitgesplitst blad te openen dat elke component toont: portemonneebalans, verwacht inkomen, aankomende abonnementen, terugkerende uitgaven en bijdragen aan doelen. Alle bedragen zijn in je weergavevaluta; er verschijnt een melding als bij een conversie een geschatte wisselkoers is gebruikt.

### Widget

Veilig uitgeven is beschikbaar als startscherm-widget. Je kunt hem tonen of verbergen via **Instellingen → Widgets**.

## Kan ik dit betalen? (Betaalbaarheidsorakel)

Stel de AI-chat vragen zoals "Kan ik een vlucht van 200 € betalen?" of "Kan ik een nieuwe laptop voor 3500 zł kopen?". De chat gebruikt dezelfde motor als Veilig uitgeven en geeft een deterministisch ja of nee antwoord — de AI vertelt alleen het oordeel, hij raadt nooit.

Mogelijke antwoorden:
- **Ja** — het bedrag past binnen het huidige veilige budget van vandaag.
- **Ja, maar krap** — het past binnen je beschikbare saldo maar verbruikt het grootste deel ervan.
- **Nee** — het overschrijdt je beschikbare middelen.
- **Ja, maar vertraagt een doel** — betaalbaar, maar je spaardoel "X" loopt ongeveer N dagen achter.
- **Wacht tot betaaldag** — betaalbaar na ontvangst van je volgende verwachte inkomen (de voorgestelde datum wordt getoond).

## Automatisch vastleggen Android

Op Android kan de app automatisch een uitgave aanmaken vanuit de pushmeldingen van je bank — zodat je geen transactie mist, zelfs niet als je niet in de app bent.

### Hoe activeer je het

1. Ga naar **Instellingen → Transacties importeren → Automatisch vastleggen (Android)**.
2. Lees de privacymelding en tik op **Activeren**.
3. De app opent de systeeminstellingen voor toegang tot meldingen. Zoek **AI Budget Assistant** in de lijst en zet het aan.
4. Keer terug naar de app — de status toont **Toestemming verleend**.

### Privacy

De meldingstekst wordt **uitsluitend op je apparaat** verwerkt. De naam van de handelaar, het bedrag en de valuta worden lokaal geëxtraheerd; alleen de resulterende uitgave wordt gesynchroniseerd met de server — de ruwe meldingstekst wordt nergens naartoe verstuurd.

### Ondersteunde banken (Europa)

Automatisch vastleggen werkt met meldingen van grote retailbanken door heel Europa. Ondersteunde landen: Polen (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), Duitsland/Oostenrijk (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), Frankrijk (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Spanje (BBVA, Santander, CaixaBank, Bankinter), Nederland (ING, Rabobank, ABN AMRO, bunq), Oekraïne (PrivatBank, monobank, Oschadbank) en Rusland (Sberbank, Tinkoff, Alfa-Bank). De grensoverschrijdende neobanken Revolut en N26 worden ook ondersteund. De volledige lijst is te zien op het scherm Automatisch vastleggen.

**Opmerking over categorieën:** Voor banken buiten Polen wordt mogelijk geen categorie automatisch voorgesteld. De uitgave wordt vastgelegd zonder categorie; u kunt dit handmatig corrigeren — de app leert van uw correcties.

### Deduplicatie

Als een melding meer dan eens wordt afgeleverd, of als je dezelfde transactie ook importeert uit een bank-CSV, dedupliceert de app automatisch. Elke vastgelegde melding krijgt een unieke vingerafdruk; duplicaten worden stil verwijderd.

### Vastleggingen controleren

Tik op de vastleggingsmelding ("54 zł vastgelegd · Żabka — tik om te controleren") om de uitgavendetails te openen en het bedrag, de handelaar en de categorie te verifiëren of te corrigeren vóór synchronisatie.

### Alleen Android

Automatisch vastleggen is een Android-functie. Op iOS en web verschijnt dit gedeelte niet. Een alternatief voor iOS is het scannen van een bonnetjefoto via de bestaande bonnetjescanner.
