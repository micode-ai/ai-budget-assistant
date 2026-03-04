# Simulateur de scénarios

> Déplacez les curseurs pour ajuster les catégories de dépenses et de revenus — et voyez instantanément comment vos économies évolueraient sur 3, 6 ou 12 mois.

## Présentation

Le **Simulateur de scénarios** répond aux questions « et si… ? » sans modifier les données réelles. Réduisez les dépenses alimentaires de 20 %, ajoutez un revenu complémentaire de 500 € — et observez immédiatement combien vous pourriez économiser en 6 mois.

Tous les calculs sont locaux. Aucune donnée n'est envoyée, l'historique des transactions reste inchangé.

## Comment y accéder

Ouvrez l'onglet **Analyse** et appuyez sur la bannière du **Simulateur de scénarios** en haut de l'écran.

## D'où viennent les montants

Le simulateur utilise les **3 derniers mois** de transactions et calcule une moyenne mensuelle par catégorie :

```
moyenne mensuelle = total de la catégorie sur 3 mois ÷ 3
```

Tous les montants sont convertis dans votre devise de base selon les taux de change actuels.

## Ajuster les dépenses

Chaque catégorie de dépenses est affichée avec sa moyenne mensuelle actuelle et un curseur allant de **−100 %** à **+100 %** par pas de 5 %.

- Faites glisser vers la **gauche** (négatif) pour modéliser des réductions — la barre devient verte
- Faites glisser vers la **droite** (positif) pour modéliser des augmentations — la barre devient rouge
- L'étiquette sous le curseur affiche le montant résultant

## Ajuster les revenus

Les catégories de revenus fonctionnent de la même façon. Droite = augmentation, gauche = réduction.

### Ajouter un revenu supplémentaire

Appuyez sur **Ajouter un revenu supplémentaire** dans la section revenus pour saisir une nouvelle source (ex. : travail freelance). Entrez une description et un montant mensuel. Plusieurs entrées sont possibles.

## Graphique de projection

Le graphique montre les économies cumulées sur l'horizon sélectionné :

- **Ligne grise** — trajectoire actuelle (sans modifications)
- **Ligne colorée** — trajectoire du scénario (avec vos ajustements)

Utilisez les puces **3 / 6 / 12 mois** au-dessus du graphique pour modifier l'horizon de projection.

## Cartes de synthèse

Trois cartes sous le graphique affichent les totaux du scénario pour 3, 6 et 12 mois. L'horizon actuel est mis en évidence. Chaque carte indique :

- Économies cumulées selon le scénario
- Économies cumulées selon la trajectoire actuelle (à titre de comparaison)
- Différence

## Barre de synthèse (en haut)

La carte tout en haut se met à jour en temps réel.

## Réinitialisation

Appuyez sur **Tout réinitialiser** en bas pour remettre tous les curseurs et revenus supplémentaires à zéro.

## FAQ

- **Q : Les curseurs modifient-ils mes vraies données ?**
  **R :** Non. Le simulateur lit uniquement l'historique des transactions pour calculer des moyennes. Rien n'est enregistré ni modifié.

- **Q : Pourquoi les montants des catégories semblent-ils faibles ?**
  **R :** Les montants sont une moyenne sur 3 mois. Si un mois a été inhabituellement bas, la moyenne sera plus faible.

- **Q : Une catégorie de revenus est absente.**
  **R :** Seules les catégories ayant au moins une transaction au cours des 3 derniers mois sont affichées.

---

*Voir aussi : [Analyse](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Objectifs d'épargne](./18-savings-goals.md)*
