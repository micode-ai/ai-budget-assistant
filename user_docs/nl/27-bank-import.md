# Transacties importeren vanaf je bank

> Importeer transacties uit een CSV-, XLSX- of PDF-afschrift van je bank. Ondersteunt mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise en elke andere bank via de universele kolomtoewijzer.

## Ondersteunde banken

- **mBank** — CSV-export
- **PKO BP** — CSV-export
- **Erste Bank** — PDF-afschrift
- **Alior Bank** — PDF-afschrift
- **Revolut** — CSV-export
- **Wise** — CSV-export (meerdere valuta's, FX-conversies automatisch gedetecteerd)
- **Overig** — elke bank, via de universele kolomtoewijzer (CSV)
- **Spreadsheets** — XLSX-afschriften werken ook; de app leest het eerste blad

Er worden in de loop van de tijd meer banken toegevoegd. Als die van jou er nog niet bij staat, gebruik dan **Overig** en wijs de kolommen zelf toe.

## Hoe te importeren

1. Ga naar **Instellingen → Transacties importeren**
2. Kies je bank uit de lijst (of **Overig (eigen CSV)** als die er niet bij staat)
3. Selecteer het bestand dat je van je bank hebt geëxporteerd
4. De app toont een voorbeeld — elke rij is gemarkeerd als een uitgave, inkomsten of valutawissel
5. Vink de rijen uit die je niet wilt, en tik vervolgens op **Importeren**

De app slaat rijen over die al in je account bestaan door te matchen op datum, bedrag en valuta — hetzelfde bestand twee keer importeren maakt geen duplicaten aan. Gematchte rijen zijn standaard uitgevinkt; vink er één opnieuw aan als het werkelijk een aparte transactie is.

## Waar je de export van je bank vindt

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)
- **Revolut**: Revolut-app → Statements → kies datumbereik → CSV → Download
- **Wise**: wise.com → Transactions → Statements and Reports → kies datumbereik → CSV → kies valuta/saldo → Download

> **Wise-tip:** Wise genereert één CSV per valutasaldo. Importeer elke valuta apart. Maximaal 469 dagen per export.

## Wise — valutaconversies en kosten

Wanneer je binnen Wise valuta's omzet (bijv. 100 USD → EUR), maakt Wise twee rijen aan. De app detecteert deze paren automatisch en maakt één enkel **Valutawissel**-record aan (zichtbaar onder Portemonnee → Wissels) in plaats van twee niet-gerelateerde transacties.

Wise rapporteert kosten ook in een aparte kolom `Total fees` — de app vouwt de kosten in het uitgavebedrag zodat het totaal overeenkomt met wat er daadwerkelijk van je saldo is afgegaan.

## Wat wordt geïmporteerd

Elke rij wordt een Uitgave, Inkomsten of Valutawissel. Categorieën worden automatisch voorgesteld voor populaire verkopers — je kunt ze later wijzigen. Elke geïmporteerde rij wordt gemarkeerd met de bronbank en een unieke ID, zodat hetzelfde bestand opnieuw importeren altijd veilig is.

**Nettere verkoopnamen.** Bekende winkelketens worden automatisch herkend, zodat een afschriftregel als `BIEDRONKA 1234 WARSZAWA` gewoon wordt opgeslagen als **Biedronka**. Zo verschijnt één winkel in je analyse als één verkoper in plaats van tientallen afzonderlijke vermeldingen.

## "Overig" — universele CSV-toewijzer

Als je bank niet in de lijst staat, kies dan **Overig (eigen CSV)**. De app toont een voorbeeld van je bestand en vraagt je aan te wijzen welke kolom de datum, het bedrag en de omschrijving bevat. Sla deze toewijzing op met een naam en de volgende CSV met dezelfde kolomindeling wordt automatisch geïmporteerd.

## Als niets je afschrift herkent

Als geen van de bovenstaande banken past en het bestand geen eenvoudige kolomindeling heeft die de app zelf kan raden, kan de app een AI-model vragen om de kolommen voor je te bepalen — welke de datum is, welke het bedrag, enzovoort.

**Voordat er iets wordt verzonden, wordt het je één keer gevraagd.** De eerste keer dat dit gebeurt voor een account, zie je een scherm dat uitlegt wat je apparaat verlaat: voor een CSV of spreadsheet alleen de kopregel plus maximaal 10 voorbeeldrijen — nooit het hele bestand. Voor een PDF-afschrift zijn het de eerste 20 regels geëxtraheerde tekst. Je beslist één keer per account; daarna onthoudt de app je keuze.

- **Accepteer**, en het bestand wordt opnieuw ingelezen met de kolommen die het model heeft bepaald.
- **Weiger**, en je komt direct bij de hierboven beschreven handmatige toewijzer terecht. Weigeren gebeurt voordat er iets is geanalyseerd, dus er is nog niets om vooraf in te vullen — je wijst de kolommen op dezelfde manier toe als bij elke andere niet-ondersteunde bank.

**Het resultaat wordt getoond, niet aangenomen.** Wanneer de AI-toewijzing lukt, toont de voorvertoning een rij chips boven je transacties — zoiets als `Datum → Data operacji`, `Bedrag → Kwota` — samen met een gok naar welke bank dit is. Dit is een goede gok, geen zekerheid: tik op de rij om op elk moment de toewijzer te openen en een verkeerd herkende kolom te corrigeren.

**Een paar dingen worden gemarkeerd om te controleren, niet stilzwijgend aangenomen:**
- Als het bestand helemaal geen valutakolom heeft, wordt elke rij gelezen in de valuta van je eigen account, en een melding vertelt je dat — tik erop om de valuta te wijzigen vóór het importeren; de wijziging geldt voor het hele bestand.
- Cijfers uit een PDF lezen is lastiger te controleren dan bij een CSV, dus probeert de app te bevestigen dat wat er gevonden is optelt tot het eindsaldo van het afschrift. Als dat niet kan worden bevestigd, zie je een melding die je vraagt de lijst te controleren. Dit is geen fout — het is gewoon het normale geval wanneer een afschrift geen lopend saldo afdrukt om mee te vergelijken, of wanneer de controle niet klopt.

**PDF-afschriften vereisen een Pro-abonnement.** Een PDF met AI lezen kost meer verwerking dan een CSV, dus het is een Pro-functie — een gratis account ziet daar een upgradescherm in plaats van een foutmelding.

Banken die hierboven al vermeld staan (mBank, PKO BP, Erste, Alior, Revolut, Wise) worden hier niet door beïnvloed — die worden precies zo geïmporteerd als eerder op deze pagina beschreven.

## Eerdere imports & ongedaan maken

De sectie **Eerdere imports** onder aan **Instellingen → Transacties importeren** toont de laatste 20 imports — bron, datum en aantal rijen.

Om een recente import ongedaan te maken, tik op de **pijl voor ongedaan maken** (↩) aan de rechterkant. Alle transacties van die import worden verwijderd en de dedup-vergrendeling wordt opgeheven zodat je hetzelfde bestand schoon opnieuw kunt importeren.

- Ongedaan maken is beschikbaar binnen **30 dagen** na de oorspronkelijke import.
- Imports ouder dan 30 dagen tonen de knop voor ongedaan maken niet.

## Zie je je bank niet?

Onder aan **Instellingen → Transacties importeren** staat een kaart **"Zie je je bank niet?"**. Tik erop, voer de naam van de bank in en voeg een voorbeeldafschrift toe. Je verzoek gaat rechtstreeks naar ons team.

## Codering

Voor CSV-bestanden detecteert de app automatisch UTF-8 en Windows-1250 (gangbaar voor Poolse bankexports). PDF-afschriften worden direct gelezen — geen keuze voor codering nodig.

## Overstappen van een andere app?

Onder **Instellingen → Transacties importeren** staat een aparte kaart **'Overstappen van een andere app?'** met Monefy, Wallet by BudgetBakers en Money Manager / 1Money.

Exporteer je geschiedenis uit de oude app, kies hier de bijbehorende regel, en je transacties gaan mee — **samen met je categorieën**. Een categorie die je daar had en die hier nog niet bestaat, wordt voor je aangemaakt, zodat je geschiedenis geordend aankomt in plaats van als één ongedifferentieerde hoop.

Overboekingen tussen je eigen rekeningen in de oude app worden overgeslagen: dat zijn geen uitgaven, en importeren zou ze dubbel tellen.

Staat jouw app er niet bij? Gebruik **Automatisch detecteren** bovenaan — onbekende exportformaten worden automatisch geanalyseerd en importeren meestal toch prima.

---

*Zie ook: [Uitgaven & inkomsten](./03-expenses-and-income.md) | [Portemonnee & wissel](./10-wallet-and-exchange.md) | [Instellingen](./11-settings.md)*
