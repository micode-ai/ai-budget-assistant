---
title: "Revolut-afschrift importeren in je huishoudboekje"
meta_description: "Revolut-afschrift als CSV importeren in je huishoudboekje: export, voorbeeld, valutawissels als één boeking en geen dubbele posten bij opnieuw importeren."
target_keyword: "revolut afschrift importeren"
slug: "revolut-afschrift-importeren"
pair: "import-revolut"
lang: "nl"
date: "2026-10-07"
---

# Revolut-afschrift importeren in je huishoudboekje in een paar minuten

Om een Revolut-afschrift te importeren, maak je in de Revolut-app een afschrift als CSV en open je in AI Budget Assistant Instellingen → Transacties importeren → Revolut en kies je het bestand. Je krijgt een voorbeeld met voorgestelde categorieën, afgevinkte dubbele posten en valutawissels samengevoegd tot één boeking. Het kost een paar minuten.

Revolut is een van de makkelijkste banken om te importeren: de CSV heeft een vaste kolomindeling en vermeldt de valuta van elke regel. Hieronder staat wat de app precies uit het bestand leest en waar je op moet letten.

## Hoe exporteer ik een afschrift uit Revolut?

Open in de Revolut-app de afschriften van je rekening (in de Engelse interface heet het onderdeel Statements), kies de periode en het formaat CSV en download het bestand naar je telefoon of computer. Revolut hernoemt knoppen af en toe. Ziet het scherm er anders uit, zoek dan de optie waarmee je een afschrift maakt en CSV kunt kiezen.

Goede gewoonte: download de eerste keer een langere periode, bijvoorbeeld drie tot zes maanden. Overlappende periodes opnieuw importeren is veilig, omdat de app boekingen herkent die hij al heeft.

## Hoe importeer ik het bestand stap voor stap?

1. **Download de CSV uit Revolut** op het apparaat waarop de app draait.
2. Ga in AI Budget Assistant naar **Instellingen → Transacties importeren**.
3. Kies **Revolut** in de lijst (of **Automatisch herkennen (elke bank)**, dat de Revolut-indeling aan de kopregels herkent).
4. Kies het bestand. De app toont een voorbeeld: elke regel als uitgave, inkomst of valutawissel, met een voorgestelde categorie.
5. Vink regels uit die je niet wilt, pas categorieën aan en tik op **Importeren**.

In het voorbeeld zie je tellers voor geselecteerde en al geïmporteerde regels. Regels die de app al kent, staan standaard uitgevinkt.

## Wat leest de app uit een Revolut-bestand?

| Onderdeel | Verwerking |
|---|---|
| Formaat | CSV met komma's, kopregels op de eerste regel |
| Kolommen | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Datum | Uit Started Date (alleen de datum, zonder tijd) |
| Bedrag | Met teken: negatief is een uitgave, positief een inkomst |
| Valuta | Per regel, dus een meervaluta-rekening mengt niets |
| Status | Alleen COMPLETED-regels worden geïmporteerd; geweigerde en lopende worden overgeslagen |
| Valutawissel | Twee EXCHANGE-regels met dezelfde datum en tegengestelde tekens worden één valutawissel |
| Winkel | Uit Description, met een opgeschoonde naam voor bekende ketens |

## Wat gebeurt er met valutawissels en meervaluta-rekeningen?

Een Revolut-rekening bevat vaak meerdere valuta. Wissel je zloty naar euro, dan staan er twee regels in het bestand: geld eruit in de ene valuta, geld erin in de andere. Los geteld zouden ze een nepuitgave en een nepinkomst opleveren. Daarom koppelt de app die regels en slaat hij één **valutawissel** op, zichtbaar in de Portemonnee en niet in je uitgaven.

Aankopen in vreemde valuta blijven in hun eigen valuta.

## Hoe voorkom ik dubbele posten, en wat als er iets misgaat?

De app beschermt je op twee manieren. Eerst krijgt elke regel een uniek ID uit datum, bedrag en omschrijving, zodat hetzelfde bestand opnieuw importeren niets toevoegt. Daarnaast vergelijkt hij datum, bedrag en valuta met de boekingen die al in je account staan, ook handmatige, en vinkt hij waarschijnlijke herhalingen uit.

Twee identieke aankopen op dezelfde dag, zoals twee koffies voor dezelfde prijs, blijven twee aparte boekingen. Bevalt het resultaat niet, dan maak je de import in de importgeschiedenis onderaan het scherm met één tik ongedaan binnen 30 dagen, en kun je hetzelfde bestand opnieuw importeren.

De algemene werking lees je in [Bankafschriften importeren](/blog/nl/bankafschrift-importeren/). Staat je bank niet in de lijst, kijk dan bij [Bankafschrift van elke bank importeren](/blog/nl/bankafschrift-van-elke-bank-importeren/).

## Is het veilig?

Je voert nooit je Revolut-inloggegevens in. Je importeert een statisch bestand dat je zelf hebt gedownload, dus de app ziet alleen de transactiegeschiedenis uit dat bestand. Je kunt AI Budget Assistant gratis proberen op [ai-budget.pl](https://ai-budget.pl) of via [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: Revolut-afschrift importeren

**Welk formaat Revolut-afschrift heb ik nodig?**

CSV. Dat is het bestand met de kolommen Type, Started Date, Description, Amount, Currency, State en Balance dat Revolut maakt in het afschriftenonderdeel van je rekening. Een pdf kan alleen via AI-uitlezing worden verwerkt, een Pro-functie, dus kies voor reguliere imports CSV.

**Worden geweigerde of lopende transacties geïmporteerd?**

Nee. Alleen regels met status COMPLETED worden overgenomen. Een geweigerde kaartbetaling verlaagt je budget dus niet, en een lopende verschijnt in een later afschrift zodra die is verwerkt.

**Telt een valutawissel bij Revolut als uitgave?**

Nee. Twee wisselregels met dezelfde datum en tegengestelde tekens worden samengevoegd tot één valutawissel in de Portemonnee. Dat blaast noch je uitgaven noch je inkomsten op.

**Kan ik hetzelfde afschrift twee keer importeren?**

Ja, er wordt niets dubbel opgeslagen. Herhaalde regels worden herkend en in het voorbeeld uitgevinkt als al geïmporteerd.

**Kan ik een Revolut-import ongedaan maken?**

Ja. Tik in de importgeschiedenis onderaan het importscherm op de pijl voor ongedaan maken bij de import. Dat kan 30 dagen, daarna kun je hetzelfde bestand opnieuw importeren.
