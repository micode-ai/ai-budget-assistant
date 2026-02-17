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
- **Articles** — lignes individuelles avec quantites et prix (si detectes)
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

## FAQ

- **Q : Quelles langues la saisie vocale prend-elle en charge ?**
  **R :** La saisie vocale fonctionne au mieux dans la langue definie pour votre application. Elle prend en charge les 8 langues de l'application.

- **Q : Puis-je scanner des recus dans n'importe quelle langue ?**
  **R :** Oui, l'IA peut traiter des recus dans la plupart des langues et extrait les montants et les articles quelle que soit la langue du recu.

- **Q : Quels fichiers PDF sont pris en charge ?**
  **R :** Les PDFs numeriques (par ex. factures Amazon ou PayPal) et les recus scannes en PDF sont tous deux pris en charge. La taille maximale du fichier est de 10 Mo. Les PDFs numeriques avec du texte selectionnable sont traites plus rapidement et avec plus de precision. Pour les PDFs scannes, assurez-vous que le scan est net et contraste.

- **Q : Pourquoi le montant etait-il incorrect apres le scan ?**
  **R :** L'extraction par IA n'est pas toujours parfaite. Verifiez toujours l'ecran de confirmation et corrigez les erreurs avant de sauvegarder. Les recus flous ou endommages peuvent produire des resultats moins precis.

- **Q : La saisie vocale et le scan de recus utilisent-ils mes requetes IA ?**
  **R :** Oui, chaque saisie vocale ou scan de recu utilise une requete IA de votre allocation mensuelle.

---

*Voir aussi : [Depenses et revenus](./03-expenses-and-income.md) | [Chat IA](./07-ai-chat.md)*
