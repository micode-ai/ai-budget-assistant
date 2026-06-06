# End-to-end-versleuteling

> Bescherm je financiële gegevens met end-to-end-versleuteling (E2EE). Alle gevoelige informatie wordt op je apparaat versleuteld voordat deze naar de server wordt gestuurd — niemand behalve jij (en de leden van je gedeelde accounts) kan deze lezen.

## Overzicht

End-to-end-versleuteling zorgt ervoor dat je beschrijvingen, notities, categorienamen en andere tekstgegevens op je apparaat worden versleuteld voordat ze worden gesynchroniseerd. De server slaat alleen versleutelde gegevens op en kan deze niet lezen, zelfs niet als de database wordt gecompromitteerd.

Je beheert versleuteling met een aparte **versleutelingswachtwoordzin** die nooit naar de server wordt gestuurd.

## Versleuteling instellen

1. Open **Instellingen**
2. Scroll naar het gedeelte **Beveiliging**
3. Tik op **Versleuteling inschakelen**
4. Voer een **versleutelingswachtwoordzin** in (minimaal 8 tekens)
   - Dit staat los van je inlogwachtwoord
   - Kies een sterke wachtwoordzin die je kunt onthouden
5. Bevestig de wachtwoordzin
6. Er wordt een **Herstelsleutel** op het scherm weergegeven

> **Belangrijk:** Bewaar je Herstelsleutel onmiddellijk! Schrijf hem op of bewaar hem in een wachtwoordmanager. Formaat: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Dit is de **enige manier** om je gegevens te herstellen als je de wachtwoordzin vergeet.

Na het instellen wordt versleuteling automatisch ingeschakeld voor je huidige account.

## Versleuteling ontgrendelen

Na het opnieuw opstarten van de app of wanneer je sessie verloopt, is versleuteling vergrendeld. Je gegevens worden nog steeds veilig opgeslagen, maar versleutelde velden lijken leeg totdat je ontgrendelt.

Om te ontgrendelen:

1. Open **Instellingen** > **Beveiliging**
2. Tik op **Versleuteling ontgrendelen**
3. Voer je versleutelingswachtwoordzin in
4. Je gegevens worden weer leesbaar

## Wat wordt versleuteld

Versleuteling werkt in twee niveaus:

### Niveau 1 — Tekstvelden (standaard)

| Gegevens | Versleuteld |
|---|---|
| Uitgavenbeschrijvingen en notities | Ja |
| Locatienamen | Ja |
| Bongegevens | Ja |
| Categorienamen | Ja |
| Tagnamen | Ja |
| Projectnamen en -beschrijvingen | Ja |
| Budgetnamen | Ja |
| Bedragen, datums, valuta's | Nee — blijft platte tekst |

**Serverfuncties** (analyse, budgetwaarschuwingen, AI-inzichten) blijven werken omdat bedragen en datums toegankelijk blijven.

### Niveau 2 — Volledige versleuteling (opt-in)

Alles uit Niveau 1, plus:

| Gegevens | Versleuteld |
|---|---|
| Bedragen (uitgaven, inkomsten, budgetten) | Ja |
| Prijzen en wisselkoersen | Ja |
| Portemonnee-saldo's | Ja |

> **Opmerking:** Met Niveau 2 zijn serverzijdige analyses en AI-functies niet beschikbaar omdat de server geen bedragen kan lezen. Alle analyses worden lokaal op je apparaat berekend.

## Herstel

Als je je wachtwoordzin vergeet maar je Herstelsleutel hebt:

1. Open **Instellingen** > **Beveiliging**
2. Tik op **Herstellen**
3. Voer je Herstelsleutel in
4. Stel een nieuwe wachtwoordzin in
5. Er wordt een nieuwe Herstelsleutel gegenereerd — bewaar deze opnieuw

## Versleuteling opnieuw instellen

Als je zowel je wachtwoordzin als je Herstelsleutel verliest:

1. Open **Instellingen** > **Beveiliging**
2. Tik op **Versleuteling resetten** (rode knop)
3. Bevestig de actie

> **Waarschuwing:** Eerder versleutelde gegevens op de server worden **permanent onleesbaar**. Lokale gegevens op je apparaat worden niet beïnvloed. Je kunt versleuteling opnieuw instellen met een nieuwe wachtwoordzin.

## Gedeelde accounts

Wanneer versleuteling is ingeschakeld voor een gedeeld account:

- De **accounteigenaar** moet versleutelingssleutels aan elk lid verlenen
- Nieuwe leden kunnen metadata zien (bedragen, datums, categorieën) maar **kunnen versleutelde tekstvelden niet lezen** totdat de eigenaar toegang verleent
- Het verlenen van sleutels gebeurt wanneer de eigenaar de app opent en openstaande leden goedkeurt
- Wanneer een lid uit een gedeeld account wordt **verwijderd**, worden de sleutels om veiligheidsredenen geroteerd — het verwijderde lid kan nieuwe gegevens niet meer ontsleutelen

## Impact op app-functies

| Functie | Niveau 1 (Tekst) | Niveau 2 (Volledig) |
|---|---|---|
| Analyse en grafieken | Werkt volledig | Lokaal berekend |
| Budgetwaarschuwingen | Werkt volledig | Niet beschikbaar |
| AI-chat | Gedeeltelijk (geen beschrijvingen) | Niet beschikbaar |
| AI-inzichten | Gedeeltelijk | Niet beschikbaar |
| Uitgavenverhaal | Gedeeltelijk | Niet beschikbaar |
| Spraakinvoer | Werkt volledig | Werkt volledig |
| Bonnen scannen | Werkt volledig | Werkt volledig |
| CSV-/PDF-/Excel-rapporten | Bedragen correct, tekstvelden leeg | Niet beschikbaar |
| Maandelijkse digest | Werkt (namen lokaal opgelost) | Niet beschikbaar |
| Versleutelde back-up | Werkt volledig | Werkt volledig |
| E-mailrapporten | Bedragen correct, tekstvelden leeg | Niet beschikbaar |

## Veelgestelde vragen

- **V: Is de versleutelingswachtwoordzin hetzelfde als mijn inlogwachtwoord?**
  **A:** Nee. De versleutelingswachtwoordzin staat los en wordt nooit naar de server gestuurd. Je inlogwachtwoord authenticeert je account; de versleutelingswachtwoordzin beschermt je gegevens.

- **V: Wat gebeurt er als ik mijn wachtwoordzin vergeet en mijn Herstelsleutel verlies?**
  **A:** Eerder versleutelde gegevens op de server worden permanent onleesbaar. Je kunt versleuteling resetten en opnieuw beginnen, maar oude versleutelde gegevens kunnen niet worden hersteld.

- **V: Kunnen de app-ontwikkelaars mijn versleutelde gegevens lezen?**
  **A:** Nee. De server slaat alleen versleutelde blobs op. Zonder je wachtwoordzin of Herstelsleutel kan niemand je gegevens ontsleutelen.

- **V: Vertraagt versleuteling de app?**
  **A:** De eerste instelling duurt een paar seconden voor sleutelafleiding. Daarna gaat het versleutelen en ontsleutelen van afzonderlijke velden vrijwel direct.

- **V: Kan ik versleuteling uitschakelen nadat ik deze heb ingeschakeld?**
  **A:** Je kunt versleuteling resetten, waarmee de versleutelingsconfiguratie wordt verwijderd. Gegevens die op de server zijn versleuteld, blijven echter versleuteld en worden onleesbaar.

---

*Zie ook: [Instellingen](./11-settings.md) | [Accounts](./09-accounts.md) | [Export & Rapporten](./16-export-reports.md)*
