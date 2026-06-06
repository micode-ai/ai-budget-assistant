# Telegram-bot

> Beheer je financiën rechtstreeks vanuit Telegram. Chat met AI, voeg uitgaven toe met een commando, scan bonnen en gebruik spraakberichten — allemaal zonder de app te openen.

## Overzicht

Met de **Telegram-bot** kun je je AI Budget Assistant gebruiken vanuit Telegram. Koppel je account één keer, en je kunt uitgaven bijhouden, financiële vragen stellen en budgetten beheren — rechtstreeks vanuit je messenger.

## Je account koppelen

1. Open de app en ga naar **Instellingen**
2. Tik op **Telegram-bot** onder de sectie Integraties
3. Tik op **Koppelcode genereren** — er verschijnt een code van 6 tekens (10 minuten geldig)
4. Open Telegram en zoek de bot
5. Stuur `/link CODE` (bijv. `/link A3F2B1`)
6. Je ziet een bevestiging: "Account succesvol gekoppeld!"

> **Let op:** Elk Telegram-account kan tegelijk aan één app-account worden gekoppeld. Opnieuw koppelen vervangt de vorige verbinding.

## Botcommando's

| Commando | Beschrijving |
|---|---|
| `/start` | Welkomstbericht en installatie-instructies |
| `/link CODE` | Koppel je Telegram aan de app |
| `/expense AMOUNT DESC` | Snel een uitgave toevoegen (bijv. `/expense 50 lunch`) |
| `/income AMOUNT DESC` | Snel inkomsten toevoegen (bijv. `/income 3000 salary`) |
| `/category [TYPE] NAME` | Maak een categorie aan (bijv. `/category expense Food`) |
| `/categories` | Categorieën weergeven en verwijderen |
| `/usage` | Bekijk je AI-gebruik, limieten en uitsplitsing |
| `/account` | Wissel tussen je accounts |
| `/newchat` | Start een nieuw AI-gesprek |
| `/unlink` | Ontkoppel Telegram van je account |
| `/help` | Toon alle beschikbare commando's |

## AI-chat in Telegram

Stuur elk tekstbericht naar de bot en het wordt verwerkt door de AI-assistent — dezelfde die beschikbaar is in het AI-chattabblad van de app.

**Voorbeelden:**
- "Waar heb ik deze maand het meest aan uitgegeven?"
- "Toon mijn uitgaven van vorige week"
- "Voeg uitgave 500 UAH toe voor boodschappen"
- "Wat is mijn budgetstatus?"

De AI ondersteunt alle functies van de in-app-chat: natuurlijke-taalcommando's, actiebevestiging, categorie-uitsplitsing en budgetanalyse.

## Automatische accountdetectie

Als je meerdere accounts hebt (bijv. "Persoonlijk" en "Familie"), detecteert de AI automatisch wanneer je een accountnaam in je bericht noemt en bevraagt het juiste account.

**Voorbeelden:**
- "Toon mijn uitgaven in het Familie-account" — bevraagt het Familie-account
- "Waar heb ik aan eten uitgegeven?" — bevraagt het standaardaccount
- "Voeg uitgave 100 UAH voor boodschappen toe aan Familie" — maakt de uitgave aan in het Familie-account

> **Let op:** Dit wisselt je standaardaccount niet permanent. Gebruik `/account` om het standaardaccount te wijzigen.

## Spraakberichten

1. Neem een spraakbericht op in Telegram
2. Stuur het naar de bot
3. De bot transcribeert je spraak en verwerkt het als een AI-chatbericht

Spraakberichten ondersteunen dezelfde commando's en vragen als tekstberichten.

## Bonnen scannen

1. Maak een foto van een bon
2. Stuur de foto naar de bot
3. De bot scant deze met OCR en toont een samenvatting
4. Als de datum onjuist is, tik op **Datum wijzigen** en stuur de juiste datum (DD.MM.JJJJ)
5. Tik op **Uitgave toevoegen** om te bevestigen, of op **Annuleren** om af te wijzen

Je kunt bonafbeeldingen ook als documenten versturen (pdf of afbeeldingen). Pdf-bonnen worden opgeslagen en zijn te bekijken in de app — tik op het pdf-voorbeeld om het te openen.

## Wisselen van account

Als je meerdere accounts hebt:

1. Stuur `/account`
2. De bot toont al je accounts met inline-knoppen
3. Tik op het account waarnaar je wilt wisselen
4. Het actieve account is gemarkeerd met een vinkje

Alle volgende commando's en AI-vragen gebruiken het geselecteerde account totdat je opnieuw wisselt.

## Valutaondersteuning

De bot herkent valutasymbolen en -codes in commando's:

| Symbool | Valuta |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Voorbeelden:** `/expense 50$ lunch`, `/expense 100₴ groceries`, `/expense 30 EUR taxi`

## Veelgestelde vragen

- **V: Kan ik de bot gebruiken zonder te koppelen?**
  **A:** Nee, je moet eerst je Telegram-account koppelen met een code uit de app.

- **V: Werkt de bot in groepschats?**
  **A:** De bot is alleen ontworpen voor privégesprekken (1-op-1).

- **V: Welk account gebruikt de bot?**
  **A:** De bot gebruikt je standaardaccount (ingesteld tijdens het koppelen of via `/account`). Je kunt ook een accountnaam in je bericht noemen, en de AI gebruikt dat account automatisch voor de vraag.

- **V: Kan ik meerdere Telegram-accounts koppelen?**
  **A:** Nee, elke app-gebruiker kan één gekoppeld Telegram-account hebben, en elk Telegram-account kan aan één app-gebruiker worden gekoppeld.

- **V: Tellen botberichten mee voor mijn AI-verzoeklimiet?**
  **A:** Ja. AI-chat kost 1 verzoek per bericht, spraakberichten kosten 2 verzoeken (transcriptie + AI-verwerking) en bonfoto's kosten 2 verzoeken. Gebruik `/usage` om je resterende tegoed te controleren. Wanneer de limiet is bereikt, geeft de bot je een melding in plaats van het verzoek te verwerken.

- **V: In welke taal antwoordt de bot?**
  **A:** De bot antwoordt in dezelfde taal die in je app is ingesteld (Instellingen > Weergave). Alle systeemberichten, commando's en knoppen zijn gelokaliseerd.

---

*Zie ook: [AI-chat](./07-ai-chat.md) | [Accounts](./09-accounts.md) | [Instellingen](./11-settings.md)*
