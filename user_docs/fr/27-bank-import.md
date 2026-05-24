# Importer des transactions depuis votre banque

> Importez des transactions depuis un fichier CSV ou un relevé PDF de votre banque, ou depuis n'importe quelle banque grâce au mappeur de colonnes universel.

## Banques prises en charge

- **mBank** — export CSV
- **PKO BP** — export CSV
- **Erste Bank** — relevé PDF
- **Alior Bank** — relevé PDF
- **Wise** — export CSV (voir [Import Wise](./26-wise-import.md))
- **Other** — n'importe quelle banque, via le mappeur de colonnes universel (CSV)

De nouvelles banques sont ajoutées régulièrement. Si la vôtre n'est pas encore dans la liste, utilisez **Other** et mappez les colonnes manuellement.

## Comment importer

1. Accédez à **Paramètres → Importer des transactions**
2. Sélectionnez votre banque dans la liste (ou **Other (custom CSV)** si elle n'y figure pas)
3. Sélectionnez le fichier exporté depuis votre banque — un **CSV** pour mBank/PKO, un relevé **PDF** pour Erste/Alior
4. L'application affiche un aperçu avec chaque ligne identifiée comme dépense, revenu ou échange de devises
5. Décochez les lignes indésirables, puis appuyez sur **Importer**

L'application ignore les lignes qui existent déjà dans votre compte — qu'elles aient été importées précédemment ou saisies manuellement — en les comparant par date, montant et devise, ce qui évite toute duplication lors de l'import. Les lignes correspondantes sont décochées par défaut ; recochez-en une s'il s'agit réellement d'une transaction distincte.

## Où trouver le fichier dans votre banque

- **mBank** : Banque en ligne → Historia operacji → Eksport → CSV
- **PKO BP** : iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank** : bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank** : Alior Online → Wyciągi → pobierz wyciąg (PDF)

## Ce qui est importé

Chaque ligne devient soit une Dépense, soit un Revenu, soit un Échange de devises (lorsque l'application détecte une transaction FX couplée à la même date dans des devises différentes). Les catégories sont suggérées automatiquement pour les marchands populaires (Biedronka, Żabka, Orlen, Lidl, Rossmann, etc.) — vous pourrez les modifier ultérieurement.

## « Other » — mappeur CSV universel

Si votre banque ne figure pas dans la liste, choisissez **Other (custom CSV)**. L'application affiche un aperçu de votre fichier et vous demande d'indiquer quelle colonne contient la date, le montant et la description. Vous pouvez enregistrer ce mappage avec un nom : le prochain CSV avec la même structure de colonnes sera importé automatiquement.

## Encodage

Pour les fichiers CSV, l'application détecte automatiquement l'UTF-8 et le Windows-1250 (l'encodage le plus courant des banques polonaises). Si l'aperçu affiche des caractères polonais illisibles, sélectionnez manuellement l'encodage dans le mappeur. Les relevés PDF sont lus directement — aucun choix d'encodage n'est nécessaire.

---

*Voir aussi : [Import Wise](./26-wise-import.md) | [Dépenses et revenus](./03-expenses-and-income.md) | [Paramètres](./11-settings.md)*
