# Tableau de bord

> Votre centre de commande financier. Consultez l'etat de votre budget, vos revenus, vos depenses et vos soldes de portefeuille en un coup d'oeil, avec des actions rapides pour ajouter des depenses en un seul appui. Vous pouvez afficher ou masquer des sections individuelles depuis [Parametres](./11-settings.md) → Widgets du tableau de bord.

## Apercu

Le Tableau de bord est le premier ecran que vous voyez apres vous etre connecte. Il affiche un message d'accueil personnalise, le contexte de votre compte actuel et les indicateurs financiers cles du mois en cours.

![Tableau de bord avec actions rapides et apercu du budget](../img/home-1.jpg)

## Changer de compte

Dans le coin superieur gauche, appuyez sur le nom du compte (par ex. **Famille**) pour ouvrir le menu deroulant **Changer de compte**. Vous pouvez basculer entre vos comptes Personnel, Partage et Professionnel. Toutes les donnees du Tableau de bord se mettent a jour pour refleter le compte selectionne.

## Actions rapides

Quatre boutons d'actions rapides situes sous le message d'accueil vous donnent un acces rapide aux taches les plus courantes :

| Bouton | Action |
|---|---|
| **Ajouter une depense** | Ouvre le formulaire de saisie manuelle de depense |
| **Saisie vocale** | Ouvre l'ecran de depense vocale — decrivez votre depense naturellement |
| **Scanner un recu** | Ouvre l'appareil photo pour photographier un recu et en extraire les informations par IA |
| **Change** | Ouvre le formulaire de change de devises |

## Santé Financière

Le widget **Santé Financière** affiche un score unique de 0 à 100 résumant votre santé financière globale pour le mois en cours :

- **Vert (70–100)** — finances en excellente forme
- **Jaune (40–69)** — certains domaines nécessitent une attention
- **Rouge (0–39)** — problèmes importants détectés

La jauge circulaire en haut à droite de la carte se remplit proportionnellement à votre score. Appuyez sur la carte pour ouvrir un détail avec quatre composantes :

| Composante | Pts max | Description |
|---|---|---|
| Respect du budget | 25 | % des budgets actifs ne dépassant pas la limite |
| Taux d'épargne | 25 | Cartographie votre % d'épargne mensuelle linéairement (0% → 0 pts, 20%+ → 25 pts) |
| Avancement des objectifs | 25 | % des objectifs d'épargne actifs en bonne voie |
| Santé des dettes | 25 | Déduction proportionnelle pour les dettes en retard |

> **« Pas assez de données »** s'affiche lorsque moins de deux composantes ont des données (p. ex., un nouveau compte sans budgets, objectifs, dettes ou revenus).

Le score est calculé entièrement sur l'appareil — aucune connexion Internet ni appel IA requis.

## Widget Gamification

Sous les actions rapides, une carte compacte de gamification affiche votre progression :

- **Niveau** — votre niveau actuel accompagne d'une barre de progression XP (par ex. **Niveau 4 — 65/100 XP**)
- **Serie** — le nombre de jours consecutifs de suivi, avec un emoji flamme lorsque la serie est active ou un emoji flocon de neige lorsqu'elle est interrompue

Appuyez sur le widget pour ouvrir l'ecran complet des **Succes**, ou vous pouvez parcourir vos badges, consulter votre progression et decouvrir de nouveaux succes a debloquer.

> **Astuce :** Maintenez votre serie en ajoutant au moins une transaction chaque jour !

## Carte de budget mensuel

- Affiche vos depenses actuelles par rapport a votre budget mensuel (par ex. **2 846,83 zl sur 20 000,00 zl**)
- Barre de progression avec code couleur : vert (sous controle), jaune (approche de la limite), rouge/orange (proche ou au-dela du budget)
- Affiche le **pourcentage utilise** (par ex. 86 % utilise)
- Appuyez sur la carte pour acceder a l'onglet **Budgets** pour plus de details

> **Note :** Si aucun budget mensuel n'est defini, vous verrez une indication pour en creer un.

## Revenus et depenses

![Tableau de bord defilant — revenus, depenses, portefeuille](../img/home-2.jpg)

Une carte combinee affichant vos totaux mensuels cote a cote :

- **Revenus** (gauche, vert) — votre revenu total du mois en cours (par ex. **+2 482,52 $**). Appuyez pour acceder a l'onglet **Transactions** (vue Revenus)
- **Depenses** (droite) — vos depenses totales du mois en cours (par ex. **-4 838,99 $**). Appuyez pour acceder a l'onglet **Transactions** (vue Depenses)

## Benefice net

Sous les cartes de revenus et de depenses, le widget **Benefice net** indique combien d'argent vous avez reellement economise ou perdu ce mois-ci, et suit la tendance des 6 derniers mois sous forme de graphique en courbes :

- **Benefice net du mois en cours** — affiche au-dessus du graphique en vert (positif) ou en rouge (negatif)
- **Tendance sur 6 mois** — graphique en courbes du benefice net mensuel (revenus − depenses) des 6 derniers mois
- Appuyez sur un point de donnees pour voir la valeur exacte de ce mois

> **Formule :** Benefice net = Revenus totaux − Depenses totales (tous deux convertis dans votre devise de base)

## Capital net

Le widget **Capital net** affiche votre patrimoine total sur tous vos portefeuilles de devises, converti dans votre devise de base :

- **Capital net total** — somme de tous les soldes du portefeuille convertis dans la devise des parametres, en vert (positif) ou en rouge (negatif)
- **Ventilation par devise** — le solde actuel de chaque devise est liste en dessous du total

> **Note :** Le widget Capital net n'apparait qu'apres avoir defini vos soldes initiaux de portefeuille. Consultez [Portefeuille et change](./10-wallet-and-exchange.md) pour les configurer.

## Carte Fat Finder

Sous la section des dettes, la carte **Fat Finder** affiche un resume de votre audit mensuel de depenses :

- **Economies potentielles totales** — combien vous pourriez economiser par mois
- **3 principaux constats** — liste rapide avec des points de gravite et les montants d'economies
- **Voir le rapport complet** — appuyez pour ouvrir l'ecran detaille du Fat Finder

Cette carte necessite un **abonnement Pro ou Business**. Les utilisateurs du plan gratuit voient une invitation a passer a un plan superieur.

> Voir [Fat Finder](./19-fat-finder.md) pour le guide complet de la fonctionnalite.

## Calendrier

Le widget **Calendrier** affiche une grille mensuelle avec des points colorés indiquant les jours avec des transactions :

- **Point vert** — un revenu a été enregistré ce jour-là
- **Point rouge** — une dépense a été enregistrée ce jour-là
- **Aujourd'hui** est mis en évidence par un cercle orange
- **Navigation par mois** — flèches gauche/droite pour changer de mois

Sous la grille du calendrier, un résumé s'affiche :

- **Revenus** — revenus totaux du mois sélectionné (convertis dans la devise de base)
- **Dépenses** — dépenses totales du mois sélectionné
- **Bénéfice net** — revenus moins dépenses, vert si positif, rouge si négatif

Appuyez sur **Appuyez pour voir les détails** pour ouvrir l'écran complet du Calendrier avec trois onglets :

| Onglet | Contenu |
|---|---|
| **Catégories** | Répartition des revenus et dépenses par catégories — chaque ligne affiche l'icône de la catégorie, le nom, le pourcentage et le montant. Bénéfice net en bas |
| **Comptes** | Solde actuel de chaque portefeuille de devise avec pourcentage du total |
| **Transactions** | Liste chronologique de toutes les transactions du mois. Appuyez sur un jour du calendrier pour filtrer par ce jour ; appuyez à nouveau pour annuler le filtre |

> **Conseil :** Tous les montants dans le Calendrier sont automatiquement convertis dans votre devise de base, pour des totaux précis même avec plusieurs devises.

## Soldes du Portefeuille

- Cartes horizontales defilables affichant votre solde dans chaque devise (par ex. **EUR 16 723,00**, **PLN 2 192,89**, **USD 56...**)
- Appuyez sur **Tout voir** pour acceder a la vue complete du Portefeuille avec des ventilations detaillees
- Si aucun solde n'est defini, vous verrez une invitation a ajouter votre solde initial

## Tirer pour actualiser

Tirez vers le bas n'importe ou sur le Tableau de bord pour actualiser toutes les donnees et synchroniser avec le serveur.

## FAQ

- **Q : Pourquoi le Tableau de bord affiche-t-il 0 $ partout ?**
  **R :** Vous n'avez pas encore ajoute de depenses ou de revenus. Utilisez les boutons d'actions rapides pour ajouter votre premiere transaction.

- **Q : Puis-je personnaliser ce qui apparait sur le Tableau de bord ?**
  **R :** Oui. Allez dans **Parametres → Widgets du tableau de bord** et activez ou desactivez les sections souhaitees. Vos preferences sont sauvegardees et persistent apres les redemarrages. Vous pouvez également faire glisser les widgets pour les réordonner.

---

*Voir aussi : [Depenses et revenus](./03-expenses-and-income.md) | [Portefeuille et change](./10-wallet-and-exchange.md) | [Fat Finder](./19-fat-finder.md) | [Analyses](./06-analytics.md)*
