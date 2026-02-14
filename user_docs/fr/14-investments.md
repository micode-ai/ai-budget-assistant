# Portefeuille d'investissement

Suivez votre portefeuille d'investissement avec des prix de marche en temps reel. Surveillez les actions, ETFs, cryptomonnaies, obligations et matieres premieres en un seul endroit.

## Apercu

La fonctionnalite de portefeuille d'investissement vous permet de :

- Suivre des positions de differents types d'actifs
- Voir les prix en temps reel et la valeur du portefeuille
- Analyser les rendements sur differentes periodes
- Comparer vos resultats aux benchmarks du marche (SPY, QQQ, DIA, IWM)
- Enregistrer les transactions d'achat/vente avec les frais

## Creer un compte d'investissement

Le suivi des investissements necessite un type de compte special **Investissement** :

1. Allez dans l'onglet **Comptes**
2. Appuyez sur **Creer un compte**
3. Selectionnez le type **Investissement**
4. Nommez votre portefeuille (ex. "Portefeuille principal", "Retraite")
5. Appuyez sur **Creer**

## Ajouter des positions

### Rechercher des actifs

1. Ouvrez votre compte d'investissement
2. Appuyez sur **Ajouter une position**
3. Recherchez par symbole (ex. "AAPL") ou nom de societe (ex. "Apple")
4. Selectionnez l'actif correct dans les resultats
5. Ajoutez des notes (optionnel)
6. Appuyez sur **Enregistrer**

### Types d'actifs pris en charge

| Type | Exemples |
|------|----------|
| Actions | AAPL, MSFT, GOOGL |
| ETFs | SPY, QQQ, VTI |
| Cryptomonnaies | BTC, ETH, SOL |
| Obligations | Gouvernementales et d'entreprise |
| Matieres premieres | Or, argent, petrole |

## Enregistrer des transactions

Apres avoir ajoute une position, enregistrez vos transactions d'achat/vente :

1. Ouvrez les details de la position
2. Appuyez sur **Ajouter une transaction**
3. Selectionnez le type : **Achat** ou **Vente**
4. Entrez :
   - **Quantite** — nombre d'actions/unites
   - **Prix unitaire** — prix d'achat/vente
   - **Frais** — commission du courtier (optionnel)
   - **Date** — date de la transaction
   - **Notes** — informations supplementaires (optionnel)
5. Appuyez sur **Enregistrer**

L'application calcule automatiquement :
- **Prix d'achat moyen** — prix moyen pondere
- **Total investi** — somme des achats moins les ventes
- **Plus-value/moins-value actuelle** — basee sur le prix actuel

## Resume du portefeuille

L'ecran principal des investissements affiche :

- **Valeur totale** — valeur de marche actuelle de toutes les positions
- **Plus-value/moins-value totale** — montant du gain ou de la perte
- **Rendement total %** — retour en pourcentage
- **Variation du jour** — variation de valeur aujourd'hui

Pour chaque position est affiche :
- Prix actuel et variation journaliere
- Votre quantite et prix moyen
- Plus-value/moins-value individuelle et pourcentage du portefeuille

## Analyses

Accedez aux analyses detaillees du portefeuille :

1. Appuyez sur le bouton **Analyses**
2. Selectionnez la periode : 1S, 1M, 3M, 1A ou Tout

### Graphique de performance

Montre la valeur du portefeuille dans le temps par rapport au montant investi. La zone entre les lignes represente votre gain ou perte.

### Repartition par types

Visualise la repartition du portefeuille par types d'actifs (actions, ETFs, crypto, etc.).

### Meilleurs gains et pertes

Liste des meilleures et pires positions par rendement en pourcentage.

### Insights IA du portefeuille (Pro+)

Obtenez une analyse de votre portefeuille alimentée par l'IA avec des recommandations actionnables :

1. Ouvrez l'onglet **Analyses**
2. Faites défiler jusqu'au carrousel **Insights** en haut
3. Balayez gauche/droite pour voir différents insights
4. Appuyez sur le bouton fermer pour masquer un insight

**Types d'insights :**

| Type | Description |
|------|-------------|
| Risque de concentration | Avertit lorsqu'un actif domine le portefeuille |
| Déséquilibre sectoriel | Alerte sur la surexposition à un type d'actif |
| Sous-performant | Identifie les actifs en retard sur le marché |
| Surperformant | Met en évidence les opportunités de rééquilibrage |
| Écart du benchmark | Montre quand le portefeuille s'écarte du benchmark |
| Lacune de diversification | Suggère les types d'actifs manquants |
| Alerte de base de coût | Plus-values/moins-values non réalisées fiscalement pertinentes |
| Impact des frais | Avertit quand les frais réduisent les rendements |

Chaque insight comprend une visualisation (graphique) et une suggestion actionnable.

**Note :** Les insights IA sont mis en cache pendant 24 heures et coûtent 2,5 crédits IA par actualisation.

### Comparaison avec benchmark (Pro+)

Comparez le rendement de votre portefeuille avec les indices de marche :

| Benchmark | Description |
|-----------|-------------|
| SPY | Indice S&P 500 |
| QQQ | Indice Nasdaq 100 |
| DIA | Indice Dow Jones Industrial |
| IWM | Russell 2000 (petite capitalisation) |

**Comprendre la comparaison :**
- **Rendement du portefeuille** — votre gain/perte reel en pourcentage
- **Rendement du benchmark** — performance de l'indice sur la meme periode
- **Difference** — de combien vous avez surpasse ou sous-performe le marche

## Comprendre les calculs

Appuyez sur n'importe quelle carte d'analyse pour voir l'explication de la formule :

### Rendement
```
Rendement % = ((Valeur finale - Valeur initiale) / Valeur initiale) x 100
```

### Plus-value/moins-value (P/M)
```
P/M = Valeur actuelle - Total investi
P/M % = (P/M / Total investi) x 100
```

### Repartition
```
Pourcentage % = (Valeur de l'actif / Valeur totale du portefeuille) x 100
```

## Mise a jour des prix

- Les prix se mettent a jour automatiquement toutes les 15 minutes
- Appuyez sur le bouton **Actualiser** pour une mise a jour immediate
- Les prix historiques sont mis en cache pour economiser les donnees

## Conseils

1. **Diversifiez le suivi** — ajoutez tous vos investissements pour une vue complete
2. **Incluez les frais** — enregistrez les commissions du courtier pour des calculs precis
3. **Utilisez les benchmarks** — comparez avec les indices pour evaluer les resultats
4. **Verifiez regulierement** — consultez les analyses chaque semaine pour detecter les tendances

## Limitations

- Les donnees de prix proviennent de l'API Twelve Data
- Certains instruments exotiques peuvent ne pas etre disponibles
- Donnees historiques limitees aux jours de marche
- Les prix en temps reel peuvent avoir un delai jusqu'a 15 minutes

---

[Precedent : Succes et Gamification](./13-gamification.md) | [Retour a la table des matieres](./00-index.md)
