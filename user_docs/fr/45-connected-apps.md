# Applications connectées et développeurs

> Laissez une autre application que vous utilisez — votre logiciel de comptabilité, par exemple — travailler avec vos dépenses AI Budget, voyez exactement ce qu'elle a le droit de faire, et coupez-lui l'accès d'un geste. Les développeurs peuvent créer de telles applications sur l'API AI Budget.

## Ce que veut dire connecter une application

Certains produits peuvent travailler avec vos données AI Budget depuis leurs propres écrans : une application de comptabilité peut récupérer vos dépenses et vos tickets de caisse, ou ajouter des dépenses pour vous. Pour l'autoriser, vous connectez l'application à **un ou plusieurs** de vos comptes AI Budget.

L'application ne voit jamais votre mot de passe. Quand vous cliquez sur son bouton « Connecter AI Budget », elle vous envoie vers une page AI Budget où vous vous connectez comme d'habitude, et où vous voyez :

- le nom de l'application, son site et qui l'a créée ;
- **Vérifiée par AI Budget** (une application que nous avons contrôlée, comme la nôtre) ou **Non vérifiée par AI Budget** ;
- la liste des autorisations demandées ;
- **Comptes à connecter** : une case par compte. Cochez chaque compte que l'application peut utiliser ; **Autoriser** reste inactif tant qu'aucun n'est coché. Si un seul compte peut être connecté, il est déjà coché. Les comptes que vous pouvez seulement consulter, ou qui utilisent le chiffrement complet, sont grisés avec la raison, et un compte au chiffrement du texte est marqué en lecture seule.

Touchez **Autoriser** pour connecter l'application, ou **Refuser** pour revenir à l'application sans rien connecter. N'autorisez que des applications de confiance.

**Reconnecter une application.** Si l'application est déjà connectée, l'écran s'ouvre avec les comptes qu'elle a déjà cochés, ainsi que tout autre compte encore connectable. Ce que vous cochez est la liste complète : cochez un nouveau compte pour l'ajouter, décochez-en un pour couper l'accès de l'application. L'accès aux comptes qui restent cochés continue sans interruption.

Quand une application a plusieurs comptes, elle nous indique à chaque requête de quel compte il s'agit ; vous n'avez rien à faire.

## Ce que permet chaque autorisation

- **Voir vos dépenses : montants, dates, catégories, articles et étiquettes** — l'application peut lire les dépenses du compte connecté, y compris les articles d'un ticket et les modifications et suppressions ultérieures.
- **Ajouter, modifier et supprimer des dépenses** — l'application peut écrire dans ce compte. Les dépenses qu'elle ajoute affichent **Ajouté via** suivi du nom de l'application sur l'écran de la dépense.
- **Télécharger les photos de vos tickets de caisse** — l'application peut télécharger l'image ou le PDF du ticket joint à une dépense.
- **Voir vos catégories de dépenses** — l'application peut lire votre liste de catégories pour classer correctement les nouvelles dépenses.
- **Voir et ajouter vos revenus** — l'application peut lire les revenus du compte connecté et, avec l'autorisation d'écriture, ajouter, modifier et supprimer des revenus. Les revenus qu'elle ajoute affichent **Ajouté via** et le nom de l'application. Un revenu créé par un virement entre vos comptes est en lecture seule.
- **Voir et gérer vos budgets** — l'application peut lire vos budgets avec l'avancement de la période en cours et, avec l'autorisation d'écriture, les créer, les modifier et les supprimer.
- **Voir les totaux de vos revenus et dépenses** — l'application peut lire des synthèses : totaux par catégorie et par mois. Elle reçoit ces totaux, pas les opérations une à une, et les montants sont convertis dans votre devise d'affichage.

Toute application connectée voit aussi le nom, le type et la devise des comptes que vous avez cochés, ainsi que votre nom. Elle ne reçoit jamais votre adresse e-mail et ne voit aucun compte que vous n'avez pas coché.

## Voir et déconnecter les applications

Ouvrez **Paramètres → Applications connectées**. Chaque application est une ligne avec les comptes auxquels elle est connectée, qui l'a connectée et quand, sa dernière utilisation et ses autorisations.

Pour couper **un seul compte**, touchez **Retirer le compte** à côté de lui et confirmez. L'application perd ce compte immédiatement (sa requête suivante pour ce compte est refusée) tandis que ses autres comptes continuent de fonctionner. Retirer le dernier compte déconnecte complètement l'application.

Pour couper toute l'application, touchez **Déconnecter** et confirmez. Elle perd l'accès à tous ses comptes d'un coup. Les dépenses qu'elle a déjà ajoutées restent dans vos comptes. Pour la réutiliser, reconnectez-la depuis l'application.

Chaque fois qu'une application est connectée ou reçoit de nouveaux comptes, nous envoyons un e-mail à la personne qui l'a fait, avec la liste des comptes ajoutés. Si vous en recevez un et ne reconnaissez pas l'application, déconnectez-la tout de suite.

Si **Applications connectées** n'apparaît pas dans les Paramètres, la connexion d'applications n'est pas encore disponible.

## Comptes partagés

Seul un **propriétaire** ou un **éditeur** d'un compte peut y connecter une application ; une personne qui ne peut que consulter le compte le voit grisé.

Une application connectée à un compte partagé voit les dépenses de **tous** les membres, pas seulement celles de la personne qui l'a connectée. C'est pourquoi tous les propriétaires et éditeurs d'un tel compte voient l'application dans **Applications connectées**, avec la personne qui l'a connectée, et peuvent la retirer de ce compte.

Vous ne voyez d'une connexion que les comptes dont vous êtes vous-même propriétaire ou éditeur, jamais les autres comptes choisis par la personne qui l'a connectée. Si vous touchez **Déconnecter**, l'application ne perd que ces comptes-là ; elle reste connectée pour la personne qui l'a mise en place, et seule cette personne peut la déconnecter complètement. Quand un éditeur connecte une application, les propriétaires des comptes connectés reçoivent aussi un e-mail, qui ne liste que leurs propres comptes.

Si la personne qui a connecté l'application passe ensuite en lecture seule ou quitte un compte, l'application cesse de fonctionner pour ce compte ; ses autres comptes ne sont pas touchés. Un compte supprimé est retiré automatiquement de l'application.

## Comptes chiffrés

- Un compte en **chiffrement complet** (montants compris) ne peut pas être connecté du tout : l'application ne pourrait rien y lire.
- Un compte en **chiffrement du texte** peut être connecté **en lecture seule** : l'application voit les montants, les dates et les catégories, mais les descriptions, notes, commerçants, noms d'articles, étiquettes et autres textes chiffrés restent masqués, et elle ne peut ni ajouter ni modifier de dépenses.

Le détail de chaque niveau est dans [Chiffrement de bout en bout](./15-encryption.md).

## Pour les développeurs

Vous pouvez créer votre propre application sur l'API AI Budget, gratuitement. Ouvrez **Paramètres → Développeurs** et touchez **Créer une app** : donnez-lui un nom, un site et les adresses de redirection qu'elle utilisera, puis choisissez **App serveur** ou **App mobile ou navigateur**. Vous recevez aussitôt un **Client ID** ; une app serveur reçoit en plus un client secret affiché **une seule fois** — copiez-le immédiatement.

La référence complète de l'API et un guide pas à pas (en anglais, polonais et russe) sont sur [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), accessibles aussi via **Documentation de l’API** sur l'écran Développeurs. Vous pouvez enregistrer jusqu'à 10 applications.
