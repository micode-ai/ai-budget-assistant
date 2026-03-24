# Comptes

> Organisez vos finances avec des comptes separes. Utilisez Personnel pour le suivi individuel, Partage pour les budgets familiaux et Professionnel pour les depenses d'entreprise. Invitez des membres avec un controle d'acces base sur les roles.

## Apercu

L'application prend en charge plusieurs comptes pour separer les differents contextes financiers. Chaque compte dispose de ses propres depenses, revenus, budgets et portefeuille.

## Types de comptes

![Liste des comptes](../img/accounts.jpg)

| Type | Icone | Utilisation |
|---|---|---|
| **Personnel** | Icone de personne | Suivi des depenses individuelles |
| **Partage** | Icone de personnes | Budgets familiaux ou de groupe (par ex. "Famille") |
| **Professionnel** | Icone de mallette | Depenses d'entreprise ou d'equipe (par ex. "MiCode") |
| **Investissement** | Icone de tendance haussiere | Suivre les portefeuilles d'investissement et les actifs |

Chaque compte affiche son type et votre role (Proprietaire, Editeur ou Observateur).

## Changer de compte

![Menu deroulant Changer de compte](../img/switch-account.jpg)

1. Appuyez sur le **nom du compte** dans le coin superieur gauche de n'importe quel ecran (par ex. "Famille")
2. Le menu deroulant **Changer de compte** s'ouvre et affiche tous vos comptes
3. Appuyez sur le compte vers lequel vous souhaitez basculer
4. Le compte actif est marque d'une coche verte
5. Tous les ecrans se mettent a jour pour afficher les donnees du compte selectionne

Appuyez sur **Gerer les comptes** en bas du menu deroulant pour acceder a la liste complete des comptes.

## Creer un compte

1. Accedez a la liste des comptes (via **Gerer les comptes** ou depuis les Parametres)
2. Appuyez sur **Creer un compte**
3. Entrez un **Nom de compte** (par ex. "Mon Budget")
4. Selectionnez le **Type de compte** : Personnel, Partage, Professionnel ou Investissement
5. Selectionnez la **Devise** pour ce compte
6. Appuyez sur **Creer**

> **Note :** Le plan Gratuit autorise 3 comptes, le plan Pro jusqu'a 5, et le plan Business un nombre illimite.

## Rejoindre un compte

Si quelqu'un vous a invite a rejoindre son compte :

1. Appuyez sur **Rejoindre un compte** dans la liste des comptes
2. Entrez le **code d'invitation** que vous avez recu
3. Appuyez sur **Rejoindre**
4. Vous verrez un message de confirmation : "Vous avez rejoint le compte avec succes !"
5. Le compte apparait desormais dans votre liste de comptes

## Parametres du compte

![Parametres du compte](../img/account-settings.jpg)

Appuyez sur n'importe quel compte pour ouvrir ses parametres :

### Details
- **Nom** du compte (modifiable par le Proprietaire)
- **Type** et **devise** du compte (affichage uniquement)

### Membres
- Liste de tous les membres du compte avec leurs roles
- Chaque membre affiche : avatar, nom et badge de role (Proprietaire, Editeur, Observateur)

### Inviter des membres

1. Ouvrez les Parametres du compte concerne
2. Appuyez sur l'**icone d'invitation** (icone personne+ en haut a droite de la section Membres)
3. Choisissez la methode d'invitation :
   - **Par e-mail** — entrez l'adresse e-mail de la personne, selectionnez son role (Editeur ou Observateur), appuyez sur **Envoyer l'invitation**
   - **Par lien** — un code est genere que vous pouvez partager. Appuyez pour copier ou partager via des applications de messagerie

### Gerer les membres (Proprietaire uniquement)

- **Changer le role** — appuyez sur l'icone de changement de role a cote d'un membre pour attribuer un nouveau role
- **Supprimer un membre** — appuyez sur l'icone de suppression pour retirer un membre (avec confirmation)

### Invitations en attente

- Consultez les invitations qui n'ont pas encore ete acceptees
- **Annuler l'invitation** — revoquer une invitation en attente

## Roles et permissions

| Permission | Proprietaire | Editeur | Observateur |
|---|---|---|---|
| Voir les depenses et revenus | Oui | Oui | Oui |
| Ajouter/modifier des depenses | Oui | Oui | Non |
| Ajouter/modifier des revenus | Oui | Oui | Non |
| Creer/modifier des budgets | Oui | Oui | Non |
| Gerer les membres | Oui | Non | Non |
| Modifier les parametres du compte | Oui | Non | Non |
| Supprimer le compte | Oui | Non | Non |

### Description des roles
- **Proprietaire** — controle total sur le compte, peut gerer les membres et les parametres
- **Editeur** — peut ajouter et modifier les depenses, revenus et budgets
- **Observateur** — peut uniquement consulter les donnees (acces en lecture seule)

## Supprimer un compte

1. Ouvrez les Parametres du compte
2. Faites defiler vers le bas et appuyez sur **Supprimer le compte**
3. Confirmez la suppression

> **Attention :** La suppression d'un compte efface definitivement toutes ses donnees (depenses, revenus, budgets). Cette action est irreversible.

## Quitter un compte

Si vous etes membre (pas le Proprietaire) d'un compte partage :
1. Ouvrez les Parametres du compte
2. Appuyez sur **Quitter le compte**
3. Confirmez — vous serez retire du compte

## Changement de compte dans Telegram

Lors de l'utilisation du bot Telegram, vous pouvez changer de compte de deux manieres :

1. **Manuellement** — envoyez `/account` et appuyez sur le compte souhaite
2. **Automatiquement** — mentionnez un nom de compte dans votre message (ex., "Montre les depenses dans Family"), et l'IA interrogera ce compte pour la requete en cours

La detection automatique ne change pas votre compte par defaut — elle ne s'applique qu'au message en cours. Utilisez `/account` pour changer definitivement.

## FAQ

- **Q : Combien de comptes puis-je avoir ?**
  **R :** Gratuit : 3 comptes, Pro : jusqu'a 5, Business : illimite.

- **Q : Puis-je transferer la propriete d'un compte ?**
  **R :** Actuellement, le createur du compte est toujours le Proprietaire. Contactez le support pour les transferts de propriete.

- **Q : Puis-je voir qui a ajoute une depense dans un compte partage ?**
  **R :** Les depenses dans les comptes partages indiquent quel membre les a creees.

- **Q : Puis-je utiliser differents comptes dans le bot Telegram ?**
  **R :** Oui. Envoyez `/account` pour changer votre compte par defaut, ou mentionnez simplement le nom du compte dans votre message pour des requetes ponctuelles. Voir [Bot Telegram](./22-telegram-bot.md) pour les details.

---

*Voir aussi : [Parametres](./11-settings.md) | [Abonnement](./12-subscription.md)*
