# Bot WhatsApp

> Gérez vos finances directement depuis WhatsApp. Discutez avec l'IA, ajoutez des dépenses par commande, scannez des reçus et envoyez des messages vocaux — sans ouvrir l'app.

## Aperçu

Le **Bot WhatsApp** vous permet d'utiliser AI Budget Assistant depuis WhatsApp. Liez votre compte une fois et suivez vos dépenses, posez des questions financières et gérez vos budgets — depuis votre messagerie.

Le bot fonctionne comme le [Bot Telegram](./22-telegram-bot.md) : même IA, mêmes commandes, même support multi-comptes.

## Lier votre compte

1. Ouvrez l'app et allez dans **Paramètres**
2. Appuyez sur **Bot WhatsApp** sous Intégrations
3. Appuyez sur **Connecter WhatsApp** — un code à 6 caractères et un QR code apparaissent (valide 10 minutes)
4. Ensuite :
   - Appuyez sur **Ouvrir WhatsApp** — WhatsApp s'ouvre avec le message `link VOTRE_CODE` pré-rempli.
   - Ou scannez le QR avec un autre téléphone.
   - Ou copiez le code et envoyez `link VOTRE_CODE` manuellement au numéro WhatsApp du bot.
5. Confirmation : « Compte lié avec succès ! »

> **Note :** Un numéro WhatsApp se lie à un seul compte. Une nouvelle liaison remplace la précédente.

## Commandes du bot

Les commandes fonctionnent avec ou sans `/` — `expense 50 déjeuner` et `/expense 50 déjeuner` sont équivalents.

| Commande | Description |
|---|---|
| `link CODE` | Lier WhatsApp |
| `expense MONTANT DESC` | Ajouter une dépense |
| `income MONTANT DESC` | Ajouter un revenu |
| `category [TYPE] NOM` | Créer une catégorie |
| `categories` | Lister/supprimer catégories |
| `usage` | Utilisation IA et limites |
| `account` | Changer de compte |
| `newchat` | Nouvelle conversation IA |
| `unlink` | Dissocier WhatsApp |
| `help` | Afficher les commandes |

## Chat IA dans WhatsApp

Envoyez n'importe quel message — l'IA le traitera.

**Exemples :**
- « Sur quoi ai-je le plus dépensé ce mois-ci ? »
- « Montre mes dépenses de la semaine dernière »

## Messages vocaux

Enregistrez un message vocal dans WhatsApp et envoyez-le au bot. Coût : 2 requêtes IA.

## Scan de reçus

1. Photographiez un reçu et envoyez-le au bot
2. Le bot le scanne par OCR et affiche un résumé
3. Si la date est fausse, appuyez sur **Changer la date** et envoyez `JJ.MM.AAAA`
4. Appuyez sur **Ajouter dépense** ou **Annuler**

## Changer de compte

Envoyez `account` — le bot affiche vos comptes en liste.

## Devises supportées

| Symbole | Devise |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

## FAQ

- **Q : Sans liaison ?** **R :** Non, liez votre WhatsApp avec un code de l'app.
- **Q : En groupes ?** **R :** Non, seulement 1:1.
- **Q : WhatsApp et Telegram en même temps ?** **R :** Oui, liaisons indépendantes.
- **Q : Les messages comptent contre la limite IA ?** **R :** Oui. Chat : 1, vocal/reçus : 2.
- **Q : Quelle langue ?** **R :** Celle configurée dans l'app.

---

*Voir aussi : [Chat IA](./07-ai-chat.md) | [Bot Telegram](./22-telegram-bot.md) | [Paramètres](./11-settings.md)*
