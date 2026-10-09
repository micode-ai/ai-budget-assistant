# Chatbots — Telegram, WhatsApp et Slack

> Gérez vos finances directement depuis Telegram, WhatsApp ou Slack. Chattez avec l'IA, ajoutez des dépenses, scannez des reçus et envoyez des messages vocaux — sans ouvrir l'application.

## Aperçu

Connectez votre compte à **Telegram**, **WhatsApp**, **Slack** ou toute combinaison simultanément. Les trois bots offrent des fonctionnalités identiques — utilisez la messagerie que vous préférez.

Pour connecter : **Paramètres → Chatbots**.

## Lier votre compte

### Telegram
1. Appuyez sur **Connecter Telegram** — un code à 6 caractères apparaît (valide 10 minutes)
2. Ouvrez Telegram et trouvez le bot
3. Envoyez `/link VOTRE_CODE` (ex. `/link A3F2B1`)
4. Vous verrez « Compte lié avec succès ! »

### WhatsApp
1. Appuyez sur **Connecter WhatsApp** — un code et un QR code apparaissent
2. Appuyez sur **Ouvrir WhatsApp** (le message est pré-rempli) ou scannez le QR code
3. Envoyez `link VOTRE_CODE` au bot
4. Vous verrez « Compte lié avec succès ! »

### Slack
1. Appuyez sur **Connecter Slack** — un code à 6 caractères apparaît (valide 10 minutes)
2. Ouvrez Slack, trouvez l'application **AI Budget Assistant** et ouvrez un message direct avec elle
3. Envoyez `link VOTRE_CODE` (ex. `link A3F2B1`)
4. Vous verrez « Compte lié avec succès ! »

> Telegram, WhatsApp et Slack peuvent tous être connectés simultanément au même compte.

## Ce que vous pouvez faire

- **Ajouter des dépenses et revenus** : écrivez naturellement ou utilisez des commandes
- **Chat IA** : posez n'importe quelle question financière — même IA que dans l'application
- **Messages vocaux** : dictez votre dépense ou question (2 requêtes IA par message)
- **Photos de reçus** : envoyez une photo pour la scanner automatiquement (2 requêtes IA)
- **Vérifier l'utilisation IA** : `/usage`
- **Changer de compte** : `/account`

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/link CODE` | Lier la messagerie à l'application |
| `/expense 50 déjeuner` | Ajouter une dépense |
| `/group 120 pizza` | Ajouter une dépense à un groupe partagé |
| `/income 3000 salaire` | Ajouter un revenu |
| `/usage` | Voir l'utilisation IA |
| `/account` | Changer de compte actif |
| `/newchat` | Démarrer une nouvelle conversation IA |
| `/unlink` | Déconnecter le bot |
| `/help` | Afficher toutes les commandes |

> Sur **WhatsApp** et **Slack**, les commandes fonctionnent avec ou sans `/`. Vous pouvez aussi simplement taper un montant et une description : `50 déjeuner`.

## Ajouter une dépense à un groupe partagé

Envoyez `/group 120 pizza` pour ajouter une dépense à l'un de vos groupes partagés (dans WhatsApp et Slack, `group 120 pizza` fonctionne aussi). Si vous faites partie de plusieurs groupes, le bot vous demande lequel : choisissez-le dans la liste. Vérifiez ensuite la carte — groupe, montant, description, *payé par vous*, *à parts égales* — et appuyez sur **Confirmer**, ou sur **Annuler** pour ne rien ajouter. C'est toujours vous qui payez et la dépense est toujours partagée à parts égales entre tous les membres ; pour un autre payeur ou une autre répartition, ajoutez-la dans l'appli. Pour une autre devise, indiquez-la après le montant (`/group 25 EUR taxi`) : la dépense est convertie dans la devise du groupe au taux du jour, et si aucun taux n'est disponible, le bot vous le dit et n'ajoute rien. Les groupes archivés ne sont pas proposés, et cela ne consomme pas de requêtes IA.

## Scan de reçus

1. Photographiez un reçu et envoyez-le au bot
2. Le bot extrait le montant, la date et le commerçant
3. Si la date est incorrecte — envoyez la bonne au format `JJ.MM.AAAA`
4. Confirmez ou annulez

### Corriger les lignes scannées

L'OCR lit parfois mal un prix, invente une ligne ou en oublie une. Appuyez sur **✏️ Lignes** (sur WhatsApp : **✏️ Modifier → Lignes**) et envoyez une correction par message :

| Message | Effet |
|---|---|
| `3 = 14,69` | fixe le prix de la ligne 3 |
| `3: Pain de seigle` | renomme la ligne 3 |
| `3 -` | supprime la ligne 3 |
| `+ Pain 5,99` | ajoute une ligne |
| `= 233,98` | corrige le total du ticket |

`14,69` et `14.69` fonctionnent tous les deux. Après chaque correction, le bot renvoie la liste numérotée et une ligne `Lignes : … · total du ticket : …` — si les deux ne concordent pas, quelque chose est encore mal lu. La répartition par catégories est recalculée à partir des lignes corrigées : corrigez donc aussi le total quand vous changez un prix.

Quand vous avez fini, appuyez sur **Ajouter la dépense** : rien n'est enregistré avant, et annuler abandonne toutes les corrections. Seules les lignes et le total sont corrigeables ici ; pour changer la catégorie d'une ligne, ouvrez la dépense dans l'application.

## Coût des requêtes IA

| Action | Requêtes IA |
|---|---|
| Message texte / chat IA | 1 |
| Message vocal | 2 |
| Photo de reçu | 2 |

## FAQ

**Q : Puis-je connecter Telegram, WhatsApp et Slack ?**
Oui — ce sont des liens indépendants et ils fonctionnent tous simultanément.

---

*Voir aussi : [Chat IA](./07-ai-chat.md) | [Comptes](./09-accounts.md) | [Paramètres](./11-settings.md)*
