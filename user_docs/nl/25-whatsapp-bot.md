# WhatsApp-bot

> Beheer je financiën rechtstreeks vanuit WhatsApp. Chat met AI, voeg uitgaven toe met een commando, scan bonnen en stuur spraakberichten — allemaal zonder de app te openen.

## Overzicht

Met de **WhatsApp-bot** kun je je AI Budget Assistant gebruiken vanuit WhatsApp. Koppel je account één keer, en je kunt uitgaven bijhouden, financiële vragen stellen en budgetten beheren — rechtstreeks vanuit je messenger.

De bot werkt op dezelfde manier als de [Telegram-bot](./22-telegram-bot.md): dezelfde AI, dezelfde commando's, dezelfde ondersteuning voor meerdere accounts. Gebruik welke messenger je maar wilt.

## Je account koppelen

1. Open de app en ga naar **Instellingen**
2. Tik op **WhatsApp-bot** onder de sectie Integraties
3. Tik op **WhatsApp verbinden** — er verschijnen een code van 6 tekens en een QR-code (10 minuten geldig)
4. Doe één van het volgende:
   - Tik op **WhatsApp openen** — WhatsApp opent met het bericht `link JOUW_CODE` al ingevuld. Tik gewoon op verzenden.
   - Of scan de QR-code met de camera van een andere telefoon om WhatsApp op dat apparaat te openen.
   - Of kopieer de code en stuur `link JOUW_CODE` handmatig naar het WhatsApp-nummer van de bot.
5. Je ziet een bevestiging: "Account succesvol gekoppeld!"

> **Let op:** Elk WhatsApp-nummer kan tegelijk aan één app-account worden gekoppeld. Opnieuw koppelen vervangt de vorige verbinding.

## Botcommando's

Commando's werken met of zonder een voorloop-`/` — zowel `expense 50 lunch` als `/expense 50 lunch` wordt geaccepteerd.

| Commando | Beschrijving |
|---|---|
| `link CODE` | Koppel je WhatsApp aan de app |
| `expense AMOUNT DESC` | Snel een uitgave toevoegen (bijv. `expense 50 lunch`) |
| `income AMOUNT DESC` | Snel inkomsten toevoegen (bijv. `income 3000 salary`) |
| `category [TYPE] NAME` | Maak een categorie aan (bijv. `category expense Food`) |
| `categories` | Categorieën weergeven en verwijderen |
| `usage` | Bekijk je AI-gebruik, limieten en uitsplitsing |
| `account` | Wissel tussen je accounts |
| `newchat` | Start een nieuw AI-gesprek |
| `unlink` | Ontkoppel WhatsApp van je account |
| `help` | Toon alle beschikbare commando's |

Je kunt ook gewoon een getal en omschrijving typen (`50 lunch`) — de bot behandelt het als een uitgave.

## AI-chat in WhatsApp

Stuur elk tekstbericht naar de bot en het wordt verwerkt door de AI-assistent — dezelfde die beschikbaar is in het AI-chattabblad van de app.

**Voorbeelden:**
- "Waar heb ik deze maand het meest aan uitgegeven?"
- "Toon mijn uitgaven van vorige week"
- "Voeg uitgave 500 UAH toe voor boodschappen"
- "Wat is mijn budgetstatus?"

De AI ondersteunt natuurlijke-taalcommando's, actiebevestiging (knoppen ✅ Bevestigen / ❌ Annuleren), categorie-uitsplitsing en budgetanalyse. Bevestigingsknoppen verschijnen direct onder het bericht.

## Automatische accountdetectie

Als je meerdere accounts hebt (bijv. "Persoonlijk" en "Familie"), detecteert de AI automatisch wanneer je een accountnaam in je bericht noemt en bevraagt het juiste account.

**Voorbeelden:**
- "Toon mijn uitgaven in het Familie-account" — bevraagt het Familie-account
- "Voeg uitgave 100 UAH voor boodschappen toe aan Familie" — maakt de uitgave aan in het Familie-account

> **Let op:** Dit wisselt je standaardaccount niet permanent. Gebruik `account` om het standaardaccount te wijzigen.

## Spraakberichten

1. Neem een spraakbericht op in WhatsApp (houd de microfoonknop ingedrukt)
2. Stuur het naar de bot
3. De bot transcribeert je spraak (en toont de herkende tekst), en verwerkt het vervolgens als een AI-chatbericht

Spraakberichten ondersteunen dezelfde commando's en vragen als tekstberichten. Spraak kost 2 AI-verzoeken per bericht (transcriptie + AI-verwerking).

## Bonnen scannen

1. Maak een foto van een bon en stuur die naar de bot
2. De bot scant deze met OCR en toont een samenvatting (bedrag, datum, verkoper)
3. Als de datum onjuist is, tik op **Datum wijzigen** en stuur de juiste datum in het formaat `DD.MM.JJJJ` (bijv. `28.03.2026`)
4. Tik op **Uitgave toevoegen** om te bevestigen, of op **Annuleren** om af te wijzen

Je kunt bonafbeeldingen ook als documenten versturen (afbeeldingsbestanden of pdf's).

## Wisselen van account

Als je meerdere accounts hebt:

1. Stuur `account`
2. De bot toont je accounts als een aantikbare lijst
3. Tik op het account waarnaar je wilt wisselen
4. Het actieve account wordt in een antwoord bevestigd

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

**Voorbeelden:** `expense 50$ lunch`, `expense 100₴ groceries`, `expense 30 EUR taxi`

## Veelgestelde vragen

- **V: Kan ik de bot gebruiken zonder te koppelen?**
  **A:** Nee, je moet eerst je WhatsApp-nummer koppelen met een code uit de app.

- **V: Werkt de bot in groepschats?**
  **A:** Nee. De bot reageert alleen op privégesprekken (1-op-1).

- **V: Welk account gebruikt de bot?**
  **A:** De bot gebruikt je standaardaccount (ingesteld tijdens het koppelen of via `account`). Je kunt ook een accountnaam in je bericht noemen, en de AI gebruikt dat account automatisch voor de vraag.

- **V: Kan ik zowel WhatsApp als Telegram aan hetzelfde app-account koppelen?**
  **A:** Ja. Het zijn onafhankelijke koppelingen. Je kunt beide tegelijk verbonden hebben.

- **V: Tellen botberichten mee voor mijn AI-verzoeklimiet?**
  **A:** Ja. AI-chat kost 1 verzoek per bericht, spraakberichten kosten 2 verzoeken en bonfoto's kosten 2 verzoeken. Gebruik `usage` om je resterende tegoed te controleren. Wanneer de limiet is bereikt, geeft de bot je een melding in plaats van het verzoek te verwerken.

- **V: In welke taal antwoordt de bot?**
  **A:** De bot antwoordt in dezelfde taal die in je app is ingesteld (Instellingen → Weergave). Alle systeemberichten, commando's en knoppen zijn gelokaliseerd.

- **V: Mijn telefoonnummer is veranderd — wat gebeurt er met de koppeling?**
  **A:** Verbind gewoon opnieuw vanuit de app met je nieuwe WhatsApp-nummer. De oude koppeling wordt automatisch vervangen.

---

*Zie ook: [AI-chat](./07-ai-chat.md) | [Telegram-bot](./22-telegram-bot.md) | [Accounts](./09-accounts.md) | [Instellingen](./11-settings.md)*
