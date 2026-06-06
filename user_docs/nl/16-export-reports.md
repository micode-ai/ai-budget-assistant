# Export & Rapporten

> Genereer PDF-, Excel- en CSV-rapporten van je financiën. Bekijk maandelijkse uitgavendigests, maak versleutelde back-ups en ontvang geautomatiseerde e-mailoverzichten.

## Overzicht

Op het scherm **Export & Rapporten** kun je financiële rapporten genereren, maandelijkse digests bekijken, rapporten downloaden/delen en gegevensback-ups beheren. Open het via de knop **Rapport exporteren** op het tabblad Analyse, of via **Instellingen** > **Rapporten & E-mail** > **Rapport genereren**.

## Rapportformaten

Er zijn drie exportformaten beschikbaar:

| Formaat | Beschrijving | Beschikbaarheid |
|---|---|---|
| **CSV** | Door komma's gescheiden waarden, compatibel met Excel en Google Sheets | Alle abonnementen |
| **PDF** | Opgemaakt rapport met overzicht, categorieverdeling en transactielijst | Pro & Business |
| **Excel** | Werkmap met meerdere bladen: Overzicht, Uitgaven en Inkomsten | Pro & Business |

## Een rapport genereren

1. Selecteer een **formaat** (CSV, PDF of Excel)
2. Kies een **periode** (Vorige week, Deze maand, Vorig kwartaal, Dit jaar)
3. Tik op **Genereren**
4. Het rapport wordt gegenereerd en direct geopend via het systeemdeelvenster — sla het daar op of verstuur het
5. Het rapport verschijnt ook hieronder in **Recente rapporten** voor toekomstige toegang

Rapporten worden 7 dagen bewaard en daarna automatisch verwijderd.

## Maandelijkse digest (Pro+)

Een momentopname van de financiële activiteit van je huidige maand:

- **Totale inkomsten** en **Totale uitgaven**
- **Spaarquote** — percentage van de inkomsten dat is gespaard
- **Topcategorieën** — je grootste uitgavencategorieën met bedragen
- Gegevens worden 7 dagen gecached en automatisch vernieuwd

## Recente rapporten

Een lijst van je recent gegenereerde rapporten met:

- Formaatpictogram (CSV/PDF/Excel)
- Bestandsnaam en aanmaakdatum
- Bestandsgrootte
- Knop **Downloaden** — slaat het bestand direct op je apparaat op (Android: kies een map via de Storage Access Framework; iOS: opslaan in Bestanden)
- Knop **Delen** — opent het systeemdeelvenster om het rapport te versturen via e-mail, berichten of andere apps

## Gegevensback-up

Beschikbaar in **alle abonnementen**:

- **Back-up exporteren** — maakt een volledige JSON-back-up van je accountgegevens (uitgaven, inkomsten, budgetten, categorieën, tags, projecten, portemonnees, enz.)
  - **Waar het bestand wordt opgeslagen:** Op Android wordt een mapkiezer geopend en wordt de back-up naar de gekozen map geschreven — de app toont je vervolgens het exacte pad. Als je de kiezer overslaat (of op iOS), wordt in plaats daarvan het systeemdeelvenster geopend zodat je "Opslaan in Bestanden", Downloads of een clouddrive kunt kiezen. Het succesbericht verschijnt pas wanneer het bestand daadwerkelijk is opgeslagen of gedeeld.
- **Back-up herstellen** — importeer een eerder geëxporteerde back-up
- Als versleuteling is ingeschakeld, worden versleutelde velden ongewijzigd opgenomen in de back-up

Open back-up via **Instellingen** > **Rapporten & E-mail**.

## E-mailrapporten

Geautomatiseerde e-mailoverzichten die in je inbox worden bezorgd:

| Functie | Beschrijving | Vereist abonnement |
|---|---|---|
| **Wekelijks e-mailoverzicht** | Wekelijks uitgavenoverzicht met topcategorieën | Business |
| **Maandelijkse e-maildigest** | Maandelijks overzicht met maand-op-maandvergelijking | Pro & Business |

Configureer deze in **Instellingen** > **Rapporten & E-mail**:

- Wekelijkse/maandelijkse e-mails aan/uit zetten
- Kies de dag van de week voor wekelijkse rapporten (standaard maandag)

## Versleuteling & Rapporten

- **Niveau 0** (geen versleuteling) — alle gegevens correct weergegeven in rapporten
- **Niveau 1** (tekstversleuteling) — bedragen worden correct getoond; categorienamen en beschrijvingen kunnen leeg lijken in serverzijdig gegenereerde rapporten. De maandelijkse digest haalt categorienamen op uit je lokale apparaatgegevens
- **Niveau 2** (volledige versleuteling) — rapporten zijn niet beschikbaar (bedragen zijn aan de serverkant versleuteld)

## Veelgestelde vragen

- **V: Waarom zie ik lege categorienamen in mijn PDF-rapport?**
  **A:** Als je E2EE hebt ingeschakeld (Niveau 1), zijn categorienamen op de server versleuteld. Het serverzijdig gegenereerde rapport kan ze niet ontsleutelen. Bedragen blijven correct.

- **V: Hoe lang worden rapporten bewaard?**
  **A:** Rapporten worden na 7 dagen automatisch verwijderd. Download ze direct na het genereren.

- **V: Kan ik gegevens uit een gedeeld account exporteren?**
  **A:** Ja, elk accountlid kan rapporten en back-ups voor het gedeelde account genereren.

- **V: Wat zit er in een back-up?**
  **A:** Alles: uitgaven, inkomsten, budgetten, categorieën, tags, projecten, portemonnees, overboekingen en valutawissels voor het huidige account.

---

*Zie ook: [Analyse](./06-analytics.md) | [Instellingen](./11-settings.md) | [Abonnementen](./12-subscription.md) | [Versleuteling](./15-encryption.md)*
