# Applications connectées et développeurs

> Laissez une autre application que vous utilisez — votre logiciel de comptabilité, par exemple — travailler avec vos dépenses AI Budget, voyez exactement ce qu'elle a le droit de faire, et coupez-lui l'accès d'un geste. Les développeurs peuvent créer de telles applications sur l'API AI Budget.

## Ce que veut dire connecter une application

Certains produits peuvent travailler avec vos données AI Budget depuis leurs propres écrans : une application de comptabilité peut récupérer vos dépenses et vos tickets de caisse, ou ajouter des dépenses pour vous. Pour l'autoriser, vous connectez l'application à **un** de vos comptes AI Budget.

L'application ne voit jamais votre mot de passe. Quand vous cliquez sur son bouton « Connecter AI Budget », elle vous envoie vers une page AI Budget où vous vous connectez comme d'habitude, et où vous voyez :

- le nom de l'application, son site et qui l'a créée ;
- **Vérifiée par AI Budget** (une application que nous avons contrôlée, comme la nôtre) ou **Non vérifiée par AI Budget** ;
- la liste des autorisations demandées ;
- **Compte à connecter** : vous choisissez le compte que l'application pourra utiliser.

Touchez **Autoriser** pour connecter l'application, ou **Refuser** pour revenir à l'application sans rien connecter. N'autorisez que des applications de confiance.

## Ce que permet chaque autorisation

- **Voir vos dépenses : montants, dates, catégories, articles et étiquettes** — l'application peut lire les dépenses du compte connecté, y compris les articles d'un ticket et les modifications et suppressions ultérieures.
- **Ajouter, modifier et supprimer des dépenses** — l'application peut écrire dans ce compte. Les dépenses qu'elle ajoute affichent **Ajouté via** suivi du nom de l'application sur l'écran de la dépense.
- **Télécharger les photos de vos tickets de caisse** — l'application peut télécharger l'image ou le PDF du ticket joint à une dépense.
- **Voir vos catégories de dépenses** — l'application peut lire votre liste de catégories pour classer correctement les nouvelles dépenses.

Toute application connectée voit aussi le nom, le type et la devise du compte, ainsi que votre nom. Elle ne reçoit jamais votre adresse e-mail et ne voit pas vos autres comptes.

## Voir et déconnecter les applications

Ouvrez **Paramètres → Applications connectées**. Chaque application y figure avec le compte auquel elle est connectée, qui l'a connectée et quand, sa dernière utilisation et ses autorisations.

Touchez **Déconnecter** et confirmez. L'application perd immédiatement l'accès à ce compte : sa requête suivante est refusée. Les dépenses qu'elle a déjà ajoutées restent dans votre compte. Pour la réutiliser, reconnectez-la depuis l'application.

À chaque nouvelle connexion, nous envoyons un e-mail à la personne qui l'a faite. Si vous en recevez un et ne reconnaissez pas l'application, déconnectez-la tout de suite.

Si **Applications connectées** n'apparaît pas dans les Paramètres, la connexion d'applications n'est pas encore disponible.

## Comptes partagés

Seul un **propriétaire** ou un **éditeur** d'un compte peut y connecter une application ; une personne qui ne peut que consulter le compte le voit grisé.

Une application connectée à un compte partagé voit les dépenses de **tous** les membres, pas seulement celles de la personne qui l'a connectée. C'est pourquoi tous les propriétaires et éditeurs du compte voient dans **Applications connectées** chaque application qui y est connectée, avec la personne qui l'a connectée, et chacun d'eux peut la déconnecter. Quand un éditeur connecte une application, les propriétaires du compte reçoivent eux aussi l'e-mail.

Si la personne qui a connecté l'application passe ensuite en lecture seule ou quitte le compte, l'application cesse de fonctionner pour ce compte.

## Comptes chiffrés

- Un compte en **chiffrement complet** (montants compris) ne peut pas être connecté du tout : l'application ne pourrait rien y lire.
- Un compte en **chiffrement du texte** peut être connecté **en lecture seule** : l'application voit les montants, les dates et les catégories, mais les descriptions, notes, commerçants, noms d'articles, étiquettes et autres textes chiffrés restent masqués, et elle ne peut ni ajouter ni modifier de dépenses.

Le détail de chaque niveau est dans [Chiffrement de bout en bout](./15-encryption.md).

## Pour les développeurs

Vous pouvez créer votre propre application sur l'API AI Budget, gratuitement. Ouvrez **Paramètres → Développeurs** et touchez **Créer une app** : donnez-lui un nom, un site et les adresses de redirection qu'elle utilisera, puis choisissez **App serveur** ou **App mobile ou navigateur**. Vous recevez aussitôt un **Client ID** ; une app serveur reçoit en plus un client secret affiché **une seule fois** — copiez-le immédiatement.

La référence complète de l'API et un guide pas à pas (en anglais, polonais et russe) sont sur [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), accessibles aussi via **Documentation de l’API** sur l'écran Développeurs. Vous pouvez enregistrer jusqu'à 10 applications.
