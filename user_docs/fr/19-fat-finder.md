# Fat Finder (Audit des depenses)

> Un audit mensuel propulse par l'IA qui analyse vos depenses, identifie le gaspillage — abonnements, depenses recurrentes superflues, services inutiles — et suggere des economies concretes avec des montants estimes.

## Apercu

Le **Fat Finder** passe en revue 3 mois de votre historique de transactions, detecte les tendances de depenses et genere un rapport mettant en evidence les postes ou vous pourriez economiser. Chaque constat inclut des montants precis, des niveaux de gravite et des suggestions concretes.

## Comment y acceder

- **Carte du tableau de bord** — affiche les résultats Fat Finder mis en cache. Appuyez pour ouvrir le rapport complet et lancer une nouvelle analyse.
- **Navigation directe** — accedez a l'ecran du Fat Finder depuis la carte du tableau de bord

## Conditions requises

- Chaque generation de rapport consomme **3 requetes IA** de votre quota mensuel
- Les rapports sont **mis en cache pendant 30 jours** par periode d'analyse

## Resume du rapport

Le haut du rapport affiche :
- **Economies mensuelles potentielles totales** — le montant combine que vous pourriez economiser
- **Periode d'analyse** — la plage de dates analysee
- **Nombre de constats** — combien d'opportunites ont ete identifiees

## Types de constats

L'IA identifie ces categories de gaspillage :

| Type | Description |
|---|---|
| **Abonnement** | Frais recurrents avec des montants similaires chaque mois (streaming, salle de sport, outils SaaS) |
| **Depense recurrente** | Depenses regulieres non essentielles qui s'accumulent (sorties au restaurant frequentes, cafes quotidiens) |
| **Grosse depense ponctuelle** | Depenses individuelles nettement superieures a votre transaction moyenne |
| **Exces par categorie** | Categories ou les depenses ont augmente de plus de 20 % d'un mois a l'autre |
| **Surconsommation de services** | Utilisation elevee de services de livraison, VTC ou services similaires |

## Details des constats

Chaque carte de constat comprend :

- **Titre** — breve description du probleme
- **Badge de gravite** — Faible, Moyen ou Eleve
  - **Faible** — moins de 5 % des depenses totales
  - **Moyen** — 5 a 10 % des depenses totales
  - **Eleve** — plus de 10 % des depenses totales
- **Description** — explication detaillee avec des montants precis
- **Actuel vs. Suggere** — votre cout mensuel actuel compare a la recommandation de l'IA
- **Economies potentielles** — combien vous economiseriez par mois
- **Suggestion d'action** — une recommandation concrete en une phrase
- **Depenses associees** — liste depliable des transactions specifiques ayant declenche ce constat

## Actions

- **Regenerer** — forcer une nouvelle analyse avec les donnees les plus recentes (coute 3 requetes IA)
- **Deplier/replier** — appuyez sur les constats pour afficher ou masquer les descriptions et les depenses associees

## Carte du tableau de bord

La carte compacte du Fat Finder sur l'ecran d'accueil affiche :
- Le potentiel total d'economies mis en evidence
- Les 3 principaux constats avec des points de gravite et les montants d'economies
- Le bouton **Voir le rapport complet** pour acceder a tous les details

Si aucun constat n'est detecte, vous verrez un message "Tout va bien !".

## FAQ

- **Q : A quelle frequence dois-je consulter le Fat Finder ?**
  **R :** Le rapport couvre le mois en cours. Consultez-le une fois par mois pour les analyses les plus pertinentes. Appuyez sur **Regenerer** pour obtenir une analyse actualisee.

- **Q : Pourquoi les constats changent-ils chaque mois ?**
  **R :** L'IA analyse vos 3 derniers mois de donnees. A mesure que vos habitudes de depenses evoluent, les constats se mettent a jour en consequence.

- **Q : L'IA a signale une depense necessaire. Puis-je la rejeter ?**
  **R :** Actuellement, les constats individuels ne peuvent pas etre rejetes. L'IA fournit des suggestions — c'est a vous de decider lesquelles mettre en oeuvre.

- **Q : Cela fonctionne-t-il avec les comptes chiffres ?**
  **R :** Pour les comptes avec chiffrement complet (Niveau 2), le Fat Finder ne peut pas analyser les descriptions des depenses et peut donc produire moins de constats ou des constats moins specifiques.

---

*Voir aussi : [Objectifs d'epargne](./18-savings-goals.md) | [Histoire de depenses](./08-spending-story.md) | [Chat IA](./07-ai-chat.md)*
