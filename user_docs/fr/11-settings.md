# Parametres

> Personnalisez votre profil, l'apparence, les notifications et la synchronisation des donnees. Changez votre langue, devise, theme et gerez les preferences de votre compte.

## Apercu

Accedez aux Parametres en appuyant sur l'**icone d'engrenage** dans le coin superieur droit de n'importe quel ecran.

Les parametres sont organises en categories. Appuyez sur une categorie pour ouvrir son ecran dedie :

| Categorie | Contenu |
|---|---|
| **Profil et compte** | Nom, e-mail, fuseau horaire, devise |
| **Gerer le plan** | Plan actuel, utilisation, options de mise a niveau |
| **Apparence et langue** | Theme, langue |
| **Preferences IA** | Style de reponse, selection du modele |
| **Widgets du tableau de bord** | Afficher ou masquer les widgets de l'ecran d'accueil |
| **Notifications et integrations** | Notifications push, bot Telegram |
| **Securite et chiffrement** | Configuration du chiffrement de bout en bout |
| **Portefeuille** | Soldes, dettes, solde initial |
| **Donnees et rapports** | Synchronisation, rapports par e-mail, sauvegarde et restauration |
| **A propos** | Version, aide, support, mentions legales |

## Profil et compte

![Parametres — Section Profil](../img/settings-0.jpg)

- **Avatar** — affiche vos initiales sur un fond colore
- **Nom** — votre nom d'affichage. Appuyez sur l'icone de crayon pour modifier
- **E-mail** — l'e-mail de votre compte (affichage uniquement)
- **Fuseau horaire** — appuyez sur l'icone de crayon pour changer. Un selecteur avec recherche apparait avec plus de 90 fuseaux horaires (par ex. "Europe/Paris")

### Devise

Selectionnez votre devise par defaut en appuyant sur l'une des pastilles de devise :

**USD** | **EUR** | **PLN** | **GBP** | **UAH** | **RUB** | **BYN**

La devise selectionnee est mise en surbrillance. Cela definit la devise par defaut pour les nouvelles depenses, revenus et l'affichage du Tableau de bord.

## Apparence et langue

### Langue

Choisissez parmi 8 langues prises en charge :

| Code | Langue |
|---|---|
| EN | English |
| RU | Pyccкий |
| UA | Yкpaїнcькa |
| PL | Polski |
| ES | Espanol |
| FR | Francais |
| DE | Deutsch |
| BY | Беларуская |

Appuyez sur une pastille de langue pour changer. L'interface se met a jour immediatement.

### Apparence

Choisissez votre theme :

- **Systeme** — suit le mode clair/sombre de votre appareil
- **Clair** — toujours utiliser le theme clair
- **Sombre** — toujours utiliser le theme sombre

## Preferences IA

### Style de reponse de l'IA

Controlez la maniere dont l'IA communique avec vous dans toutes les fonctionnalites IA (Chat, Histoires, Analyses, Fat Finder, Objectifs) :

| Mode | Description |
|---|---|
| **Simple** | Langage courant, sans jargon — ideal pour les debutants |
| **Equilibre** | Melange de simple et de technique — le mode par defaut |
| **Expert** | Terminologie financiere, analyse detaillee — pour les professionnels |

Appuyez sur une pastille pour changer. La modification s'applique immediatement a tout nouveau contenu genere par l'IA.

> Voir [Mode de reponse de l'IA](./20-ai-response-mode.md) pour en savoir plus sur ce que chaque mode modifie.

### Modele d'IA

Choisissez le modele d'IA pour toutes les fonctionnalites IA (Chat, Scan de recu, Categorisation, Analyses, Histoires, Objectifs). Cela affecte directement la **qualite des reponses** et la **consommation du quota IA** :

| Modele | Vitesse | Cout | Ideal pour |
|---|---|---|---|
| ⚡ **Fast** | Le plus rapide | ×0.75 quota | Categorisation rapide, requetes simples |
| ⚖️ **Balanced** | Moyen | ×1 quota | Usage general — par defaut |
| ✨ **Quality** | Plus lent | ×1.5 quota | Analyses complexes, aperçus detailles |

> **Conseil :** Avec le plan Free (50 requetes IA/mois), passer en **Fast** donne ~66.7 requetes effectives. Passer en **Quality** donne ~33.3.

Appuyez sur une pastille pour changer. Le modele prend effet immediatement pour toutes les nouvelles requetes IA.

## Widgets du tableau de bord

Controlez quelles sections apparaissent sur votre [Tableau de bord](./02-dashboard.md). Appuyez sur le bouton bascule a cote de chaque widget pour l'afficher ou le masquer :

| Widget | Description |
|---|---|
| **Gamification** | Niveau, barre de progression XP et serie quotidienne |
| **Budget mensuel** | Budget restant avec barre de progression codee par couleur |
| **Revenus et depenses** | Carte combinee avec revenus et depenses mensuels |
| **Dettes et prets** | Recapitulatif de ce qu'on vous doit et de vos dettes |
| **Graphique benefice net** | Graphique lineaire sur 6 mois du benefice net |
| **Capital net** | Valeur nette totale sur tous les portefeuilles |
| **Fat Finder (IA)** | Audit mensuel des depenses avec opportunites d'economies |
| **Calendrier** | Grille mensuelle avec points revenus/depenses |
| **Objectifs** | Objectif d'epargne principal avec barre de progression |
| **Soldes du portefeuille** | Defilement horizontal des soldes par devise |

> **Conseil :** Vos preferences sont sauvegardees automatiquement et persistent entre les redemarrages.

Vous pouvez également **faire glisser la poignée** à côté d'un widget pour le réordonner sur le Tableau de bord, et appuyer sur **Rétablir l'ordre par défaut** pour restaurer la disposition d'origine.

## Notifications et integrations

![Parametres — Section Notifications](../img/settings.jpg)

### Notifications

Interrupteurs a bascule pour les preferences de notifications :

| Parametre | Description |
|---|---|
| **Notifications Push** | Interrupteur principal — activer ou desactiver toutes les notifications push |
| **Alertes Budget** | Etre averti lorsque vous atteignez les seuils de budget |
| **Activite Compte Partage** | Etre averti lorsque d'autres personnes ajoutent des depenses aux comptes partages |
| **Rappels de dettes** | Notification 3 jours avant l'échéance et en cas de retard |

### Bot Telegram

Liez votre compte Telegram pour recevoir des notifications et gerer vos depenses via le bot Telegram. Voir [Bot Telegram](./22-telegram-bot.md) pour plus de details.

## Securite et chiffrement

Configurez le chiffrement de bout en bout (E2EE) pour proteger vos donnees financieres. Voir [Chiffrement](./15-encryption.md) pour plus de details.

## Categories

Acces via **Parametres → Données de référence → Categories**.

Visualisez et gerez toutes vos categories de depenses et de revenus en un seul endroit.

- **Toutes les categories listees** — les categories de depenses et de revenus sont affichees ensemble
- **Supprimer une categorie** — faites glisser vers la gauche sur une categorie ou appuyez sur l'icone de suppression
- **La suppression est bloquee** si la categorie a des depenses, des revenus ou des budgets associes — vous devez d'abord reassigner ou supprimer ces enregistrements
- **Les categories systeme** peuvent egalement etre supprimees si elles n'ont aucun enregistrement associe

> **Note :** La suppression d'une categorie est definitive et ne peut pas etre annulee.

## Donnees et rapports

### Donnees et synchronisation

- **Derniere synchronisation** — indique quand vos donnees ont ete synchronisees pour la derniere fois avec le serveur (par ex. "il y a 5 min" ou "Jamais")
- **Synchroniser maintenant** — appuyez pour declencher manuellement une synchronisation des donnees

> **Note :** L'application fonctionne hors ligne. Vos donnees sont enregistrees sur votre appareil et se synchronisent automatiquement lorsque vous etes de nouveau en ligne. Utilisez **Synchroniser maintenant** pour forcer une synchronisation immediate.

### Rapports et email

Gerez vos preferences de rapports et d'emails :

- **Resume hebdomadaire par email** (Business) — activer/desactiver, choisir le jour de la semaine
- **Resume mensuel par email** (Pro+) — activer/desactiver
- **Generer un rapport** — ouvre l'ecran [Export et rapports](./16-export-reports.md)
- **Exporter la sauvegarde** — cree une sauvegarde JSON complete des donnees de votre compte
- **Restaurer la sauvegarde** — importer un fichier de sauvegarde precedemment exporte

## A propos

- **Version** — numero de version actuel de l'application
- **Aide** — ouvre le centre d'aide integre
- **Support** — envoyer un e-mail a l'equipe de support
- **Politique de confidentialite** — consulter la politique de confidentialite
- **Conditions d'utilisation** — consulter les conditions d'utilisation

## Se deconnecter

Sur l'ecran principal des Parametres, appuyez sur **Se deconnecter** en bas. Une boite de dialogue de confirmation apparaitra — confirmez pour vous deconnecter de votre compte.

## FAQ

- **Q : J'ai change de langue mais certains textes sont encore dans l'ancienne langue. Que faire ?**
  **R :** Le changement de langue est instantane pour tous les elements de l'interface. Si vous remarquez du texte non traduit, essayez de redemarrer l'application.

- **Q : Comment changer mon e-mail ?**
  **R :** Le changement d'e-mail n'est pas pris en charge dans l'application actuellement. Contactez le support pour obtenir de l'aide.

- **Q : Qu'arrive-t-il a mes donnees lorsque je me deconnecte ?**
  **R :** Vos donnees restent stockees sur le serveur. Lorsque vous vous reconnecterez, tout sera restaure. Les donnees locales sur l'appareil peuvent etre effacees.

---

*Voir aussi : [Comptes](./09-accounts.md) | [Abonnement](./12-subscription.md) | [Export et rapports](./16-export-reports.md) | [Mode de reponse de l'IA](./20-ai-response-mode.md) | [Chat IA](./07-ai-chat.md)*
