# Widgets voor het startscherm

> Voeg Android-widgets toe aan je startscherm voor directe toegang tot je bestedingsgegevens — of om uitgaven toe te voegen zonder de app zelfs maar te openen.

## Wat zijn widgets?

Widgets zijn kleine interactieve panelen die op je Android-startscherm staan. AI Budget Assistant biedt vier widgets:

| Widget | Grootte | Wat het toont |
|--------|------|---------------|
| **Budget – Vandaag** | Klein | Totale uitgaven van vandaag + verandering t.o.v. gisteren |
| **Budget – Week** | Middel | Staafdiagram van de laatste 7 dagen |
| **Budget – Overzicht** | Groot | Voortgangsbalken van budgetten + belangrijkste bestedingscategorieën |
| **Budget – Snel toevoegen** | Compacte strip | Drie knoppen om te tikken en te openen |

> **Alleen Android.** iOS ondersteunt geen widgets voor het startscherm. Alle dezelfde functies zijn beschikbaar in de app.

---

## Een widget toevoegen

1. **Houd lang ingedrukt** op een leeg gedeelte van je startscherm
2. Tik op **Widgets**
3. Scroll om **AI Budget Assistant** te vinden
4. **Houd lang ingedrukt** op de widget die je wilt en sleep die naar je startscherm
5. Laat los om hem te plaatsen

Herhaal dit om meerdere widgets toe te voegen.

---

## Budget – Vandaag (Klein)

![Kleine widget](../img/home-1.jpg)

De kleinste widget toont een snelle dagelijkse momentopname:

- **Totaal van vandaag** aan uitgaven
- **Verschilindicator** — of je meer of minder hebt uitgegeven dan gisteren (groen = minder, rood = meer)

**Grootte**: 110 × 40 dp (ongeveer 1 kolom × 1 rij op de meeste launchers)

Tik op de widget om de app te openen.

---

## Budget – Week (Middel)

De middelgrote widget geeft je in één oogopslag een weekoverzicht:

- **Staafdiagram** van de uitgaven voor elk van de laatste 7 dagen
- **Totaal van vandaag** weergegeven onder de grafiek

**Grootte**: 250 × 110 dp (ongeveer 2 kolommen × 2 rijen)

Tik op de widget om de app te openen.

---

## Budget – Overzicht (Groot)

De grote widget is je financiële dashboard op het startscherm:

- **Voortgangsbalken van budgetten** voor elk actief budget — toont hoeveel van de budgetperiode je hebt gebruikt
- **Belangrijkste bestedingscategorieën** met bedragen voor de huidige periode

**Grootte**: 250 × 180 dp (ongeveer 2 kolommen × 4 rijen)

Tik op de widget om de app te openen.

---

## Budget – Snel toevoegen

Met de widget Snel toevoegen kun je met één tik beginnen met het toevoegen van een uitgave — je hoeft de app niet eerst te openen.

```
┌──────────────────────────────────────┐
│   🎤 Stem   │  📷 Scan  │  ✏️ Toevoegen  │
└──────────────────────────────────────┘
```

| Knop | Wat er gebeurt |
|--------|-------------|
| 🎤 **Stem** | Opent de app op het scherm voor spraakopname |
| 📷 **Scan** | Opent de app op de bonscanner |
| ✏️ **Toevoegen** | Opent de app op het handmatige uitgavenformulier |

**Grootte**: 250 × 60 dp (compacte horizontale strip)

> **Tip:** Snel toevoegen toont geen gegevens — het is altijd up-to-date en gebruikt geen batterij voor verversen op de achtergrond.

---

## Vernieuwen van widgetgegevens

| Widget | Vernieuwingsinterval |
|--------|-----------------|
| Budget – Vandaag | Elke 30 minuten |
| Budget – Week | Elke 30 minuten |
| Budget – Overzicht | Elke 30 minuten |
| Budget – Snel toevoegen | Statisch, vernieuwt nooit |

Datawidgets halen gegevens uit de lokale opslag van je apparaat, dus ze werken ook zonder internetverbinding.

---

## Veelgestelde vragen

**V: Waarom verschijnen widgets niet in de widgetkiezer?**
A: Zorg ervoor dat de app is geïnstalleerd en dat je minstens één keer bent ingelogd. Als de widgets niet verschijnen, probeer dan je launcher opnieuw te starten of de app opnieuw te installeren.

**V: Mijn widget toont "Nog geen gegevens". Wat moet ik doen?**
A: Open de app en voeg minstens één uitgave toe of controleer of de synchronisatie is voltooid. De widget wordt binnen 30 minuten vernieuwd, of je kunt handmatig een synchronisatie starten via **Instellingen → Nu synchroniseren**.

**V: Zijn widgets beschikbaar op iOS?**
A: Nee. Widgets voor het startscherm vereisen Android. Alle dezelfde functies zijn beschikbaar in de app op iOS.

**V: Kan ik de grootte van de widgets aanpassen?**
A: Budget – Vandaag en Budget – Snel toevoegen hebben een vaste grootte. Budget – Week kan horizontaal worden vergroot of verkleind. Budget – Overzicht kan zowel horizontaal als verticaal worden aangepast.

---

*Zie ook: [Spraakinvoer & bonnen scannen](./04-voice-and-receipt.md) | [Uitgaven & inkomsten](./03-expenses-and-income.md)*
