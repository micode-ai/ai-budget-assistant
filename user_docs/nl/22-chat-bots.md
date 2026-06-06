# Chatbots — Telegram, WhatsApp & Slack

> Beheer je financiën rechtstreeks vanuit Telegram, WhatsApp of Slack. Chat met AI, voeg uitgaven toe, scan bonnen en stuur spraakberichten — zonder de app te openen.

## Overzicht

Verbind je account met **Telegram**, **WhatsApp**, **Slack** of een willekeurige combinatie tegelijk. Alle drie de bots bieden dezelfde functies — gebruik welke messenger je maar wilt.

Om te verbinden: **Instellingen → Chatbots**.

## Je account koppelen

### Telegram
1. Tik op **Telegram verbinden** — er verschijnt een code van 6 tekens (10 minuten geldig)
2. Open Telegram en zoek de bot
3. Stuur `/link JOUW_CODE` (bijv. `/link A3F2B1`)
4. Je ziet "Account succesvol gekoppeld!"

### WhatsApp
1. Tik op **WhatsApp verbinden** — er verschijnen een code en een QR-code
2. Tik op **WhatsApp openen** (het bericht is al ingevuld) of scan de QR-code
3. Stuur `link JOUW_CODE` naar de bot
4. Je ziet "Account succesvol gekoppeld!"

### Slack
1. Tik op **Slack verbinden** — er verschijnt een code van 6 tekens (10 minuten geldig)
2. Open Slack, zoek de **AI Budget Assistant**-app en open er een direct bericht mee
3. Stuur `link JOUW_CODE` (bijv. `link A3F2B1`)
4. Je ziet "Account succesvol gekoppeld!"

> Telegram, WhatsApp en Slack kunnen allemaal tegelijkertijd met hetzelfde account worden verbonden.

## Wat je kunt doen

- **Uitgaven of inkomsten toevoegen**: typ op natuurlijke wijze of gebruik commando's
- **AI-chat**: stel elke financiële vraag — dezelfde AI als in de app
- **Spraakberichten**: spreek je uitgave of vraag in (2 AI-verzoeken per bericht)
- **Bonfoto's**: stuur een foto om automatisch te scannen (2 AI-verzoeken per foto)
- **AI-gebruik controleren**: `/usage`
- **Van account wisselen**: `/account`

## Commando's

| Commando | Wat het doet |
|---|---|
| `/link CODE` | Koppel je messenger aan de app |
| `/expense 50 lunch` | Voeg een uitgave toe |
| `/income 3000 salary` | Voeg inkomsten toe |
| `/category expense Food` | Maak een categorie aan |
| `/usage` | Bekijk AI-verzoekgebruik en limieten |
| `/account` | Wissel van actief account |
| `/newchat` | Start een nieuw AI-gesprek |
| `/unlink` | Ontkoppel de bot |
| `/help` | Toon alle commando's |

> In **WhatsApp** en **Slack** werken commando's met of zonder de voorloop-`/`. Je kunt ook gewoon een bedrag en omschrijving typen: `50 lunch`.

## Bonnen scannen

1. Maak een foto van een bon en stuur die naar de bot
2. De bot haalt het bedrag, de datum en de verkoper eruit met OCR
3. Als de datum onjuist is, stuur de juiste datum in het formaat `DD.MM.JJJJ`
4. Bevestig om de uitgave toe te voegen, of annuleer

## Meerdere accounts

Als je meerdere accounts hebt (bijv. "Persoonlijk" en "Familie"):
- Noem de accountnaam in je bericht: "Toon uitgaven in Familie" — de AI bevraagt dat account alleen voor dit bericht
- Gebruik `/account` om het standaardaccount voor de bot permanent te wisselen

## Kosten van AI-verzoeken

| Actie | Gebruikte AI-verzoeken |
|---|---|
| Tekstbericht / AI-chat | 1 |
| Spraakbericht | 2 |
| Bonfoto | 2 |

Wanneer je limiet is bereikt, laat de bot het je weten in plaats van het verzoek te verwerken. Gebruik `/usage` om resterende verzoeken te controleren.

## Valutaondersteuning

De bot herkent valutasymbolen: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB).

**Voorbeelden:** `/expense 50$ lunch` · `50 zł lunch` · `expense 100₴ groceries`

## Veelgestelde vragen

**V: Kan ik Telegram, WhatsApp en Slack verbinden?**
Ja — het zijn onafhankelijke koppelingen en ze werken allemaal tegelijk.

**V: Welke taal gebruikt de bot?**
De taal uit Instellingen → Weergave.

**V: Heb ik een abonnement nodig om de bots te gebruiken?**
De bots gebruiken AI-verzoeken uit het maandelijkse tegoed van je abonnement. Gebruikers van het gratis abonnement hebben een lagere maandlimiet.

---

*Zie ook: [AI-chat](./07-ai-chat.md) | [Accounts](./09-accounts.md) | [Instellingen](./11-settings.md)*
