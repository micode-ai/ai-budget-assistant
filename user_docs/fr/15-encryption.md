# Chiffrement de bout en bout

> Protegez vos donnees financieres avec le chiffrement de bout en bout (E2EE). Toutes les informations sensibles sont chiffrees sur votre appareil avant d'etre envoyees au serveur — personne a part vous (et les membres de vos comptes partages) ne peut les lire.

## Apercu

Le chiffrement de bout en bout garantit que vos descriptions, notes, noms de categories et autres donnees textuelles sont chiffrees sur votre appareil avant la synchronisation. Le serveur ne stocke que des donnees chiffrees et ne peut pas les lire, meme si la base de donnees est compromise.

Vous controlez le chiffrement avec une **phrase de passe de chiffrement** separee qui n'est jamais envoyee au serveur.

## Configurer le chiffrement

1. Ouvrez les **Parametres**
2. Faites defiler jusqu'a la section **Securite**
3. Appuyez sur **Activer le chiffrement**
4. Entrez une **phrase de passe de chiffrement** (minimum 8 caracteres)
   - Elle est distincte de votre mot de passe de connexion
   - Choisissez une phrase de passe robuste dont vous pouvez vous souvenir
5. Confirmez la phrase de passe
6. Une **Cle de recuperation** s'affichera a l'ecran

> **Important :** Sauvegardez votre Cle de recuperation immediatement ! Notez-la ou stockez-la dans un gestionnaire de mots de passe. Format : `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. C'est le **seul moyen** de recuperer vos donnees si vous oubliez la phrase de passe.

Apres la configuration, le chiffrement est automatiquement active pour votre compte actuel.

## Deverrouiller le chiffrement

Apres un redemarrage de l'application ou lorsque votre session expire, le chiffrement est verrouille. Vos donnees sont toujours stockees en toute securite, mais les champs chiffres apparaitront vides jusqu'au deverrouillage.

Pour deverrouiller :

1. Ouvrez **Parametres** > **Securite**
2. Appuyez sur **Deverrouiller le chiffrement**
3. Entrez votre phrase de passe de chiffrement
4. Vos donnees redeviennent lisibles

## Ce qui est chiffre

Le chiffrement fonctionne en deux niveaux :

### Niveau 1 — Champs textuels (par defaut)

| Donnee | Chiffree |
|---|---|
| Descriptions et notes des depenses | Oui |
| Noms de lieux | Oui |
| Donnees de recus | Oui |
| Noms de categories | Oui |
| Noms d'etiquettes | Oui |
| Noms et descriptions de projets | Oui |
| Noms de budgets | Oui |
| Montants, dates, devises | Non — restent en clair |

**Les fonctionnalites serveur** (analyses, alertes de budget, aperçus IA) continuent de fonctionner car les montants et les dates restent accessibles.

### Niveau 2 — Chiffrement complet (optionnel)

Tout ce qui est dans le Niveau 1, plus :

| Donnee | Chiffree |
|---|---|
| Montants (depenses, revenus, budgets) | Oui |
| Prix et taux de change | Oui |
| Soldes du portefeuille | Oui |

> **Note :** Avec le Niveau 2, les analyses cote serveur et les fonctionnalites IA sont indisponibles car le serveur ne peut pas lire les montants. Toutes les analyses sont calculees localement sur votre appareil.

## Recuperation

Si vous oubliez votre phrase de passe mais que vous avez votre Cle de recuperation :

1. Ouvrez **Parametres** > **Securite**
2. Appuyez sur **Recuperer**
3. Entrez votre Cle de recuperation
4. Definissez une nouvelle phrase de passe
5. Une nouvelle Cle de recuperation est generee — sauvegardez-la a nouveau

## Reinitialiser le chiffrement

Si vous perdez a la fois votre phrase de passe et votre Cle de recuperation :

1. Ouvrez **Parametres** > **Securite**
2. Appuyez sur **Reinitialiser le chiffrement** (bouton rouge)
3. Confirmez l'action

> **Attention :** Les donnees precedemment chiffrees sur le serveur deviennent **definitivement illisibles**. Les donnees locales sur votre appareil ne sont pas affectees. Vous pouvez configurer le chiffrement a nouveau avec une nouvelle phrase de passe.

## Comptes partages

Lorsque le chiffrement est active pour un compte partage :

- Le **proprietaire du compte** doit accorder les cles de chiffrement a chaque membre
- Les nouveaux membres peuvent voir les metadonnees (montants, dates, categories) mais **ne peuvent pas lire les champs textuels chiffres** tant que le proprietaire n'a pas accorde l'acces
- L'attribution des cles se fait lorsque le proprietaire ouvre l'application et approuve les membres en attente
- Lorsqu'un membre est **retire** d'un compte partage, les cles sont renouvelees pour des raisons de securite — le membre retire ne peut plus dechiffrer les nouvelles donnees

## Impact sur les fonctionnalites de l'application

| Fonctionnalite | Niveau 1 (Texte) | Niveau 2 (Complet) |
|---|---|---|
| Analyses et graphiques | Fonctionne pleinement | Calcule localement |
| Alertes de budget | Fonctionne pleinement | Indisponible |
| Chat IA | Partiel (sans descriptions) | Indisponible |
| Aperçus IA | Partiel | Indisponible |
| Histoire des depenses | Partiel | Indisponible |
| Saisie vocale | Fonctionne pleinement | Fonctionne pleinement |
| Scan de recus | Fonctionne pleinement | Fonctionne pleinement |
| Rapports CSV/PDF/Excel | Montants corrects, champs texte vides | Indisponible |
| Resume mensuel | Fonctionne (noms resolus localement) | Indisponible |
| Sauvegarde chiffree | Fonctionne pleinement | Fonctionne pleinement |
| Rapports par email | Montants corrects, champs texte vides | Indisponible |

## FAQ

- **Q : La phrase de passe de chiffrement est-elle la meme que mon mot de passe de connexion ?**
  **R :** Non. La phrase de passe de chiffrement est distincte et n'est jamais envoyee au serveur. Votre mot de passe de connexion authentifie votre compte ; la phrase de passe de chiffrement protege vos donnees.

- **Q : Que se passe-t-il si j'oublie ma phrase de passe et que je perds la Cle de recuperation ?**
  **R :** Les donnees precedemment chiffrees sur le serveur deviennent definitivement illisibles. Vous pouvez reinitialiser le chiffrement et repartir de zero, mais les anciennes donnees chiffrees ne peuvent pas etre recuperees.

- **Q : Les developpeurs de l'application peuvent-ils lire mes donnees chiffrees ?**
  **R :** Non. Le serveur ne stocke que des blobs chiffres. Sans votre phrase de passe ou votre Cle de recuperation, personne ne peut dechiffrer vos donnees.

- **Q : Le chiffrement ralentit-il l'application ?**
  **R :** La configuration initiale prend quelques secondes pour la derivation de la cle. Ensuite, le chiffrement et le dechiffrement des champs individuels sont quasi instantanes.

- **Q : Puis-je desactiver le chiffrement apres l'avoir active ?**
  **R :** Vous pouvez reinitialiser le chiffrement, ce qui supprime la configuration de chiffrement. Cependant, les donnees qui ont ete chiffrees sur le serveur restent chiffrees et deviennent illisibles.

---

*Voir aussi : [Parametres](./11-settings.md) | [Comptes](./09-accounts.md) | [Export et rapports](./16-export-reports.md)*
