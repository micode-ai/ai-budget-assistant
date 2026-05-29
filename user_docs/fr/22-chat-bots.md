# Chatbots — Telegram et WhatsApp

> Gérez vos finances directement depuis Telegram ou WhatsApp. Chattez avec l'IA, ajoutez des dépenses, scannez des reçus et envoyez des messages vocaux — sans ouvrir l'application.

## Aperçu

Connectez votre compte à **Telegram**, **WhatsApp** ou aux deux simultanément. Les deux bots offrent des fonctionnalités identiques — utilisez la messagerie que vous préférez.

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

> Telegram et WhatsApp peuvent être connectés simultanément au même compte.

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
| `/income 3000 salaire` | Ajouter un revenu |
| `/usage` | Voir l'utilisation IA |
| `/account` | Changer de compte actif |
| `/newchat` | Démarrer une nouvelle conversation IA |
| `/unlink` | Déconnecter le bot |
| `/help` | Afficher toutes les commandes |

> Sur **WhatsApp**, les commandes fonctionnent avec ou sans `/`.

## Scan de reçus

1. Photographiez un reçu et envoyez-le au bot
2. Le bot extrait le montant, la date et le commerçant
3. Si la date est incorrecte — envoyez la bonne au format `JJ.MM.AAAA`
4. Confirmez ou annulez

## Coût des requêtes IA

| Action | Requêtes IA |
|---|---|
| Message texte / chat IA | 1 |
| Message vocal | 2 |
| Photo de reçu | 2 |

---

*Voir aussi : [Chat IA](./07-ai-chat.md) | [Comptes](./09-accounts.md) | [Paramètres](./11-settings.md)*
