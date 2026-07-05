# Indice d'Inflation Personnel

> Suivez comment évoluent dans le temps les prix que vous payez réellement, calculé à partir de vos tickets de caisse scannés — sans coût d'IA.

L'Indice d'Inflation Personnel montre comment les prix que vous payez réellement ont évolué dans le temps — calculé à partir de vos propres scans de tickets de caisse. Contrairement aux chiffres officiels d'inflation, il reflète votre panier d'achat réel.

## Fonctionnement

Lorsque vous scannez un ticket de caisse, l'application extrait les articles individuels (p. ex. « Mleko Łaciate », « Chleb Razowy ») et enregistre le prix payé ainsi que le nom du magasin. Au fil du temps, l'application constitue un historique des prix pour chaque produit et calcule votre inflation personnelle comme une moyenne pondérée de tous les produits suivis.

La formule pondère les produits selon vos dépenses (les articles que vous achetez souvent et à prix élevé influencent davantage l'indice), vous donnant une image fidèle de l'impact des variations de prix sur vos dépenses réelles.

## Où le trouver

L'Indice d'Inflation Personnel apparaît dans l'onglet **Analyses**, sous la section Insights IA. Il affiche :

- Un chiffre principal : **« Votre inflation : +11,4 % »** sur la période sélectionnée
- Le nombre de produits suivis
- Une liste de produits avec leurs variations de prix individuelles
- Un graphique d'historique des prix et une comparaison des magasins par produit (appuyez sur un produit)

## Sélection de la période

Appuyez sur **3M**, **6M** ou **12M** pour modifier la période de comparaison. L'application compare les prix de la première moitié de la période (la « base ») à la seconde moitié (la période « actuelle »), ainsi une période de 6 mois compare les mois 1 à 3 avec les mois 4 à 6.

L'indice affiche `null` jusqu'à ce qu'au moins 3 produits aient été achetés à la fois dans la période de base et dans la période actuelle.

## Comparaison des magasins

Appuyez sur un produit pour voir :
- Un graphique d'historique des prix dans le temps
- Un tableau affichant le dernier prix dans chaque magasin où vous avez acheté ce produit, trié du moins cher au plus cher
- Une option pour renommer le produit (voir ci-dessous)

## Gestion des noms de produits

L'application attribue automatiquement un nom court et lisible à chaque produit (p. ex. « PIWO TYSKIE 0,5L 4,7% » → « Tyskie Piwo »). Vous pouvez corriger ou personnaliser ces noms.

### Renommer un seul produit

Appuyez sur une ligne de produit dans la section inflation, puis sur l'option de renommage. Saisissez le nom souhaité et enregistrez. Cela n'affecte que l'affichage du produit — l'historique des prix sous-jacent est conservé.

### Gérer tous les produits

Allez dans **Paramètres → Données de référence → Produits** pour voir tous les produits suivis. Depuis là, vous pouvez :

- **Renommer** n'importe quel produit (appuyez sur une ligne)
- **Fusionner** plusieurs variantes d'un même produit en un seul (appui long pour sélectionner, puis appuyez sur Fusionner) — utile quand le même produit apparaît sous des noms légèrement différents
- **Réinitialiser** un nom personnalisé vers l'original (appuyez sur l'icône de réinitialisation d'une ligne renommée)

### Fusionner des produits

Si vous voyez « Mleko 3,2 % » et « Mleko Łaciate » séparément alors qu'il s'agit du même produit, sélectionnez les deux, appuyez sur Fusionner et saisissez le nom canonique souhaité. Tout l'historique des prix des deux noms sera regroupé sous ce nom unique à partir de ce moment.

## Obtenir plus de données

L'indice requiert au moins 3 produits avec des achats dans les deux périodes, base et actuelle. Si vous voyez le message « Scannez quelques tickets », continuez à scanner des tickets au fil du temps — l'indice apparaîtra automatiquement dès que suffisamment de données seront disponibles.

Seuls les tickets scannés avec l'appareil photo (OCR) contribuent à l'indice. Les dépenses saisies manuellement et les imports bancaires n'incluent pas les articles individuels.

## Confidentialité

Tout l'historique des prix est stocké dans votre compte sur le serveur. Il n'est pas partagé entre comptes et n'est pas utilisé pour construire un catalogue de produits commun. Si vous supprimez votre compte, tout l'historique des prix est supprimé avec lui.
