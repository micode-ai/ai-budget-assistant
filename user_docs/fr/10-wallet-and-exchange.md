# Portefeuille et change

> Suivez vos soldes dans plusieurs devises et effectuez des changes avec des taux en temps reel. Le portefeuille se met a jour automatiquement lorsque vous ajoutez des depenses et des revenus.

## Apercu

La fonctionnalite Portefeuille vous permet de suivre vos soldes reels dans chaque devise prise en charge. A mesure que vous ajoutez des depenses et des revenus, le portefeuille se met a jour automatiquement pour refleter votre situation financiere actuelle.

## Soldes du Portefeuille

Accedez au Portefeuille depuis :
- **Tableau de bord** — appuyez sur **Tout voir** a cote de la section Soldes du Portefeuille
- **Parametres** — allez dans Portefeuille > **Soldes**

Pour chaque devise, vous verrez :

| Champ | Description |
|---|---|
| **Solde actuel** | Votre solde en temps reel dans cette devise |
| **Solde initial** | Le solde de depart que vous avez defini |
| **Total depense** | Somme de toutes les depenses dans cette devise |
| **Total des revenus** | Somme de tous les revenus dans cette devise |
| **Change entrant** | Montant recu lors de changes de devises |
| **Change sortant** | Montant depense lors de changes de devises |
| **Transfert entrant** | Montant recu lors de transferts depuis d'autres comptes |
| **Transfert sortant** | Montant envoye lors de transferts vers d'autres comptes |

La formule : **Solde actuel = Solde initial + Total des revenus - Total depense + Change entrant - Change sortant + Transfert entrant - Transfert sortant**

## Definir le solde initial

Definissez votre solde de depart pour chaque devise :

1. Allez dans **Parametres** > **Portefeuille** > **Definir le solde**
2. Selectionnez la **Devise** (USD, EUR, PLN, GBP, UAH ou RUB)
3. Entrez le **Montant** — votre solde reel actuel dans cette devise
4. Appuyez sur **Enregistrer**

Vous verrez une confirmation : "Solde defini avec succes."

> **Astuce :** Definissez vos soldes initiaux des le debut de votre utilisation de l'application, afin que le portefeuille reflete fidelement vos finances des le premier jour.

## Solde total

Lorsque vous possedez des soldes dans plusieurs devises, l'application calcule un **solde total** converti dans la devise definie dans vos parametres. Le taux de change utilise pour la conversion est le taux en temps reel recupere automatiquement. Cela vous donne une vue d'ensemble de votre patrimoine dans une seule devise de reference.

## Change de devises

![Ecran de change de devises](../img/exchange.jpg)

Echangez de l'argent entre vos portefeuilles de devises :

### Etape par etape

1. Appuyez sur **Change** dans les actions rapides du Tableau de bord, ou allez dans **Parametres** > **Portefeuille**
2. Selectionnez la devise **De** (par ex. USD) — appuyez sur une pastille de devise pour selectionner
3. Selectionnez la devise **Vers** (par ex. EUR) — appuyez sur une pastille de devise pour selectionner
4. Entrez le montant dans le champ "De" ou "Vers" — l'autre se calcule automatiquement
5. Le **Taux de change** est recupere automatiquement (par ex. "1 USD = 0,8407 EUR")
6. Vous pouvez appuyer sur le bouton **inverser** (fleches au centre) pour inverser les devises
7. Vous pouvez eventuellement modifier le taux de change manuellement si vous avez obtenu un taux different
8. Ajoutez des **Notes** optionnelles (par ex. "Change a l'aeroport" ou "Virement bancaire")
9. Appuyez sur **Change** pour finaliser

### Fonctionnalites

- **Taux de change en temps reel** — recuperes et affiches automatiquement
- **Bouton d'inversion** — inversez rapidement les devises De et Vers
- **Modification manuelle du taux** — modifiez le taux si votre taux reel differe
- **Champ de notes** — ajoutez du contexte au change
- **Changes recents** — consultez votre historique de changes

### Changes recents

Sous le formulaire de change, vous trouverez la liste de vos changes recents avec :
- Devises echangees (De vers Vers)
- Montants
- Taux de change utilise
- Date
- Notes (si ajoutees)

## Transferts entre comptes

Transferez de l'argent entre vos differents comptes (par ex. de Entreprise a Personnel) :

### Etape par etape

1. Allez dans **Parametres** > **Portefeuille** > **Transfert**
2. Selectionnez le **Compte source** — le compte d'ou l'argent sera debite
3. Selectionnez le **Compte destination** — le compte qui recevra l'argent
4. Selectionnez la **Devise** du transfert
5. Entrez le **Montant** a transferer
6. Si les comptes utilisent des devises differentes, un **Taux de change** sera propose automatiquement — vous pouvez le modifier manuellement
7. Ajoutez des **Notes** optionnelles (par ex. "Remboursement frais pro" ou "Epargne mensuelle")
8. Appuyez sur **Transferer** pour finaliser

### Transferts recents

Sous le formulaire de transfert, vous trouverez la liste de vos transferts recents avec :
- Compte source et compte destination
- Devise et montant
- Taux de change utilise (si devises differentes)
- Date
- Notes (si ajoutees)

## Devises prises en charge

| Code | Devise |
|---|---|
| USD | Dollar americain |
| EUR | Euro |
| PLN | Zloty polonais |
| GBP | Livre sterling |
| UAH | Hryvnia ukrainienne |
| RUB | Rouble russe |

## FAQ

- **Q : D'ou proviennent les taux de change ?**
  **R :** Les taux de change sont recuperes aupres d'un service en ligne et mis a jour regulierement. Ils representent des taux de marche approximatifs.

- **Q : Puis-je effectuer un change si je n'ai pas assez de solde ?**
  **R :** L'application vous avertira d'un solde insuffisant, mais vous pouvez quand meme enregistrer le change pour garder vos comptes a jour.

- **Q : Un change de devises compte-t-il comme une depense ?**
  **R :** Non. Les changes de devises sont separes des depenses — ils deplacent de l'argent entre les portefeuilles de devises sans affecter vos totaux de depenses.

- **Q : Quelle est la difference entre un transfert et un change ?**
  **R :** Un change convertit de l'argent d'une devise a une autre au sein d'un meme compte. Un transfert deplace de l'argent entre deux comptes differents (par ex. de Entreprise a Personnel), sans necessairement changer de devise.

- **Q : Un transfert affecte-t-il le solde du portefeuille ?**
  **R :** Oui. Le compte source voit son solde diminue du montant envoye (Transfert sortant), et le compte destination voit son solde augmente du montant recu (Transfert entrant). Le solde total tous comptes confondus reste inchange si la devise est la meme.

---

*Voir aussi : [Tableau de bord](./02-dashboard.md) | [Parametres](./11-settings.md)*
