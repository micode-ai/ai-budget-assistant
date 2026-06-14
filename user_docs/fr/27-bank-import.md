# Importer des transactions depuis votre banque

> Importez des transactions depuis un relevé CSV ou PDF de votre banque. Compatible avec mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise et toute autre banque via le mappeur universel de colonnes.

## Banques prises en charge

- **mBank** — export CSV
- **PKO BP** — export CSV
- **Erste Bank** — relevé PDF
- **Alior Bank** — relevé PDF
- **Revolut** — export CSV
- **Wise** — export CSV (multi-devises, conversions FX détectées automatiquement)
- **Autre** — toute banque, via le mappeur universel de colonnes (CSV)

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

## Historique des imports et Annuler

La section **Imports précédents** affiche les 20 derniers imports. Touchez la **flèche d'annulation** (↩) pour annuler un import. Toutes les transactions de ce lot seront supprimées.

- Annulation disponible pendant **30 jours** après l'import.

## Votre banque n'est pas là ?

En bas de **Paramètres → Importer des transactions** se trouve une carte **« Votre banque n'est pas là ? »**. Touchez-la, entrez le nom de la banque et joignez un exemple de relevé.

---

*Voir aussi : [Dépenses et revenus](./03-expenses-and-income.md) | [Portefeuille et change](./10-wallet-and-exchange.md) | [Paramètres](./11-settings.md)*
