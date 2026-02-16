# Export et rapports

> Generez des rapports PDF, Excel et CSV de vos finances. Consultez les resumes mensuels de vos depenses, creez des sauvegardes chiffrees et recevez des resumes automatises par email.

## Apercu

L'ecran **Export et rapports** vous permet de generer des rapports financiers, de consulter des resumes mensuels, de telecharger/partager des rapports et de gerer les sauvegardes de donnees. Accedez-y depuis l'onglet Analyses via le bouton **Exporter le rapport**, ou depuis **Parametres** > **Rapports et email** > **Generer un rapport**.

## Formats de rapport

Trois formats d'export disponibles :

| Format | Description | Disponibilite |
|---|---|---|
| **CSV** | Valeurs separees par des virgules, compatible avec Excel et Google Sheets | Tous les plans |
| **PDF** | Rapport formate avec resume, repartition par categorie et liste des transactions | Pro et Business |
| **Excel** | Classeur multi-feuilles avec feuilles Resume, Depenses et Revenus | Pro et Business |

## Generer un rapport

1. Selectionnez un **format** (CSV, PDF ou Excel)
2. Choisissez une **periode** (Semaine derniere, Ce mois, Trimestre dernier, Cette annee)
3. Appuyez sur **Generer**
4. Une fois pret, le rapport apparait dans Rapports recents ci-dessous
5. Appuyez sur un rapport pour le telecharger et le partager

Les rapports sont conserves pendant 7 jours puis automatiquement supprimes.

## Resume mensuel (Pro+)

Un apercu de votre activite financiere du mois en cours :

- **Total des revenus** et **Total des depenses**
- **Taux d'epargne** — pourcentage des revenus economises
- **Principales categories** — vos plus grandes categories de depenses avec montants
- Les donnees sont mises en cache pendant 7 jours et se rafraichissent automatiquement

## Rapports recents

Une liste de vos rapports recemment generes affichant :

- Icone de format (CSV/PDF/Excel)
- Nom de fichier et date de creation
- Taille du fichier
- Appuyez pour telecharger et partager via la feuille de partage du systeme

## Sauvegarde des donnees

Disponible sur **tous les plans** :

- **Exporter la sauvegarde** — cree une sauvegarde JSON complete des donnees de votre compte (depenses, revenus, budgets, categories, etiquettes, projets, portefeuilles, etc.)
- **Restaurer la sauvegarde** — importer une sauvegarde precedemment exportee
- Si le chiffrement est active, les champs chiffres sont inclus tels quels dans la sauvegarde

Accedez a la sauvegarde depuis **Parametres** > **Rapports et email**.

## Rapports par email

Resumes automatises par email livres dans votre boite de reception :

| Fonctionnalite | Description | Plan requis |
|---|---|---|
| **Resume hebdomadaire par email** | Apercu hebdomadaire des depenses avec principales categories | Business |
| **Resume mensuel par email** | Synthese mensuelle avec comparaison mois par mois | Pro et Business |

Configurez-les dans **Parametres** > **Rapports et email** :

- Activer/desactiver les emails hebdomadaires/mensuels
- Choisir le jour de la semaine pour les rapports hebdomadaires (lundi par defaut)

## Chiffrement et rapports

- **Niveau 0** (pas de chiffrement) — toutes les donnees s'affichent correctement dans les rapports
- **Niveau 1** (chiffrement du texte) — les montants s'affichent correctement ; les noms de categories et les descriptions peuvent apparaitre vides dans les rapports generes par le serveur. Le resume mensuel resout les noms de categories a partir des donnees locales de votre appareil
- **Niveau 2** (chiffrement complet) — les rapports ne sont pas disponibles (les montants sont chiffres cote serveur)

## FAQ

- **Q : Pourquoi vois-je des noms de categories vides dans mon rapport PDF ?**
  **R :** Si vous avez active l'E2EE (Niveau 1), les noms de categories sont chiffres sur le serveur. Le rapport genere par le serveur ne peut pas les dechiffrer. Les montants restent precis.

- **Q : Combien de temps les rapports sont-ils conserves ?**
  **R :** Les rapports sont automatiquement supprimes apres 7 jours. Telechargez-les rapidement apres leur generation.

- **Q : Puis-je exporter des donnees d'un compte partage ?**
  **R :** Oui, tout membre du compte peut generer des rapports et des sauvegardes pour le compte partage.

- **Q : Qu'est-ce qui est inclus dans une sauvegarde ?**
  **R :** Tout : depenses, revenus, budgets, categories, etiquettes, projets, portefeuilles, virements et echanges de devises pour le compte actuel.

---

*Voir aussi : [Analyses](./06-analytics.md) | [Parametres](./11-settings.md) | [Abonnement](./12-subscription.md) | [Chiffrement](./15-encryption.md)*
