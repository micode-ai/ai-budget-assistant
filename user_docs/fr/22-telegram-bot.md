# Bot Telegram

> Gerez vos finances directement depuis Telegram. Discutez avec l'IA, ajoutez des depenses par commande, scannez des recus et utilisez les messages vocaux — le tout sans ouvrir l'application.

## Apercu

Le **Bot Telegram** vous permet d'interagir avec votre Assistant Budget IA directement depuis Telegram. Associez votre compte une fois, et vous pourrez suivre vos depenses, poser des questions financieres et gerer vos budgets — directement depuis votre messagerie.

## Associer votre compte

1. Ouvrez l'application et allez dans **Parametres**
2. Appuyez sur **Bot Telegram** dans la section Integrations
3. Appuyez sur **Generer un code** — un code a 6 caracteres apparait (valide pendant 10 minutes)
4. Ouvrez Telegram et trouvez le bot
5. Envoyez `/link CODE` (par exemple, `/link A3F2B1`)
6. Vous verrez une confirmation : "Compte associe avec succes !"

> **Note :** Chaque compte Telegram ne peut etre associe qu'a un seul compte de l'application. Une nouvelle association remplace la connexion precedente.

## Commandes du bot

| Commande | Description |
|---|---|
| `/start` | Message de bienvenue et instructions de configuration |
| `/link CODE` | Associer votre Telegram a l'application |
| `/expense MONTANT DESC` | Ajouter rapidement une depense (par ex., `/expense 50 dejeuner`) |
| `/income MONTANT DESC` | Ajouter rapidement un revenu (par ex., `/income 3000 salaire`) |
| `/category [TYPE] NOM` | Creer une categorie (par ex., `/category expense Alimentation`) |
| `/categories` | Lister et supprimer les categories |
| `/usage` | Voir l'utilisation AI, limites et ventilation |
| `/account` | Basculer entre vos comptes |
| `/newchat` | Demarrer une nouvelle conversation avec l'IA |
| `/unlink` | Dissocier Telegram de votre compte |
| `/help` | Afficher toutes les commandes disponibles |

## Chat IA dans Telegram

Envoyez n'importe quel message texte au bot, et il sera traite par l'assistant IA — le meme que celui disponible dans l'onglet Chat IA de l'application.

**Exemples :**
- "Quelles ont ete mes principales depenses ce mois-ci ?"
- "Montre mes depenses de la semaine derniere"
- "Ajouter depense 500₴ pour courses"
- "Quel est le statut de mon budget ?"

L'IA prend en charge toutes les fonctionnalites du chat dans l'application : commandes en langage naturel, confirmation d'actions, repartition par categories et analyse budgetaire.

## Detection automatique du compte

Si vous avez plusieurs comptes (par exemple, "Personnel" et "Famille"), l'IA detecte automatiquement lorsque vous mentionnez un nom de compte dans votre message et interroge le bon compte.

**Exemples :**
- "Montre mes depenses dans le compte Famille" — interroge le compte Famille
- "Combien ai-je depense en alimentation ?" — interroge le compte par defaut
- "Ajouter depense 100₴ pour courses au compte Famille" — cree la depense dans le compte Famille

> **Note :** Cela ne change pas definitivement votre compte par defaut. Utilisez `/account` pour le changer.

## Messages vocaux

1. Enregistrez un message vocal dans Telegram
2. Envoyez-le au bot
3. Le bot transcrit votre parole et la traite comme un message de chat IA

Les messages vocaux prennent en charge les memes commandes et questions que les messages texte.

## Scan de recus

1. Prenez une photo d'un recu
2. Envoyez la photo au bot
3. Le bot le scanne par OCR et affiche un resume
4. Si la date est incorrecte, appuyez sur **Changer la date** et envoyez la bonne date (JJ.MM.AAAA)
5. Appuyez sur **Confirmer** pour ajouter la depense, ou **Annuler** pour rejeter

Vous pouvez aussi envoyer des images de reçus comme documents (PDF ou images). Les reçus PDF sont sauvegardés et consultables dans l'app.

## Changer de compte

Si vous avez plusieurs comptes :

1. Envoyez `/account`
2. Le bot affiche tous vos comptes avec des boutons en ligne
3. Appuyez sur le compte vers lequel vous souhaitez basculer
4. Le compte actif est marque d'une coche

Toutes les commandes et requetes IA suivantes utiliseront le compte selectionne jusqu'a ce que vous changiez a nouveau.

## Support des devises

Le bot reconnait les symboles et codes de devises dans les commandes :

| Symbole | Devise |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Exemples :** `/expense 50$ dejeuner`, `/expense 100₴ courses`, `/expense 30 EUR taxi`

## FAQ

- **Q : Puis-je utiliser le bot sans association ?**
  **R :** Non, vous devez d'abord associer votre compte Telegram en utilisant un code de l'application.

- **Q : Le bot fonctionne-t-il dans les chats de groupe ?**
  **R :** Le bot est concu uniquement pour les conversations privees (1:1).

- **Q : Quel compte le bot utilise-t-il ?**
  **R :** Le bot utilise votre compte par defaut (defini lors de l'association ou via `/account`). Vous pouvez aussi mentionner un nom de compte dans votre message, et l'IA utilisera automatiquement ce compte pour la requete.

- **Q : Puis-je associer plusieurs comptes Telegram ?**
  **R :** Non, chaque utilisateur de l'application peut avoir un compte Telegram associe, et chaque compte Telegram peut etre associe a un seul utilisateur.

- **Q : Les messages du bot comptent-ils dans ma limite de requetes IA ?**
  **R :** Oui. Le chat AI coûte 1 requête par message, les messages vocaux 2 requêtes (transcription + traitement AI), les photos de reçus 2 requêtes. Utilisez `/usage` pour vérifier. À l'atteinte de la limite, le bot vous préviendra.

- **Q : Dans quelle langue le bot répond-il ?**
  **R :** Le bot répond dans la langue définie dans l'app (Paramètres > Apparence). Tous les messages système sont localisés.

---

*Voir aussi : [Chat IA](./07-ai-chat.md) | [Comptes](./09-accounts.md) | [Parametres](./11-settings.md)*
