# Dettes et Prets

> Suivez l'argent que vous pretez et empruntez. Voyez qui vous doit et a qui vous devez, enregistrez les remboursements et surveillez les echeances — le tout integre a vos depenses et revenus.

## Apercu

La fonctionnalite «Dettes et Prets» vous permet de suivre deux types d'obligations financieres :

- **Argent prete** — argent que vous avez donne a quelqu'un (enregistre comme depense avec indicateur de dette)
- **Argent emprunte** — argent que quelqu'un vous a donne (enregistre comme revenu avec indicateur de dette)

Les remboursements fonctionnent de la meme maniere :
- Quand quelqu'un vous **rembourse** — c'est enregistre comme revenu lie a la depense de dette originale
- Quand **vous remboursez** — c'est enregistre comme depense liee au revenu de dette original

Le statut de la dette est calcule automatiquement :
- **Active** — il reste un solde impaye
- **Payee** — la dette a ete entierement remboursee
- **En retard** — la date d'echeance est passee et le solde est toujours impaye

## Creer une dette

Le moyen le plus rapide d'ajouter une dette est depuis l'ecran **Dettes et Prets** :

1. Ouvrez l'ecran **Dettes et Prets** (depuis le widget du Tableau de bord ou les Parametres)
2. Appuyez sur le bouton **+** dans le coin inferieur droit
3. Choisissez **Preter de l'argent** ou **Emprunter de l'argent**
4. Remplissez le montant, la description, le nom du contact et la date d'echeance optionnelle
5. Appuyez sur **Enregistrer**

Vous pouvez egalement creer des dettes manuellement depuis les formulaires de depenses ou de revenus (voir ci-dessous).

## Preter de l'argent

### Etape par etape

1. Allez dans **Transactions** et appuyez sur le bouton **+**
2. Selectionnez **Saisie manuelle**
3. Entrez le **montant** que vous pretez
4. Entrez une **description** (ex. «Pret a Jean»)
5. Activez l'interrupteur **J'ai prete de l'argent**
6. Entrez le **nom du contact** — a qui vous pretez
7. Optionnellement, definissez une **date d'echeance** — quand vous attendez le remboursement
8. Appuyez sur **Enregistrer la depense**

La depense sera marquee comme dette et apparaitra dans l'ecran Dettes et Prets.

> **Note :** Le montant affecte votre solde comme une depense reguliere (argent sortant).

## Emprunter de l'argent

### Etape par etape

1. Allez dans **Transactions**, basculez vers l'onglet **Revenus** et appuyez sur **+**
2. Entrez le **montant** que vous empruntez
3. Entrez une **description** (ex. «Emprunt aupres de Marie»)
4. Activez l'interrupteur **J'ai emprunte de l'argent**
5. Entrez le **nom du contact** — a qui vous empruntez
6. Optionnellement, definissez une **date d'echeance** — quand vous devez rembourser
7. Appuyez sur **Enregistrer le revenu**

Le revenu sera marque comme dette et apparaitra dans l'ecran Dettes et Prets.

> **Note :** Le montant affecte votre solde comme un revenu regulier (argent entrant).

## Enregistrer un remboursement

### Quand quelqu'un vous rembourse (pour l'argent prete)

1. Ouvrez la **depense** originale (le pret que vous avez accorde)
2. Appuyez sur **Enregistrer un remboursement**
3. Vous serez redirige vers un formulaire de nouveau revenu pre-rempli avec le nom du contact et la devise
4. Entrez le **montant du remboursement** (peut etre partiel)
5. Appuyez sur **Enregistrer le revenu**

### Quand vous remboursez (pour l'argent emprunte)

1. Ouvrez le **revenu** original (le pret que vous avez recu)
2. Appuyez sur **Enregistrer un remboursement**
3. Vous serez redirige vers un formulaire de nouvelle depense pre-rempli avec le nom du contact et la devise
4. Entrez le **montant du remboursement** (peut etre partiel)
5. Appuyez sur **Enregistrer la depense**

> **Astuce :** Vous pouvez enregistrer plusieurs remboursements partiels. Le solde restant se met a jour automatiquement.

## Ecran Dettes et Prets

Accedez a l'ecran Dettes et Prets depuis **Parametres > Dettes et Prets** ou en appuyant sur le widget de dettes sur le Tableau de bord.

### Cartes de resume

En haut de l'ecran, deux cartes affichent :
- **On vous doit** — montant total restant que les autres vous doivent (vert)
- **Vous devez** — montant total restant que vous devez (rouge)

Les montants sont automatiquement convertis dans votre devise de base aux taux de change actuels.

### Onglets

Basculez entre deux vues :
- **Argent prete** — dettes ou vous avez prete de l'argent a d'autres
- **Argent emprunte** — dettes ou vous avez emprunte de l'argent

### Filtres

Filtrez les dettes par statut :
- **Toutes** — afficher toutes les dettes
- **Actives** — uniquement les dettes avec solde impaye
- **En retard** — uniquement les dettes en retard
- **Payees** — uniquement les dettes entierement remboursees

### Carte de dette

Chaque dette affiche :
- **Nom du contact** — avec qui la dette est liee
- **Description** — la raison de la dette
- **Badge de statut** — Active (bleu), En retard (rouge) ou Payee (vert)
- **Montant original** — le montant initial de la dette dans la devise d'origine
- **Montant restant** — combien reste a payer
- **Barre de progression** — indicateur visuel de la progression du remboursement (pourcentage)
- **Date d'echeance** — quand la dette est due (si definie)

Appuyez sur une carte de dette pour voir les details complets de la depense ou du revenu et enregistrer des remboursements.

## Notifications push

Si une dette a une date d'échéance, l'application envoie des notifications push automatiques :

- **3 jours avant l'échéance** — rappel : « Dette dans 3 jours : Jean »
- **Le lendemain de l'échéance** — alerte de retard : « Dette en retard : Jean »

Les notifications sont envoyées au propriétaire de la dette (celui qui l'a enregistrée), pas à la contrepartie.

Pour activer ou désactiver les rappels, rendez-vous dans **Paramètres → Notifications → Rappels de dettes**.

## Widget sur le tableau de bord

Le widget Dettes et Prets est toujours visible sur le Tableau de bord (lorsqu'il est active dans les parametres de widgets) :

- **Quand vous avez des dettes :** affiche les totaux «On vous doit» et «Vous devez», ainsi qu'un bouton **+** pour naviguer rapidement vers l'ecran Dettes et Prets
- **Quand vous n'avez pas de dettes :** affiche un etat vide avec un bouton **Ajouter une dette** pour commencer

Appuyez sur le widget pour aller directement a l'ecran Dettes et Prets.

## Support multi-devises

Les dettes peuvent etre dans n'importe quelle devise supportee. Les totaux sur le Tableau de bord et l'ecran Dettes sont automatiquement convertis dans votre devise de base aux taux de change en temps reel. Les cartes individuelles affichent toujours les montants dans la devise d'origine.

## Questions frequentes

- **Q : Puis-je preter de l'argent dans une devise et recevoir le remboursement dans une autre ?**
  **R :** Les remboursements sont enregistres dans la meme devise que la dette originale pour assurer un suivi precis.

- **Q : Preter de l'argent affecte-t-il mon budget ?**
  **R :** Oui, preter est enregistre comme depense et emprunter comme revenu. Ils affectent votre solde et le suivi budgetaire comme toute autre transaction.

- **Q : Puis-je modifier une dette apres l'avoir creee ?**
  **R :** Oui, appuyez sur la dette pour voir ses details, puis utilisez le bouton Modifier. Vous pouvez changer la description, le nom du contact et la date d'echeance.

- **Q : Que se passe-t-il quand une dette est entierement remboursee ?**
  **R :** Le statut passe automatiquement a «Payee» et la barre de progression affiche 100%. La dette reste dans votre historique pour reference.

- **Q : Comment supprimer une dette ?**
  **R :** Ouvrez les details de la dette et appuyez sur Supprimer. Notez que cela supprime egalement l'entree de depense ou de revenu associee.

---

*Voir aussi : [Depenses et revenus](./03-expenses-and-income.md) | [Portefeuille et change](./10-wallet-and-exchange.md)*
