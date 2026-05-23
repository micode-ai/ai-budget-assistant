# Importer des transactions depuis votre banque

> Importez des transactions directement depuis les exports CSV des principales banques polonaises ou de n'importe quelle banque grâce au mappeur de colonnes universel.

## Banques prises en charge

Vous pouvez importer des transactions directement depuis les exports CSV des principales banques polonaises : **mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA**. Pour toute autre banque, le mappeur de colonnes universel vous permet de décrire le format manuellement.

## Comment importer

1. Accédez à **Paramètres → Importer des transactions**
2. Sélectionnez votre banque dans la liste (ou « Autre (CSV personnalisé) » pour les banques non prises en charge)
3. Sélectionnez le fichier CSV exporté depuis votre banque en ligne
4. L'application affiche un aperçu avec chaque ligne identifiée comme dépense, revenu ou échange de devises
5. Décochez les lignes indésirables, puis appuyez sur **Importer**

L'application mémorise les lignes déjà importées par date, montant et description — envoyer le même CSV deux fois ne créera pas de doublons.

## Où trouver le CSV dans votre banque

- **mBank** : Banque en ligne → Historia operacji → Eksport → CSV
- **PKO BP** : iPKO → Lista operacji → Pobierz → CSV
- **ING Bank Śląski** : Moje ING → Historia → Eksportuj → CSV
- **Bank Millennium** : Web → Historia rachunku → Eksport → CSV
- **Pekao SA** : Pekao24 → Historia → Eksport → CSV

## Ce qui est importé

Chaque ligne devient soit une Dépense, soit un Revenu, soit un Échange de devises (lorsque l'application détecte une transaction FX couplée à la même date dans des devises différentes). Les catégories sont suggérées automatiquement pour les marchands populaires (Biedronka, Żabka, Orlen, Lidl, etc.) — vous pourrez les modifier ultérieurement.

## « Autre » — mappeur CSV universel

Si votre banque ne figure pas dans la liste, choisissez « Autre (CSV personnalisé) ». L'application affiche un aperçu de votre fichier et vous demande d'indiquer quelle colonne contient la date, le montant et la description. Vous pouvez enregistrer ce mappage avec un nom : le prochain CSV avec la même structure de colonnes sera importé automatiquement.

## Encodage

L'application détecte automatiquement l'UTF-8 et le Windows-1250 (l'encodage le plus courant des banques polonaises). Si l'aperçu affiche des caractères polonais illisibles, sélectionnez manuellement l'encodage dans le mappeur.

---

*Voir aussi : [Import Wise](./26-wise-import.md) | [Dépenses et revenus](./03-expenses-and-income.md) | [Paramètres](./11-settings.md)*
