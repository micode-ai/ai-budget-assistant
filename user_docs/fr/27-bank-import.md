# Importer des transactions depuis votre banque

> Importez des transactions depuis un relevé CSV, XLSX ou PDF de votre banque. Compatible avec mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise et toute autre banque via le mappeur universel de colonnes.

## Banques prises en charge

- **mBank** — export CSV
- **PKO BP** — export CSV
- **Erste Bank** — relevé PDF
- **Alior Bank** — relevé PDF
- **Revolut** — export CSV
- **Wise** — export CSV (multi-devises, conversions FX détectées automatiquement)
- **Autre** — toute banque, via le mappeur universel de colonnes (CSV)
- **Tableurs** — les relevés XLSX fonctionnent aussi ; l'app lit la première feuille

## Comment importer

1. Allez dans **Paramètres → Importer des transactions**
2. Choisissez votre banque dans la liste (ou **Autre (CSV)** si elle n'est pas listée)
3. Sélectionnez le fichier exporté depuis votre banque
4. L'application affiche un aperçu — chaque ligne est marquée comme dépense, revenu ou échange de devises
5. Décochez les lignes indésirables et touchez **Importer**

L'application ignore les lignes déjà présentes dans le compte, en correspondant par date, montant et devise.

## Où trouver l'export dans votre banque

- **Revolut** : application Revolut → Statements → choisir la période → CSV → Télécharger
- **Wise** : wise.com → Transactions → Statements and Reports → choisir la période → CSV → choisir la devise/solde → Télécharger

> **Conseil Wise :** Wise génère un CSV par solde de devise. Importez chaque devise séparément. Jusqu'à 469 jours par export.

## Wise — conversions de devises et frais

Lors d'une conversion de devises dans Wise (ex. 100 USD → EUR), deux lignes sont créées. L'application détecte automatiquement ces paires et crée un seul enregistrement d'**Échange de devises** (Portefeuille → Échanges).

Les frais Wise de la colonne `Total fees` sont automatiquement intégrés dans le montant de la dépense.

## Ce qui est importé

Chaque ligne devient une Dépense, un Revenu ou un Échange de devises. Les catégories sont suggérées automatiquement pour les commerçants populaires. Chaque ligne a un ID unique — réimporter le même fichier est sûr.

**Des noms de marchands plus lisibles.** Les grandes enseignes connues sont reconnues automatiquement : une ligne de relevé comme `BIEDRONKA 1234 WARSZAWA` est enregistrée simplement sous **Biedronka**. Un même magasin apparaît ainsi comme un seul marchand dans vos analyses, plutôt que sous des dizaines d'entrées distinctes.

## « Autre » — mappeur universel

Si votre banque n'est pas dans la liste, choisissez **Autre (CSV)**. L'application affiche un aperçu du fichier et vous demande d'indiquer quelle colonne contient la date, le montant et la description. Enregistrez ce mappage pour une utilisation future.

## Quand rien ne reconnaît votre relevé

Si aucune des banques ci-dessus ne correspond et que le fichier n'a pas une disposition de colonnes simple que l'application peut deviner seule, elle peut demander à un modèle d'IA de déterminer les colonnes à votre place — laquelle est la date, laquelle est le montant, etc.

**Avant tout envoi, on vous demande une seule fois.** La première fois que cela se produit pour un compte, un écran vous explique ce qui quitte votre appareil : pour un CSV ou un tableur, seulement la ligne d'en-tête plus jusqu'à 10 lignes d'exemple — jamais le fichier entier. Pour un relevé PDF, ce sont les 20 premières lignes de texte extrait. Vous décidez une fois par compte ; ensuite, l'application se souvient de votre choix.

- **Acceptez**, et le fichier est relu avec les colonnes déterminées par le modèle.
- **Refusez**, et vous passez directement au mappeur manuel décrit ci-dessus. Le refus intervient avant toute analyse, il n'y a donc encore rien à pré-remplir — vous associez les colonnes comme pour toute autre banque non prise en charge.

**Le résultat est affiché, pas supposé.** Quand la correspondance par IA réussit, l'aperçu affiche une rangée de puces au-dessus de vos transactions — quelque chose comme `Date → Data operacji`, `Montant → Kwota` — avec son estimation de la banque concernée. C'est une estimation, pas une certitude : touchez la rangée à tout moment pour ouvrir le mappeur et corriger une colonne mal identifiée.

**Quelques éléments sont signalés pour vérification, jamais supposés silencieusement :**
- Si le fichier n'a aucune colonne de devise, chaque ligne est lue dans la devise de votre propre compte, et une notification vous le signale — touchez-la pour changer la devise avant l'import ; le changement s'applique à tout le fichier.
- Lire des nombres dans un PDF est plus difficile à vérifier que dans un CSV, donc l'application essaie de confirmer que ce qu'elle a trouvé correspond au solde de clôture du relevé. Quand elle ne peut pas le confirmer, vous verrez une notification vous demandant de vérifier la liste. Ce n'est pas une erreur — c'est simplement le cas normal lorsqu'un relevé n'imprime pas de solde courant auquel se comparer, ou lorsque la vérification ne correspond pas.

**Les relevés PDF nécessitent un forfait Pro.** Lire un PDF avec l'IA demande plus de traitement qu'un CSV, c'est donc une fonctionnalité Pro — un compte gratuit y voit un écran de mise à niveau plutôt qu'un message d'échec.

Les banques déjà listées ci-dessus (mBank, PKO BP, Erste, Alior, Revolut, Wise) ne sont pas concernées par tout ceci — elles s'importent exactement comme décrit plus haut sur cette page.

## Historique des imports et Annuler

La section **Imports précédents** affiche les 20 derniers imports. Touchez la **flèche d'annulation** (↩) pour annuler un import. Toutes les transactions de ce lot seront supprimées.

- Annulation disponible pendant **30 jours** après l'import.

## Votre banque n'est pas là ?

En bas de **Paramètres → Importer des transactions** se trouve une carte **« Votre banque n'est pas là ? »**. Touchez-la, entrez le nom de la banque et joignez un exemple de relevé.

---

*Voir aussi : [Dépenses et revenus](./03-expenses-and-income.md) | [Portefeuille et change](./10-wallet-and-exchange.md) | [Paramètres](./11-settings.md)*
