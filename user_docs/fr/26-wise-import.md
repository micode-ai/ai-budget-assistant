# Import Wise

> Importez tout l'historique de vos transactions Wise en une seule fois. Téléchargez un relevé CSV et l'application créera automatiquement les dépenses, revenus et conversions de devises correspondants.

## Présentation

Si vous utilisez Wise, **Import Wise** vous permet de charger un relevé entier dans votre compte en une seule étape. Plus besoin de saisir les transactions une à une — téléchargez simplement un CSV depuis Wise, donnez-le à l'application, et vérifiez ce qui sera créé avant de confirmer.

L'import couvre trois types d'enregistrements :

- **Dépenses** — argent sorti de votre solde Wise (débits)
- **Revenus** — argent entrant (crédits)
- **Conversions de devises** — lorsque vous avez échangé entre soldes au sein de Wise (p. ex. USD → EUR)

Chaque transaction importée est étiquetée afin que l'application sache qu'elle provient de Wise — si vous téléchargez deux fois le même relevé, les doublons sont détectés et ignorés automatiquement.

## Étape 1 — Exporter un CSV depuis Wise

1. Ouvrez Wise (application web sur **wise.com** ou l'application mobile Wise).
2. Allez dans **Transactions → Statements and Reports**.
3. Choisissez la **période** (jusqu'à 469 jours par fichier).
4. Choisissez **CSV** comme format et sélectionnez la devise / le solde voulu.
5. Téléchargez le fichier sur votre téléphone.

> **Astuce :** Wise produit un CSV par devise. Si vous souhaitez importer plusieurs devises, répétez l'export pour chacune et importez-les les unes après les autres.

## Étape 2 — Importer dans l'application

1. Ouvrez l'application et allez dans **Paramètres → Import Wise**.
2. Appuyez sur **Choisir un fichier CSV** et sélectionnez le fichier que vous venez de télécharger.
3. L'application analyse le fichier (généralement en moins d'une seconde) et affiche un aperçu.

## Étape 3 — Vérifier et confirmer

L'aperçu liste chaque transaction du CSV avec une case à cocher.

- Les **dépenses** sont affichées avec une icône rouge vers le bas, les **revenus** avec une icône verte vers le haut et les **conversions de devises** avec une icône d'échange et les deux côtés de l'opération (p. ex. `120.00 USD → 109.50 EUR`).
- Une petite **catégorie suggérée** apparaît à côté des marchands courants (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix, etc.). Si une catégorie du même nom existe déjà dans le compte actif, elle est associée automatiquement.
- Les lignes déjà importées lors d'un précédent envoi sont **grisées et marquées « Déjà importé »** — vous ne pouvez plus les sélectionner, ce qui vous protège des doublons.
- Décochez ce que vous ne voulez pas importer (p. ex. les virements entre vos propres comptes).

Lorsque la sélection vous convient, appuyez sur **Importer N lignes**. L'application écrit tout dans une seule transaction — soit toutes les lignes sélectionnées sont créées, soit aucune ne l'est.

## Ce qui est enregistré

| Champ | D'où il provient |
|---|---|
| Date | Colonne `Date` |
| Montant | `Amount` (absolu) + `Total fees` inclus |
| Devise | Colonne `Currency` |
| Description | `Description`, à défaut `Merchant` ou `Payment Reference` |
| Catégorie | Suggérée à partir du marchand si reconnu ; sinon aucune |
| Source | Marquée `import` pour filtrer dans les analyses |

## Conversions de devises

Lorsqu'un même virement Wise touche deux devises (p. ex. vous convertissez 100 USD en euros), Wise émet deux lignes — un débit en USD et un crédit en EUR. L'application reconnaît ces paires grâce à leur `Payment Reference` commune et crée une seule **Conversion de devise** au lieu de deux transactions séparées. La conversion apparaît dans **Portefeuille → Conversions** avec le bon taux de change.

## Réimport

Renvoyer le même CSV est sans risque. Chaque ligne porte son `TransferWise ID` de Wise, et l'application refuse de créer un second enregistrement pour un identifiant déjà importé. Concrètement :

- Vous pouvez réexporter une plage plus large et la téléverser — seules les nouvelles lignes sont créées.
- Vous pouvez interrompre un aperçu et recommencer plus tard — les lignes déjà confirmées sont conservées.

## FAQ

- **Q : Cela fonctionne-t-il avec d'autres banques ?**
  **R :** Pour l'instant, seuls les exports CSV de Wise sont pris en charge. D'autres banques utilisent des colonnes différentes. Ouvrez une demande de fonctionnalité si vous voulez qu'une autre banque soit ajoutée.

- **Q : Puis-je importer un relevé PDF ou XLSX ?**
  **R :** Pas encore. Exportez les relevés Wise au format CSV.

- **Q : Le fichier est-il stocké quelque part dont je doive me préoccuper ?**
  **R :** Le CSV est envoyé au serveur AI Budget Assistant, analysé en mémoire et supprimé dès que l'aperçu est généré. Seules les lignes structurées que vous confirmez sont enregistrées — pas le fichier original.

- **Q : Que deviennent les frais facturés par Wise ?**
  **R :** Wise indique les frais dans une colonne `Total fees` dédiée. L'application les ajoute à la même dépense pour que le total corresponde à ce qui a réellement quitté votre solde.

- **Q : J'ai importé les mauvaises lignes — puis-je annuler ?**
  **R :** Oui. Les lignes importées sont des dépenses/revenus normaux — ouvrez chacune et supprimez-la comme n'importe quelle autre transaction. Une fois supprimée, vous pouvez réimporter la même ligne plus tard.

- **Q : Mon CSV n'a pas d'en-tête / a un autre format. Que faire ?**
  **R :** Vérifiez que vous avez bien exporté depuis **Transactions → Statements and Reports → CSV**. L'ancien format « Activity Export » est différent et n'est pas pris en charge.

- **Q : Mes catégories Wise sont-elles reprises ?**
  **R :** La catégorisation Wise est partiellement utilisée pour suggérer une catégorie aux marchands courants. L'application ne crée pas de nouvelles catégories automatiquement — en l'absence de correspondance, la ligne est importée sans catégorie, et vous pouvez la classer plus tard.

---

*Voir aussi : [Dépenses et revenus](./03-expenses-and-income.md) | [Portefeuille et change](./10-wallet-and-exchange.md) | [Comptes](./09-accounts.md) | [Paramètres](./11-settings.md)*
