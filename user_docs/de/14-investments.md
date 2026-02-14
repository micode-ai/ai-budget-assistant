# Anlageportfolio

Verfolge dein Anlageportfolio mit aktuellen Marktpreisen. Uberwache Aktien, ETFs, Kryptowahrungen, Anleihen und Rohstoffe an einem Ort.

## Uberblick

Die Anlageportfolio-Funktion ermoglicht dir:

- Positionen verschiedener Anlagetypen zu verfolgen
- Preise in Echtzeit und Portfoliowert zu sehen
- Renditen uber verschiedene Zeitraume zu analysieren
- Deine Ergebnisse mit Markt-Benchmarks zu vergleichen (SPY, QQQ, DIA, IWM)
- Kauf-/Verkaufstransaktionen mit Gebuhren zu erfassen

## Anlagekonto erstellen

Fur das Anlage-Tracking ist ein spezieller Kontotyp **Anlage** erforderlich:

1. Gehe zum Tab **Konten**
2. Tippe auf **Konto erstellen**
3. Wahle den Typ **Anlage**
4. Benenne dein Portfolio (z.B. "Hauptportfolio", "Altersvorsorge")
5. Tippe auf **Erstellen**

## Positionen hinzufugen

### Vermogenswerte suchen

1. Offne dein Anlagekonto
2. Tippe auf **Position hinzufugen**
3. Suche nach Tickersymbol (z.B. "AAPL") oder Firmenname (z.B. "Apple")
4. Wahle den richtigen Vermogenswert aus den Suchergebnissen
5. Fuge Notizen hinzu (optional)
6. Tippe auf **Speichern**

### Unterstutzte Anlagetypen

| Typ | Beispiele |
|-----|-----------|
| Aktien | AAPL, MSFT, GOOGL |
| ETFs | SPY, QQQ, VTI |
| Krypto | BTC, ETH, SOL |
| Anleihen | Staats- und Unternehmensanleihen |
| Rohstoffe | Gold, Silber, Ol |

## Transaktionen erfassen

Nach dem Hinzufugen einer Position erfasse deine Kauf-/Verkaufstransaktionen:

1. Offne die Positionsdetails
2. Tippe auf **Transaktion hinzufugen**
3. Wahle den Typ: **Kauf** oder **Verkauf**
4. Gib ein:
   - **Menge** — Anzahl der Aktien/Einheiten
   - **Preis pro Einheit** — Kauf-/Verkaufspreis
   - **Gebuhr** — Maklerprovision (optional)
   - **Datum** — Transaktionsdatum
   - **Notizen** — zusatzliche Informationen (optional)
5. Tippe auf **Speichern**

Die App berechnet automatisch:
- **Durchschnittlicher Kaufpreis** — gewichteter Durchschnittspreis
- **Gesamtinvestition** — Summe aller Kaufe minus Verkaufe
- **Aktueller Gewinn/Verlust** — basierend auf dem aktuellen Preis

## Portfoliozusammenfassung

Der Hauptbildschirm fur Anlagen zeigt:

- **Gesamtwert** — aktueller Marktwert aller Positionen
- **Gesamter Gewinn/Verlust** — Gewinn- oder Verlustbetrag
- **Gesamtrendite %** — prozentuale Rendite
- **Tagesanderung** — heutige Wertanderung

Fur jede Position wird angezeigt:
- Aktueller Preis und Tagesanderung
- Deine Menge und Durchschnittspreis
- Individueller Gewinn/Verlust und Portfolioanteil

## Analysen

Zugang zu detaillierten Portfolioanalysen:

1. Tippe auf die Schaltflache **Analysen**
2. Wahle den Zeitraum: 1W, 1M, 3M, 1J oder Gesamt

### Performance-Diagramm

Zeigt den Portfoliowert im Zeitverlauf im Vergleich zum investierten Betrag. Der Bereich zwischen den Linien stellt deinen Gewinn oder Verlust dar.

### Verteilung nach Typen

Visualisiert die Verteilung des Portfolios nach Anlagetypen (Aktien, ETFs, Krypto usw.).

### Top-Gewinner und Verlierer

Liste der besten und schlechtesten Positionen nach prozentualer Rendite.

### Benchmark-Vergleich (Pro+)

Vergleiche deine Portfoliorendite mit Marktindizes:

| Benchmark | Beschreibung |
|-----------|--------------|
| SPY | S&P 500 Index |
| QQQ | Nasdaq 100 Index |
| DIA | Dow Jones Industrial Index |
| IWM | Russell 2000 (Small Cap) |

**Verstandnis des Vergleichs:**
- **Portfoliorendite** — dein tatsachlicher prozentualer Gewinn/Verlust
- **Benchmark-Rendite** — Indexperformance im gleichen Zeitraum
- **Differenz** — um wie viel du den Markt uber- oder untertroffen hast

## Berechnungen verstehen

Tippe auf eine beliebige Analysekarte, um die Formelerklarung zu sehen:

### Rendite
```
Rendite % = ((Endwert - Startwert) / Startwert) x 100
```

### Gewinn/Verlust (G/V)
```
G/V = Aktueller Wert - Gesamtinvestition
G/V % = (G/V / Gesamtinvestition) x 100
```

### Verteilung
```
Anteil % = (Vermogenswert / Gesamtportfoliowert) x 100
```

## Preisaktualisierung

- Preise werden automatisch alle 15 Minuten aktualisiert
- Tippe auf **Aktualisieren** fur sofortige Aktualisierung
- Historische Preise werden zwischengespeichert, um Datenverbrauch zu sparen

## Tipps

1. **Diversifiziere das Tracking** — fuge alle Investitionen fur ein vollstandiges Bild hinzu
2. **Berucksichtige Gebuhren** — inkludiere Maklergebuhren fur genaue Gewinnberechnung
3. **Nutze Benchmarks** — vergleiche mit Indizes zur Leistungsbewertung
4. **Uberprufe regelmasig** — schau dir die Analysen wochentlich an, um Trends zu erkennen

## Einschrankungen

- Preisdaten werden uber Twelve Data API bereitgestellt
- Einige exotische Instrumente sind moglicherweise nicht verfugbar
- Historische Daten auf Handelstage beschrankt
- Echtzeitpreise konnen eine Verzogerung von bis zu 15 Minuten haben

---

[Zuruck: Erfolge & Gamification](./13-gamification.md) | [Zum Inhaltsverzeichnis](./00-index.md)
