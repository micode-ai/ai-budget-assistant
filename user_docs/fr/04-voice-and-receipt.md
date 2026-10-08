# Saisie vocale et scan de recus

> Laissez l'IA faire le travail. Decrivez votre depense naturellement a l'oral ou photographiez un recu — l'application extrait automatiquement le montant, la description, le commercant et la categorie.

## Depense vocale

![Ecran de depense vocale](../img/voice-expense-4.jpg)

### Comment ca marche

1. Appuyez sur **Saisie vocale** dans les actions rapides du Tableau de bord, ou appuyez sur **+** dans l'ecran Transactions et selectionnez **Saisie vocale**
2. Vous verrez une grande icone de microphone avec le texte **"Appuyez pour commencer a parler"**
3. Appuyez sur le bouton du microphone pour lancer l'enregistrement
4. Parlez naturellement, par exemple : *"Cafe chez Starbucks, cinq euros"*
5. Appuyez a nouveau pour arreter l'enregistrement
6. L'application traite votre parole et extrait les details de la depense

### Ecran de confirmation

Apres le traitement, vous verrez une confirmation avec les donnees analysees :

- **Montant** — extrait de votre parole (modifiable)
- **Description** — l'objet de la depense (modifiable)
- **Commercant** — ou vous avez depense (modifiable)
- **Categorie** — attribuee automatiquement (modifiable)
- Indicateur de **confiance** — **Confiance elevee** ou **Confiance moyenne**

Verifiez les details, apportez les corrections necessaires, puis :
- Appuyez sur **Enregistrer la depense** pour confirmer et sauvegarder
- Appuyez sur **Reessayer** pour reenregistrer

Apres la sauvegarde, vous pouvez appuyer sur **Ajouter une autre** pour enregistrer une nouvelle depense vocale.

### Conseils pour de meilleurs resultats

- Parlez clairement et incluez a la fois la description et le montant
- Mentionnez le nom du commercant si pertinent (par ex. "Dejeuner chez McDonald's, douze euros")
- Specifiez la devise si elle est differente de votre devise par defaut
- Restez simple — une depense par enregistrement

## Scanner un recu

![Ecran de scan de recu](../img/scan-receipt-4.jpg)

### Comment ca marche

1. Appuyez sur **Scanner un recu** dans les actions rapides du Tableau de bord, ou appuyez sur **+** dans l'ecran Transactions et selectionnez **Scanner un recu**
2. Vous verrez trois options :
   - **Prendre une photo** — ouvre votre appareil photo pour photographier le recu
   - **Choisir depuis la galerie** — selectionnez une photo existante
   - **Importer un PDF** — choisissez un fichier PDF (factures numeriques, recus scannes, jusqu'a 10 Mo)
3. Optionnellement, entrez des **Instructions supplementaires pour l'IA** (par ex. "Diviser en parts egales entre deux personnes", "Ignorer le pourboire")
4. L'application analyse le recu et en extrait les donnees

### Ecran de confirmation

Apres l'analyse par l'IA, vous verrez :

- **Montant total** — extrait du recu (modifiable)
- **Description** — resume genere (modifiable)
- **Commercant** — nom du magasin/restaurant (modifiable)
- **Categorie** — attribuee automatiquement (modifiable)
- **Date** — du recu (modifiable)
- **Articles** — lignes individuelles avec quantites et prix (si detectes) — touchez un article pour le modifier, le supprimer ou en ajouter un que le scan a manqué (voir **Modifier les articles** ci-dessous)
- **Remise** — montant de la remise (si presente sur le recu)
- Indicateur de **confiance** — **Confiance elevee** ou **Confiance moyenne**
- Option **Conserver l'image du recu** — garder la photo attachee a la depense

Verifiez et corrigez les details, puis :
- Appuyez sur **Enregistrer la depense** pour confirmer
- Appuyez sur **Scanner a nouveau** pour essayer une autre photo

### Conseils pour de meilleurs resultats

- Photographiez dans un bon eclairage — evitez les ombres et les reflets
- Assurez-vous que l'ensemble du recu est visible et a plat
- Tenez l'appareil photo stable pour eviter le flou
- Utilisez les **Instructions supplementaires pour l'IA** pour un traitement special (par ex. "C'est en EUR", "Ignorer le premier article")

### Modifier les articles

L'extraction par IA n'est pas toujours parfaite — un chiffre du prix peut être perdu, une remise peut se glisser dans un prix unitaire, ou une ligne peut être complètement manquée lors du scan. Inutile de rescanner ou de supprimer toute la dépense pour la corriger :

- **Touchez un article** dans la liste pour modifier son nom, sa quantité, son prix unitaire ou son prix total. Touchez **Enregistrer** pour appliquer la correction.
- **Touchez l'icône de la corbeille** à côté d'un article pour le supprimer — utile pour une ligne dupliquée ou inventée.
- **Touchez + Ajouter un article** en bas de la liste pour ajouter une ligne que le scan a manquée.

Tous les articles sont affichés — il n'y a pas de limite, quel que soit leur nombre sur le reçu. Toute modification met immédiatement à jour la répartition par catégories et les totaux, afin que ce que vous enregistrez corresponde toujours à ce qui est affiché. Le montant total, la remise et la consigne du reçu restent tels que scannés — seuls les articles individuels sont modifiables.

### Répartition par catégories

Les tickets de supermarché mélangent souvent plusieurs types d'articles en un seul achat — alimentation, produits ménagers, alcool. Lorsque l'application reconnaît plus d'un type d'article sur un reçu, elle répartit automatiquement la dépense entre les catégories correspondantes au lieu de tout attribuer à une seule.

- Sur l'écran de confirmation, une rangée de puces de catégorie apparaît au-dessus de la liste des articles, intitulée **Répartir par catégorie** (par exemple, « Alimentation 180 · Ménage 35 · Alcool 25 »), montrant comment le montant total sera réparti.
- Appuyez sur **Modifier les catégories** pour ouvrir une liste de tous les articles et ajuster la catégorie de chacun. Vos modifications s'appliquent immédiatement — et sont mémorisées, afin que le même produit soit correctement catégorisé lors de votre prochain scan.
- Si les articles ne correspondent pas suffisamment au montant total du reçu, l'application revient à une seule catégorie plutôt que de deviner.
- Les consignes sur les bouteilles et les canettes sont reconnues et affichées comme leur propre catégorie, afin que vous puissiez voir quelle part de vos dépenses correspond à un emballage que vous pouvez récupérer.
- Cela compte désormais aussi dans vos budgets par catégorie — un budget sur une catégorie qui n'apparaît que dans une répartition de reçu, comme Alcool ou la consigne, est enfin comptabilisé correctement, et un budget Alimentation ne compte plus les produits ménagers ni la consigne du même reçu.
- Parfois, aucune de vos catégories existantes ne correspond à un groupe d'articles. Dans ce cas, l'application suggère une toute nouvelle catégorie, affichée sous forme de puce marquée d'un **+** (par exemple, « + Produits d'entretien 10 »). Elle n'est pas encore créée — appuyez sur **Modifier les catégories** pour réattribuer ses articles à une catégorie existante, ou la laisser telle quelle. La nouvelle catégorie n'est réellement créée que lorsque vous enregistrez le reçu.

Fonctionne de la même façon que vous scanniez depuis l'application ou depuis les bots Telegram, WhatsApp ou Slack.

### Scanner une pile de reçus

Vous avez accumulé une semaine de reçus papier ? Après en avoir enregistré un, la confirmation propose deux choix au lieu de simplement fermer l'écran :

- **Scanner un autre** — revient directement à l'appareil photo sans quitter l'écran, pour enchaîner toute une pile de reçus
- **Terminé** — termine et vous ramène là où vous avez commencé

Pendant que vous scannez, un petit compteur indique combien de reçus vous avez enregistrés dans cette session. Tous les 15 reçus, l'application vous rappelle amicalement que vous pouvez continuer ou faire une pause — votre progression est déjà enregistrée dans tous les cas. Le compteur se réinitialise dès que vous quittez l'écran ; il sert uniquement à donner un sentiment de progression pendant une session.

### Reçus déjà scannés

L'application vous prévient avant qu'un reçu n'apparaisse deux fois dans vos dépenses :

- **Le même fichier à nouveau** — si vous choisissez une photo ou un PDF déjà scanné et enregistré, la question vous est posée *avant* la lecture, donc aucune requête IA n'est consommée. **Ouvrir** affiche la dépense enregistrée, **Scanner quand même** relit le reçu, **Annuler** annule.
- **Le même reçu, nouvelle photo** — si, après lecture, une dépense avec le même magasin, le même montant et la même date (±1 jour) existe déjà, l'écran de confirmation affiche un avis jaune avec un bouton **Ouvrir**. Vous pouvez tout de même enregistrer : il peut s'agir d'un vrai second achat.
- **Déjà enregistré par votre banque** — si la dépense correspondante provient d'une notification bancaire ou d'un relevé importé, l'avis l'indique et propose **Fusionner en une seule dépense**. Case cochée, l'enregistrement conserve le reçu (articles, photo et catégorie) et remplace l'entrée bancaire : l'achat n'est compté qu'une fois. Si seuls le montant et la date correspondent, la case est décochée au départ — vérifiez avant de fusionner.

Les bots Telegram, WhatsApp et Slack préviennent de la même façon et proposent un bouton **Scanner quand même**.

### Partager depuis une autre app (Android)

Vous avez un ticket en capture d'écran, une confirmation de l'app bancaire ou un ticket électronique en PDF ? Inutile d'ouvrir le scanner :

1. Dans n'importe quelle app (galerie, Gmail, banque, app d'enseigne), touchez **Partager**
2. Choisissez **AI Budget**
3. L'app s'ouvre directement sur l'écran de confirmation pré-rempli — vérifiez et touchez **Enregistrer**

Vous pouvez partager des **images et des PDF**, jusqu'à **10 fichiers à la fois** (PDF jusqu'à 10 Mo). Plusieurs fichiers deviennent des dépenses séparées, l'une après l'autre : le titre indique la progression (« Ticket 2 sur 5 ») et **Suivant** passe au fichier suivant. Si un fichier ne peut pas être lu, choisissez **Passer** ou **Saisir à la main**. À la fermeture, l'app demande confirmation avant d'abandonner les fichiers en attente. Chaque fichier compte comme un scan de ticket dans votre limite d'IA ; si elle est atteinte, les fichiers restants attendent.

Le partage fonctionne uniquement sur Android. Sur iPhone et dans l'app web, utilisez **Scanner un reçu**.

### Transférer ses e-reçus par e-mail

Beaucoup de magasins et de boutiques en ligne vous envoient un reçu ou une confirmation de commande par e-mail. Au lieu de le scanner, vous pouvez le transférer vers votre propre adresse privée : chaque e-mail transféré apparaît dans l'app comme une dépense qui vous attend. **Rien n'est enregistré avant votre confirmation.**

> **Déploiement progressif.** Cette fonctionnalité est activée peu à peu. Si vous voyez **Reçus par e-mail** dans les **Paramètres**, vous pouvez l'utiliser. Sinon, elle n'est pas encore arrivée sur votre compte.

#### Votre adresse

1. Ouvrez **Paramètres** → **Reçus par e-mail**
2. Appuyez sur **Créer mon adresse** (seuls les propriétaires et les éditeurs du compte peuvent le faire)
3. Sous **Votre adresse privée**, appuyez sur **Copier**
4. Sous **Ajouter les reçus à**, choisissez le compte où les reçus confirmés sont enregistrés (seuls les comptes que vous pouvez modifier sont proposés)

L'adresse vous appartient, pas au compte : les membres d'un compte partagé ne voient jamais les e-mails que vous transférez.

#### Configurer le transfert dans Gmail

1. Dans Gmail, ouvrez **Paramètres** → **Voir tous les paramètres** → **Transfert et POP/IMAP** → **Ajouter une adresse de transfert** et collez votre adresse privée
2. Gmail envoie un code de confirmation à cette adresse. Il apparaît dans l'app, dans **Paramètres** → **Reçus par e-mail**, sur une carte **Code de confirmation Gmail** avec un bouton **Copier**. Saisissez-le dans Gmail. Le code n'est affiché que dans l'app — jamais dans une notification — et seulement pendant environ 30 minutes ; s'il a disparu, demandez à Gmail de le renvoyer
3. Créez un **filtre** (**Paramètres** → **Filtres et adresses bloquées**) pour l'adresse de l'expéditeur du magasin ou un objet tel que « reçu » ou « commande », puis choisissez **Le transférer à** votre adresse

Ne transférez pas tout votre courrier : utilisez un filtre, pour votre confidentialité et pour que les messages sans rapport n'épuisent pas votre limite d'IA.

#### Configurer le transfert dans Outlook

1. Dans Outlook, ouvrez **Paramètres** → **Courrier** → **Règles** et ajoutez une règle pour les messages du magasin ou dont l'objet contient « reçu »
2. Choisissez l'action **Transférer à** et saisissez votre adresse privée

Certains comptes Outlook.com et Microsoft 365 bloquent le transfert automatique vers des adresses externes. Si c'est votre cas, transférez chaque reçu manuellement — un transfert manuel depuis votre téléphone fonctionne tout aussi bien.

#### Confirmer un reçu

Quand un reçu transféré a été lu, vous recevez une notification et un bandeau s'affiche sur l'écran Transactions : **Reçus par e-mail à confirmer : N**. Vous pouvez aussi ouvrir la liste à tout moment via **Paramètres** → **Reçus par e-mail** → **Ouvrir la boîte des reçus par e-mail**.

- L'onglet **À confirmer** liste les reçus qui vous attendent. Appuyez sur l'un d'eux pour ouvrir l'écran habituel de confirmation du reçu, vérifiez les informations et appuyez sur **Enregistrer la dépense**
- Si le reçu ressemble à une dépense que vous avez déjà, vous voyez le même avertissement de doublon que pour un scan, y compris **Fusionner en une seule dépense**
- Appuyez sur **Écarter** pour abandonner un reçu sans l'enregistrer
- L'onglet **Traités** montre ce qui a été ignoré : un reçu que vous avez déjà, un e-mail sans reçu, un reçu illisible ou un reçu non lu parce que votre limite d'IA était atteinte — le cas échéant, appuyez sur **Réessayer**

Chaque e-reçu lu compte comme un scan de reçu dans votre limite d'IA ; les doublons et les e-mails sans reçu sont ignorés sans l'utiliser. Si un magasin n'envoie qu'un lien vers le reçu, transférez plutôt le PDF : les liens ne sont jamais ouverts. Une photo du reçu peut être conservée avec la dépense ; un PDF ou un simple e-mail n'est pas joint. La liste nécessite une connexion internet.

#### Si votre adresse fuite

Appuyez sur **Changer d'adresse**. L'ancienne adresse cesse immédiatement de fonctionner et les messages qui lui sont envoyés sont rejetés. Remplacez ensuite, dans votre messagerie, la règle de transfert par la nouvelle adresse (Gmail redemandera un code de confirmation). Pour ne plus recevoir d'e-reçus du tout, appuyez sur **Désactiver l'adresse**.

#### Confidentialité et conservation

- Notre serveur lit l'e-mail transféré pendant son traitement, comme pour tout reçu que vous scannez
- Seul le reçu lui-même est conservé, jamais l'e-mail entier. Les liens de l'e-mail ne sont jamais ouverts et ses images ne sont jamais chargées
- Le reçu stocké est supprimé dès que vous le confirmez ou l'écartez ; les éléments non confirmés sont supprimés automatiquement au bout de 30 jours
- Les reçus par e-mail **ne sont pas disponibles** pour les comptes en **Niveau 2 — Chiffrement complet**. Avec le chiffrement de Niveau 1, ils fonctionnent, mais les éléments non confirmés sont supprimés au bout de 7 jours. Voir [Chiffrement](./15-encryption.md)

## Revenus vocaux

Enregistrez les paiements reçus par la voix — même flux que la dépense vocale, optimisé pour les revenus.

### Comment ça marche

1. Appuyez sur **Revenus vocaux** dans les actions rapides du Tableau de bord, ou appuyez sur l'icône du microphone dans le pied du formulaire **Ajouter un revenu**
2. Appuyez sur le bouton (vert) du microphone pour lancer l'enregistrement
3. Parlez naturellement, par exemple : *"Reçu 500 du client, honoraires de conseil"*
4. Appuyez à nouveau pour arrêter l'enregistrement
5. L'application extrait le montant, la description et la **catégorie de revenu** la plus appropriée

### Écran de confirmation

- **Montant** — extrait de votre parole (modifiable)
- **Description** — objet du paiement (modifiable)
- **Catégorie** — catégorie de revenu attribuée automatiquement (modifiable)
- **Devise** — détectée ou définie par défaut sur votre devise de base

Appuyez sur **Enregistrer le revenu** pour confirmer, ou sur **Réessayer** pour ré-enregistrer.

### Conseils pour de meilleurs résultats

- Mentionnez le montant et une brève description
- Précisez la devise si elle diffère de votre devise par défaut

---

## Scanner une facture

Photographiez ou importez une facture ou un document de paiement pour capturer automatiquement des revenus.

### Comment ça marche

1. Appuyez sur **Scanner une facture** dans les actions rapides du Tableau de bord, ou appuyez sur l'icône du document dans le pied du formulaire **Ajouter un revenu**
2. Choisissez **Prendre une photo**, **Choisir depuis la galerie** ou **Importer un PDF**
3. Optionnellement, entrez des instructions supplémentaires pour l'IA
4. L'application extrait le montant total, la date et la catégorie

### Écran de confirmation

- **Montant total** — extrait du document
- **Description** — résumé généré
- **Catégorie** — catégorie de revenu attribuée automatiquement
- **Date** — du document

Vérifiez les détails, appuyez sur ✓ pour sauvegarder ou sur l'icône crayon pour ouvrir le formulaire complet Ajouter un revenu avec les données pré-remplies.

> **Remarque :** L'OCR de facture extrait uniquement le total et la date. Les lignes de détail des factures sont intentionnellement ignorées pour éviter les doubles comptages sur les documents de facturation multi-lignes.

---

## FAQ

- **Q : Quelles langues la saisie vocale prend-elle en charge ?**
  **R :** La saisie vocale fonctionne au mieux dans la langue definie pour votre application. Elle prend en charge les 8 langues de l'application.

- **Q : Puis-je scanner des recus dans n'importe quelle langue ?**
  **R :** Oui, l'IA peut traiter des recus dans la plupart des langues et extrait les montants et les articles quelle que soit la langue du recu.

- **Q : Quels fichiers PDF sont pris en charge ?**
  **R :** Les PDFs numeriques (par ex. factures Amazon ou PayPal) et les recus scannes en PDF sont tous deux pris en charge. La taille maximale du fichier est de 10 Mo. Les PDFs numeriques avec du texte selectionnable sont traites plus rapidement et avec plus de precision. Pour les PDFs scannes, assurez-vous que le scan est net et contraste.

- **Q : Pourquoi le montant etait-il incorrect apres le scan ?**
  **R :** L'extraction par IA n'est pas toujours parfaite. Verifiez toujours l'ecran de confirmation et corrigez les erreurs avant de sauvegarder. Les recus flous ou endommages peuvent produire des resultats moins precis. Si un article precis est incorrect, touchez-le pour le modifier directement — voir **Modifier les articles** ci-dessus.

- **Q : La saisie vocale et le scan de recus utilisent-ils mes requetes IA ?**
  **R :** Oui, chaque saisie vocale ou scan de recu utilise une requete IA de votre allocation mensuelle.

- **Q : Pourquoi un reçu s'est-il retrouvé réparti entre plusieurs catégories dans mes graphiques ?**
  **R :** Lorsqu'un reçu mélange clairement différents types d'articles (par exemple, alimentation et alcool), l'application le répartit automatiquement entre les catégories correspondantes dans vos graphiques de dépenses — et dans vos budgets par catégorie aussi. Appuyez sur **Modifier les catégories** sur l'écran de confirmation du reçu pour l'ajuster — les corrections sont mémorisées pour la prochaine fois.

---

*Voir aussi : [Depenses et revenus](./03-expenses-and-income.md) | [Chat IA](./07-ai-chat.md)*
