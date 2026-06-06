# Wise-import

> Haal je volledige Wise-transactiegeschiedenis in één keer in de app. Upload een CSV-afschrift en de app maakt de bijpassende uitgaven, inkomsten en valutaconversies voor je aan.

## Overzicht

Als je bankiert bij Wise, kun je met **Wise-import** een heel afschrift in één stap in je account binnenhalen. Geen transacties meer één voor één intypen — download gewoon een CSV van Wise, geef die aan de app, en bekijk wat er wordt aangemaakt voordat je bevestigt.

De import omvat drie soorten records:

- **Uitgaven** — geld dat je Wise-saldo heeft verlaten (debiteringen)
- **Inkomsten** — geld dat is binnengekomen (crediteringen)
- **Valutaconversies** — wanneer je binnen Wise tussen saldi hebt gewisseld (bijv. USD → EUR)

Elke geïmporteerde transactie wordt gemarkeerd zodat de app weet dat deze van Wise afkomstig is — als je hetzelfde afschrift twee keer uploadt, worden de duplicaten gedetecteerd en automatisch overgeslagen.

## Stap 1 — Exporteer een CSV uit Wise

1. Open Wise (web-app op **wise.com** of de Wise mobiele app).
2. Ga naar **Transactions → Statements and Reports**.
3. Kies je **datumbereik** (maximaal 469 dagen per bestand).
4. Kies **CSV** als formaat en selecteer welke valuta / welk saldo je wilt.
5. Download het bestand naar je telefoon.

> **Tip:** Wise maakt één CSV per valuta. Als je meerdere valuta's wilt importeren, herhaal je de export voor elke valuta en importeer je ze achter elkaar.

## Stap 2 — Importeren in de app

1. Open de app en ga naar **Instellingen → Wise-import**.
2. Tik op **CSV-bestand kiezen** en selecteer het bestand dat je net hebt gedownload.
3. De app verwerkt het bestand (meestal binnen een seconde) en toont je een voorbeeld.

## Stap 3 — Controleren en bevestigen

Het voorbeeld toont elke transactie in de CSV met een selectievakje.

- **Uitgaven** worden getoond met een rood pictogram naar beneden; **inkomsten** met een groen pictogram naar boven; **valutaconversies** met een wisselpictogram en beide zijden van de wissel (bijv. `120.00 USD → 109.50 EUR`).
- Een kleine chip met een **voorgestelde categorie** verschijnt naast bekende verkopers (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix, enz.). Als er al een categorie met dezelfde naam bestaat in het actieve account, wordt deze automatisch gekoppeld.
- Rijen die je al in een eerdere upload hebt geïmporteerd, zijn **gedimd en gemarkeerd met "Al geïmporteerd"** — je kunt ze niet opnieuw selecteren, en dat is wat je tegen duplicaten beschermt.
- Vink alles uit wat je niet wilt importeren (bijv. persoonlijke overboekingen tussen je eigen accounts).

Zodra je tevreden bent met de selectie, tik je op **N rijen importeren**. De app schrijft alles in één transactie naar je account — óf elke geselecteerde rij wordt aangemaakt, óf geen enkele.

## Wat wordt er gekoppeld

| Veld | Waar het vandaan komt |
|---|---|
| Datum | Kolom `Date` |
| Bedrag | `Amount` (absoluut) + `Total fees` ingevouwen |
| Valuta | Kolom `Currency` |
| Omschrijving | `Description`, met terugval op `Merchant` of `Payment Reference` |
| Categorie | Voorgesteld op basis van de verkoper indien herkend; anders geen |
| Bron | Gemarkeerd als `import` zodat je deze kunt filteren in analyses |

## Valutaconversies

Wanneer dezelfde Wise-overboeking twee valuta's raakt (bijv. je zet 100 USD om in euro's), genereert Wise twee rijen — één debitering in USD, één creditering in EUR. De app herkent deze paren aan hun gedeelde `Payment Reference` en maakt één enkel **Valutawissel**-record aan in plaats van twee niet-gerelateerde transacties. De wissel verschijnt onder **Portemonnee → Wissels** met de juiste koers.

## Opnieuw importeren

Hetzelfde CSV-bestand opnieuw uploaden is veilig. Elke rij draagt zijn Wise-`TransferWise ID`, en de app weigert een tweede record aan te maken voor een ID dat het al heeft geïmporteerd. Dit betekent:

- Je kunt een langer datumbereik opnieuw exporteren en uploaden — alleen de nieuwe rijen worden aangemaakt.
- Je kunt halverwege een voorbeeld pauzeren en later opnieuw beginnen — de rijen die je al hebt vastgelegd, worden onthouden.

## Veelgestelde vragen

- **V: Werkt dit met andere banken?**
  **A:** Op dit moment worden alleen Wise CSV-exports ondersteund. Andere banken gebruiken mogelijk andere kolomindelingen. Open een functieverzoek als je een andere bank toegevoegd wilt zien.

- **V: Kan ik een PDF- of XLSX-afschrift importeren?**
  **A:** Nog niet. Exporteer Wise-afschriften in CSV-formaat.

- **V: Wordt het bestand ergens geüpload waar ik me zorgen over moet maken?**
  **A:** De CSV wordt naar de AI Budget Assistant-server gestuurd, in het geheugen verwerkt en weggegooid zodra het voorbeeld is gegenereerd. Alleen de gestructureerde rijen die je bevestigt, worden opgeslagen — niet het oorspronkelijke bestand.

- **V: Wat gebeurt er met de kosten die Wise mij in rekening bracht?**
  **A:** Wise rapporteert kosten in een aparte kolom `Total fees`. De app vouwt de kosten in dezelfde uitgave zodat het totaal overeenkomt met wat er daadwerkelijk van je saldo is afgegaan.

- **V: Ik heb de verkeerde rijen geïmporteerd — kan ik dit ongedaan maken?**
  **A:** Ja. De geïmporteerde rijen zijn normale uitgaven/inkomsten — open elke rij en verwijder die zoals je elke andere transactie zou verwijderen. Eenmaal verwijderd, kun je dezelfde rij later opnieuw importeren.

- **V: Mijn CSV heeft geen kopregel / een ander formaat. Wat nu?**
  **A:** Zorg ervoor dat je een afschrift hebt geëxporteerd via **Transactions → Statements and Reports → CSV**. Het oude formaat "Activity Export" is anders en wordt niet ondersteund.

- **V: Worden mijn categorieën van Wise overgenomen?**
  **A:** De eigen categorisering van Wise wordt gedeeltelijk gebruikt om categorieën voor bekende verkopers voor te stellen. De app maakt niet automatisch nieuwe categorieën aan — als er geen overeenkomst wordt gevonden, wordt de rij zonder categorie geïmporteerd en kun je deze later categoriseren.

---

*Zie ook: [Uitgaven en inkomsten](./03-expenses-and-income.md) | [Portemonnee en wissel](./10-wallet-and-exchange.md) | [Accounts](./09-accounts.md) | [Instellingen](./11-settings.md)*
