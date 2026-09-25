# Referentiegegevens

> Categorieën, verkopers, tags en projecten zijn de bouwstenen voor het organiseren van je uitgaven. Beheer ze allemaal vanuit **Instellingen → Referentiegegevens**.

## Overzicht

Alle vier de soorten referentiegegevens worden beheerd vanuit één centrale plek in Instellingen. De interface is consistent: **tik op een rij om te bewerken**, tik op **+** om toe te voegen, tik op het **prullenbakpictogram** om te verwijderen.

![Hub voor referentiegegevens met categorieën, verkopers, tags en projecten](../img/reference-data.jpg)

> **Kijker**-rol: Leden met Kijker-toegang kunnen referentiegegevens bekijken, maar niet toevoegen, hernoemen of verwijderen.

## Categorieën

Categorieën classificeren je uitgaven en inkomsten. Elke categorie heeft een naam en een kleur.

- Tik op een categorierij om deze te hernoemen of de kleur te wijzigen
- Categorienamen moeten uniek zijn binnen een type, dus hernoemen naar een naam die een andere categorie al gebruikt wordt geweigerd met uitleg
- Tik op **+** naast "Uitgavencategorieën" of "Inkomstencategorieën" om een nieuwe aan te maken
- Tik op het prullenbakpictogram om een categorie te verwijderen
  - Verwijderen is geblokkeerd als de categorie wordt gebruikt door actieve uitgaven of budgetten
  - Systeemcategorieën (vooraf gedefinieerd) kunnen niet worden verwijderd
- Verschijnt een toegewezen categorie niet op je andere apparaten, open de app dan één keer online — toewijzingen worden automatisch opnieuw verzonden
- Een categorie die nog wordt gebruikt door uitgaven, budgetten of subcategorieën kan niet worden verwijderd — verwijder of verplaats die eerst

**Tip:** Gebruik onderscheidende kleuren voor categorieën die je snel wilt herkennen in grafieken.

## Verkopers

Verkopers worden automatisch aangemaakt wanneer je uitgaven toevoegt — via handmatige invoer, bonscannen of spraakinvoer. Gebruik het scherm Verkopers om duplicaten op te ruimen of typefouten te corrigeren.

- Tik op een verkoperrij om deze te hernoemen
- Hernoemen voegt alle bestaande uitgaven met de oude naam samen onder de nieuwe naam (bulkupdate)
- Verwijderen haalt de verkopernaam uit alle bijpassende uitgaven (de uitgaven zelf blijven behouden)

> Je kunt verkopers niet handmatig aanmaken — ze verschijnen automatisch terwijl je uitgaven toevoegt.

### Categorieregels

De app leert van je correcties. Elke keer dat je de categorie wijzigt van een uitgave met een verkopernaam, wordt automatisch een **categorieregel** opgeslagen. De volgende keer dat je een bankafschrift of Wise-CSV importeert met die verkoper, past de app je regel toe en wijst de categorie automatisch toe, zonder handmatige correctie.

- Geleerde regels verschijnen in de sectie **Categorieregels** onderaan het scherm Verkopers
- Elke rij toont de verkopernaam en de categorie waarnaar deze wordt toegewezen
- Tik op het prullenbakpictogram om een regel te verwijderen (de app wijst die categorie dan niet meer automatisch toe)
- Tik op het vernieuwingspictogram naast een regel om deze **opnieuw toe te passen** — dit zoekt uitgaven van die verkoper die al onder een andere categorie zijn ingedeeld en biedt aan om ze ook naar de categorie van de regel te verplaatsen, zodat oudere uitgaven meegaan met regels die je later hebt aangeleerd
- Regels worden op de server opgeslagen en gesynchroniseerd op al je apparaten

**Voorbeeld:** Je importeert een Revolut-afschrift en corrigeert "AMAZON" → Shopping. Bij de volgende import worden Amazon-transacties automatisch onder Shopping geplaatst.

## Tags

Met tags kun je uitgaven labelen met vrije trefwoorden die categorieën overstijgen.

- Tik op **+** om een tag aan te maken (voer een naam in en kies een kleur)
- Tik op een tagrij om deze te hernoemen of de kleur te wijzigen
- Tik op het prullenbakpictogram om de tag uit alle uitgaven te verwijderen

**Tip:** Gebruik tags voor kortstondige tracering: "Zakenreis", "Verbouwing", "Cadeaubudget".

## Projecten

Projecten groeperen uitgaven op doel of activiteit — klantwerk, reizen, woningverbouwing, enzovoort.

- Tik op **+** om een project aan te maken (naam, optionele omschrijving, kleur, optionele budgetlimiet)
- Tik op een projectrij om het detailscherm te openen
  - Bekijk alle gekoppelde uitgaven, totaal besteed en resterend budget
  - Gebruik het **potloodpictogram** (rechtsboven) om het project te bewerken
  - Gebruik het **prullenbakpictogram** (rechtsboven) om het te verwijderen
- Om een uitgave aan een project te koppelen, open je de uitgave en kies je een project in het veld Project

**Tip:** Stel een budget in op een project om uitgaven af te zetten tegen een doel en het resterende bedrag te zien.

---

*Zie ook: [Uitgaven & inkomsten](./03-expenses-and-income.md) | [Analyses](./06-analytics.md) | [Instellingen](./11-settings.md)*
