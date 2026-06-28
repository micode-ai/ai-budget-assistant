# Planification — Dépense sûre, abordabilité et capture automatique

> Trois outils qui fonctionnent ensemble pour dépenser en toute confiance : un chiffre de budget quotidien en direct, une question de chat « Puis-je me le permettre ? » et la capture automatique des dépenses depuis les notifications bancaires (Android uniquement).

## Dépense sûre aujourd'hui

L'écran d'accueil affiche un nombre de **Dépense sûre** — le montant que vous pouvez dépenser aujourd'hui tout en couvrant toutes vos obligations connues avant la fin du mois.

### Ce qui est inclus

Le nombre est calculé à partir de :
- **Solde du portefeuille** — vos soldes actuels dans toutes les devises, convertis dans votre devise d'affichage.
- **Abonnements à venir** — les abonnements actifs renouvelés avant la fin du mois (depuis le Gestionnaire d'abonnements).
- **Dépenses récurrentes à venir** — dépenses à répétition hebdomadaire, mensuelle ou annuelle dues avant la fin du mois.
- **Contributions aux objectifs** — le montant journalier nécessaire pour maintenir vos objectifs d'épargne sur la bonne voie.
- **Revenus attendus** — si l'application détecte un revenu mensuel régulier (même montant, intervalle de ~30 jours, au moins deux fois dans les 90 derniers jours), il est ajouté comme revenu attendu et la prochaine date de paiement est utilisée comme horizon.

### Formule

```
Dépense sûre = (Solde + Revenus attendus − Obligations) ÷ Jours restants
```

Le résultat est limité à zéro — vous ne verrez jamais un nombre négatif. Si les obligations dépassent votre solde, le nombre affiche 0 avec une note explicative.

### Ventilation

Appuyez sur le nombre pour ouvrir une feuille de ventilation qui affiche chaque composant : solde du portefeuille, revenus attendus, abonnements à venir, dépenses récurrentes et contributions aux objectifs. Tous les montants sont dans votre devise d'affichage ; une note apparaît si une conversion a utilisé un taux de change approximatif.

### Widget

La Dépense sûre est disponible en tant que widget d'écran d'accueil. Vous pouvez l'afficher ou le masquer dans **Paramètres → Widgets**.

## Puis-je me le permettre ? (Oracle d'abordabilité)

Posez à l'IA des questions comme « Puis-je me permettre un vol à 200 € ? » ou « Puis-je acheter un nouvel ordinateur portable pour 3500 zł ? ». Le chat utilise le même moteur que la Dépense sûre pour donner une réponse déterministe oui ou non — l'IA ne fait que narrer le verdict, elle ne devine jamais.

Réponses possibles :
- **Oui** — le montant est dans le budget sûr d'aujourd'hui.
- **Oui, mais juste** — cela tient dans votre solde disponible mais en utilise la majeure partie.
- **Non** — cela dépasse vos fonds disponibles.
- **Oui, mais retarde un objectif** — abordable, mais votre objectif d'épargne « X » est décalé d'environ N jours.
- **Attendez le jour de paie** — abordable après l'arrivée de vos prochains revenus attendus (la date suggérée est affichée).

## Capture automatique Android

Sur Android, l'application peut créer automatiquement une dépense à partir des notifications push de votre banque — pour ne manquer aucune transaction même lorsque vous n'êtes pas dans l'application.

### Comment l'activer

1. Allez dans **Paramètres → Importer des transactions → Capture automatique (Android)**.
2. Lisez la note de confidentialité et appuyez sur **Activer**.
3. L'application ouvre les paramètres d'accès aux notifications du système. Trouvez **AI Budget Assistant** dans la liste et activez-le.
4. Revenez à l'application — le statut affiche **Autorisation accordée**.

### Confidentialité

Le texte des notifications est traité **uniquement sur votre appareil**. Le nom du marchand, le montant et la devise sont extraits localement ; seule la dépense résultante est synchronisée avec le serveur — le texte brut de la notification n'est jamais envoyé nulle part.

### Banques prises en charge (Europe)

La capture automatique fonctionne avec les notifications des principales banques de détail à travers l'Europe. Pays pris en charge : Pologne (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), Allemagne/Autriche (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), France (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Espagne (BBVA, Santander, CaixaBank, Bankinter), Pays-Bas (ING, Rabobank, ABN AMRO, bunq), Ukraine (PrivatBank, monobank, Oschadbank) et Russie (Sberbank, Tinkoff, Alfa-Bank). Les néobanques transfrontalières Revolut et N26 sont également prises en charge. La liste complète est affichée sur l'écran de capture automatique.

**Note sur les catégories :** Pour les banques hors de Pologne, il est possible qu'aucune catégorie ne soit suggérée automatiquement. La dépense sera enregistrée sans catégorie et vous pourrez la corriger manuellement — l'application apprend de vos corrections.

### Déduplication

Si une notification est livrée plus d'une fois, ou si vous importez également la même transaction depuis un CSV bancaire, l'application déduplique automatiquement. Chaque notification capturée reçoit une empreinte unique ; les doublons sont silencieusement supprimés.

### Vérifier les captures

Appuyez sur le toast de capture (« 54 zł capturés · Żabka — appuyez pour vérifier ») pour ouvrir le détail de la dépense et vérifier ou corriger le montant, le marchand et la catégorie avant la synchronisation.

### Android uniquement

La capture automatique est une fonctionnalité Android. Sur iOS et le web, cette section n'apparaît pas. Une alternative pour iOS est de scanner une photo de reçu via la fonctionnalité de capture de reçus existante.
