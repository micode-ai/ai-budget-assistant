# Analyses

> Visualisez vos habitudes de depenses avec des graphiques interactifs. Filtrez par periode et devise, explorez les details en profondeur et obtenez des aperçus alimentes par l'IA pour mieux comprendre vos finances.

## Apercu

L'onglet **Analyses** offre une vue complete de vos depenses a travers des graphiques, des aperçus et l'exploration des donnees. Toutes les donnees sont basees sur vos depenses dans le compte selectionne.

![Écran Analyses avec votre histoire de dépenses et les revenus par catégorie](../img/analytics.jpg)

## Periode et filtres

En haut de l'ecran Analyses :

- **Selection de la periode** : **Semaine** | **Mois** | **Annee**
- **Filtre par devise** : **Toutes** les devises, ou selectionnez-en une specifique (USD, EUR, PLN, etc.)

Si votre compte a un **Mois financier** (par exemple, à partir du jour de paie, le 10), la vue **Mois** le suit : *octobre* couvre alors du 10 octobre au 9 novembre, et les dates exactes s'affichent sous le nom du mois. Les comparaisons avec les mois précédents et les barres mensuelles utilisent les mêmes périodes. Les vues Semaine et Année restent calendaires.

La periode selectionnee affecte tous les graphiques et aperçus ci-dessous.

## Cartes de synthese

- **Total depense** — vos depenses totales pour la periode selectionnee
  - **vs. periode precedente** — "plus/moins que la semaine/le mois/l'annee derniere" avec pourcentage
  - **vs. moy. 3 mois** — p.ex. "18% au-dessus de la moy. 3 mois" (vert = en dessous, rouge = au-dessus), affiche des qu'il y a au moins 1 mois complet d'historique
- **Moy. par jour** — moyenne des depenses quotidiennes

Tant que la période est en cours, les deux comparaisons portent sur les mêmes jours : le 5, vos cinq premiers jours sont comparés aux cinq premiers jours de la période précédente (et des trois derniers mois), si bien qu'un mois entamé ne ressemble jamais à une grosse économie. **Moy. par jour** ne compte que les jours écoulés. La ligne de la moyenne sur 3 mois apparaît dans la vue Mois.

## Revenus vs dépenses

Affiche ce que vous avez **gagné**, **dépensé** et **épargné** sur la période choisie, ainsi que la part de vos revenus que vous avez gardée (taux d'épargne). Si vous avez dépensé plus que vous n'avez gagné, le dernier chiffre indique **Dépassement**. En dessous, des barres comparent revenus et dépenses mois par mois : les 6 derniers mois en vue Mois, tous les mois de l'année en vue Année.

## Fixes vs variables

Indique quelle part de vos dépenses est **fixe** — de l'argent qui part chaque période quoi qu'il arrive — et liste les plus grosses dépenses fixes. Une dépense compte comme fixe si elle est récurrente ou si elle correspond à l'un de vos abonnements actifs du gestionnaire d'abonnements (même nom, ou même catégorie et même montant). Tout le reste est variable. Pour qu'un loyer ou un autre paiement régulier compte comme fixe, marquez-le comme récurrent ou ajoutez-le comme abonnement. Les prélèvements que le gestionnaire d'abonnements enregistre automatiquement à chaque renouvellement comptent toujours comme fixes, même si vous les renommez ou résiliez l'abonnement.

## 30 prochains jours

Affiché lorsque vous consultez la période en cours. C'est une estimation de votre solde pour chacun des 30 prochains jours : le solde d'aujourd'hui, plus les revenus qui arrivent chaque mois, moins les renouvellements d'abonnements et les dépenses récurrentes à leur date, moins une journée type de dépenses courantes. Si le solde devait passer sous zéro, la carte indique à partir de quel jour, et les barres sous la ligne le montrent. **À venir** liste les prochains paiements et revenus. Les versements vers les objectifs d'épargne ne sont pas déduits et les revenus non mensuels ne sont pas comptés : c'est un repère, pas une promesse. Les achats prévus et les dettes à rembourser avec une échéance sont aussi déduits à leur date (ceux en retard, aujourd'hui) ; l'argent que d'autres vous doivent n'est pas compté.

## Carousel d'aperçus IA

Un carousel horizontal defilable d'aperçus generes par l'IA (plan Pro requis) :

- **Anomalies de depenses** — depenses inhabituelles detectees (par ex. "78 % de plus que d'habitude en Transport")
- **Previsions budgetaires** — quand votre budget devrait etre epuise
- **Opportunites d'economies** — suggestions pour reduire les depenses
- **Comparaisons de categories** — comment vos depenses se comparent entre les categories
- **Changements de tendance** — evolutions significatives dans les habitudes de depenses

Chaque carte d'apercu a un niveau de gravite : critique (rouge), avertissement (jaune) ou information (bleu).

> **Note :** Les utilisateurs du plan Gratuit voient une invitation a la mise a niveau : "Passez au plan Pro pour les aperçus IA."

## Graphiques

### Revenus par categorie (Graphique en anneau)

- Affiche vos revenus ventiles par categorie pour la periode selectionnee
- Apparait uniquement si vous avez des entrees de revenus avec categories (ex. Salaire, Freelance, Dividendes, Loyer)
- Code couleur dans une palette vert/bleu-vert pour se distinguer des graphiques de depenses
- Les revenus sans categorie sont regroupes sous « Autres »
- Apparait au-dessus du graphique de tendance des depenses
- Les catégories de revenus fonctionnent de la même façon : les catégories principales affichent le total de leurs sous-catégories, et un appui ouvre le détail.

### Tendance des depenses (Graphique en barres)

- Affiche les depenses quotidiennes ou mensuelles sur la periode selectionnee
- Interactif : appuyez sur une barre pour explorer en detail ce segment temporel

### Depenses par categorie (Graphique en anneau)

- Repartition par categorie avec pourcentages
- Code couleur par categorie
- Appuyez sur le segment d'une catégorie principale (marquée ›) pour afficher ses sous-catégories ; un segment sans sous-catégories est seulement mis en surbrillance
- **Les sous-catégories sont cumulées** — le graphique n'affiche que les catégories principales, et le montant d'une catégorie principale inclut ses sous-catégories. Les catégories principales ayant des sous-catégories sont marquées ›. Appuyez sur l'une d'elles (le segment ou sa ligne) pour redessiner le graphique de cette catégorie : ses sous-catégories, plus « <Principale> (sans sous-catégorie) » pour les dépenses enregistrées sur la catégorie principale elle-même. Appuyez sur le fil d'Ariane « Toutes les catégories › <Principale> » pour revenir. Le détail se réinitialise chaque fois que les données d'analyse sont recalculées : une transaction nouvelle ou modifiée, une synchronisation, un changement de langue, ou un changement de période, de compte ou de devise. Les dépenses d'une sous-catégorie supprimée restent un segment distinct de premier niveau, car l'application ne conserve pas les catégories supprimées sur l'appareil. Les pastilles « vs moyenne » d'une catégorie principale utilisent le montant cumulé. Cela fonctionne aussi sur les cartes d'analyse de la version web de bureau.

### Budget vs Reel (Graphique en barres groupees)

- Comparaison cote a cote des limites de budget et des depenses reelles
- Affiche **En bonne voie** ou **Budget depasse** par categorie
- N'apparait que si vous avez des budgets actifs

### Depenses par jour de la semaine (Graphique par jour)

- Analyse des habitudes montrant quels jours vous depensez le plus
- Apercu : "Vous depensez le plus le samedi"

### Par marchands

- Principaux marchands ou vous avez depense dans la periode selectionnee
- Affiche jusqu'a 8 marchands individuels ; le reste est groupe sous "Autres"
- Apparait uniquement quand au moins une depense a un marchand renseigne
- Les noms qui ne diffèrent que par les majuscules ou les espaces (*Lidl*, *LIDL*) comptent comme un seul commerçant ; sous chaque nom, vous voyez combien d'achats vous y avez faits et le panier moyen

Si le même magasin apparaît sous plusieurs noms, ouvrez **Paramètres → Marchands** pour les réorganiser : appuyez sur **Sélectionner**, cochez les variantes et **Fusionner** en un seul nom. L'application suggère également des groupes probables (par exemple plusieurs entrées *Biedronka*) que vous pouvez fusionner en un seul appui — afin qu'ils comptent comme un seul marchand dans ces graphiques.

### Par membre

- Qui a saisi quelle part des dépenses sur la période choisie.
- N'apparaît que sur les comptes partagés avec au moins deux membres ayant des dépenses.

### Par etiquettes / Par projets

- **Repartition par etiquettes** — depenses groupees par vos etiquettes personnalisees
- **Comparaison par projets** — depenses groupees par projets
- Aide a suivre les depenses thematiques (par ex. toutes les depenses #cafe ou les couts du projet "Vacances")

## Exploration detaillee

Appuyez sur n'importe quel element de graphique pour explorer plus en profondeur :

1. Vue **Annee** — appuyez sur une barre de mois pour zoomer sur ce mois
2. Vue **Mois** — appuyez sur une semaine pour zoomer sur cette semaine
3. Vue **Semaine** — appuyez sur un jour pour voir les transactions quotidiennes
4. Vue **Jour** — voir les transactions individuelles

Utilisez le bouton **Retour** pour remonter dans les niveaux.

## Aperçus rapides

Sous les graphiques, vous trouverez des aperçus rapides sous forme de texte :

- **Categorie principale** — votre categorie de depenses la plus elevee sur cette periode
- **Jour de depense maximal** — le jour avec le plus de depenses
- **Conseil de budget quotidien** — depense quotidienne recommandee pour rester dans les limites
- **Economies sur les recus** — montant total economise grace aux remises. Appuyez pour voir quels magasins vous ont donne les plus grosses remises et de quels recus elles proviennent.
- **Consignes payees** — montant total des consignes sur emballages consignes releve sur les recus scannes. Appuyez pour la meme repartition par magasin/recu. C'est ce que vous avez paye en caisse, pas un remboursement ; les bouteilles et canettes rendues ne sont pas suivies.

Ces deux lignes n'apparaissent que si une remise ou une consigne a ete enregistree sur la periode, et seulement si votre compte n'est pas entierement chiffre (sinon l'application ne peut pas lire les montants pour les detailler).

## Articles de recus les plus frequents

Un tableau affichant vos articles de recus les plus frequemment achetes :
- Nom de l'article
- Total depense
- Nombre d'achats

## Exporter

Appuyez sur **Exporter le rapport** pour acceder a l'ecran Export et rapports. Vous pouvez y generer des rapports PDF, Excel ou CSV, consulter votre resume mensuel et gerer les sauvegardes de donnees. Consultez le guide [Export et rapports](./16-export-reports.md) pour plus de details.

## Coûts des enfants

Voyez ce que coûte chaque enfant, sans deviner.

- **Ajouter des enfants :** Réglages > Données de référence > Enfants. Seuls le prénom et la couleur sont enregistrés. Archivez un enfant plutôt que de le supprimer ; ses dépenses restent attribuées.
- **Attribuer une dépense entière :** sur une dépense nouvelle ou existante, choisissez un ou plusieurs enfants. Avec plusieurs, le montant est partagé à parts égales sauf si vous modifiez les parts. Une dépense utilise l'attribution entière ou celle par lignes du ticket, pas les deux ; l'app demande avant de changer.
- **Attribuer des lignes de ticket :** après avoir scanné un ticket, affectez des lignes (couches, fournitures scolaires) à un enfant. L'app retient votre choix et le propose la fois suivante. Une suggestion n'est jamais appliquée sans vous. « Extraire les articles » conserve l'attribution des produits encore présents sur le ticket et indique combien n'ont pu être reportés.
- **En masse :** sélectionnez plusieurs dépenses et choisissez Attribuer à un enfant. Les dépenses avec attribution par lignes sont ignorées et leur nombre est affiché.
- **Totaux :** l'écran de l'enfant (et une carte dans l'onglet Analyses) affiche ce mois-ci, cette année et la répartition par catégories dans votre devise d'affichage. Un total marqué ≈ contient une approximation faute de taux de change ; ces montants sont exclus plutôt que devinés. Les dépenses planifiées et les créances de notes partagées ne comptent pas.
- **800+ et couverture :** quand un revenu ressemble à l'allocation 800+ (par ex. « 800+ » ou « rodzina 800 » dans la description), l'app propose de le rattacher à un enfant. La couverture est l'allocation reçue divisée par ce que l'enfant a coûté sur la même période.
- **Carte à partager :** une image des totaux d'un enfant. Son prénom est masqué par défaut ; vous pouvez l'afficher.
- **Relevé PDF (Pro, éditeurs) :** un récapitulatif des coûts d'un enfant sur 24 mois maximum, avec totaux, détail mensuel et par catégorie, liste des dépenses et tickets. Chaque page porte un pied de page indiquant qu'il a été établi dans l'app à partir de données saisies par l'utilisateur, ainsi que l'heure « données au ». C'est un récapitulatif de vos propres enregistrements, pas un document juridique, ni certifié. Il ne contient que ce qui a atteint le serveur ; l'app synchronise d'abord et vous demande d'attendre si quelque chose est en attente. Indisponible sur les comptes à chiffrement de bout en bout.
- **Parents séparés :** gardez les enfants sur un compte personnel pour que l'autre parent ne voie pas vos autres dépenses. Un compte partagé montre tout à tous les membres.

## FAQ

- **Q : Pourquoi ne vois-je aucun graphique ?**
  **R :** Les graphiques apparaissent une fois que vous avez des donnees de depenses. Ajoutez d'abord quelques depenses, puis consultez les Analyses.

- **Q : Comment les aperçus IA sont-ils generes ?**
  **R :** Les aperçus sont generes en analysant vos habitudes de depenses, en comparant avec les donnees historiques et en identifiant les anomalies. Cela necessite un abonnement Pro ou Business.

---

*Voir aussi : [Budgets](./05-budgets.md) | [Histoire des depenses](./08-spending-story.md) | [Export et rapports](./16-export-reports.md)*
