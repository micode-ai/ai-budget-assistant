---
title: "Importer un relevé Revolut dans une appli de budget"
meta_description: "Importer un relevé CSV Revolut dans une appli de budget : export, aperçu, changes de devises regroupés et aucun doublon lors d'un nouvel import."
target_keyword: "importer relevé revolut"
slug: "importer-releve-revolut"
pair: "import-revolut"
lang: "fr"
date: "2026-10-07"
---

# Importer un relevé Revolut dans votre budget en quelques minutes

Pour importer un relevé Revolut, générez un relevé au format CSV dans l'appli Revolut, puis dans AI Budget Assistant ouvrez Paramètres → Importer des transactions → Revolut et choisissez le fichier. Vous obtenez un aperçu avec des catégories suggérées, les doublons décochés et les changes de devises regroupés en une seule opération. Quelques minutes suffisent.

Revolut fait partie des banques les plus simples à importer : son CSV a une structure de colonnes fixe et indique la devise de chaque ligne. Voici ce que l'appli lit exactement et les points de vigilance.

## Comment exporter un relevé depuis Revolut ?

Dans l'appli Revolut, ouvrez les relevés de votre compte (la rubrique s'appelle Statements dans l'interface en anglais), choisissez la période et le format CSV, puis téléchargez le fichier sur votre téléphone ou votre ordinateur. Revolut renomme parfois ses boutons ; si l'écran diffère, cherchez l'option qui génère un relevé et permet de choisir CSV.

Bonne habitude : la première fois, téléchargez une période plus longue, de trois à six mois. Réimporter des périodes qui se chevauchent est sans danger, car l'appli reconnaît ce qu'elle possède déjà.

## Comment importer le fichier pas à pas ?

1. **Téléchargez le CSV depuis Revolut** sur l'appareil où tourne l'appli.
2. Dans AI Budget Assistant, allez dans **Paramètres → Importer des transactions**.
3. Choisissez **Revolut** dans la liste (ou **Détection automatique (toute banque)**, qui reconnaît la structure Revolut grâce à ses en-têtes).
4. Sélectionnez le fichier. L'appli affiche un aperçu : chaque ligne en dépense, revenu ou change de devises, avec une catégorie suggérée.
5. Décochez les lignes dont vous ne voulez pas, corrigez les catégories et touchez **Importer**.

Dans l'aperçu, des compteurs indiquent les lignes sélectionnées et celles déjà importées. Les lignes déjà connues sont décochées par défaut.

## Que lit l'appli dans un fichier Revolut ?

| Élément | Traitement |
|---|---|
| Format | CSV séparé par des virgules, en-têtes sur la première ligne |
| Colonnes | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Date | Depuis Started Date (la date seule, sans l'heure) |
| Montant | Avec signe : négatif = dépense, positif = revenu |
| Devise | Par ligne, donc un compte multidevise ne mélange rien |
| État | Seules les lignes COMPLETED sont importées ; les refusées et en attente sont ignorées |
| Change de devises | Deux lignes EXCHANGE de même date et de signes opposés sont fusionnées en un change |
| Commerçant | Depuis Description, avec un nom normalisé pour les enseignes connues |

## Et les changes de devises, les comptes multidevises ?

Un compte Revolut détient souvent plusieurs devises. Quand vous changez des zlotys contre des euros, le fichier contient deux lignes : une sortie dans une devise, une entrée dans l'autre. Comptées séparément, elles créeraient une fausse dépense et un faux revenu. L'appli les associe donc et enregistre un seul **change de devises**, visible dans le Portefeuille et non dans vos dépenses.

Les achats en devise étrangère restent dans leur devise d'origine.

## Comment éviter les doublons, et que faire en cas de souci ?

L'appli vous protège de deux façons. D'abord, chaque ligne reçoit un identifiant unique construit à partir de la date, du montant et de la description : réimporter le même fichier n'ajoute rien. Ensuite, elle compare date, montant et devise aux transactions déjà présentes dans votre compte, y compris les saisies manuelles, et décoche les répétitions probables.

Deux achats identiques le même jour, comme deux cafés au même prix, sont conservés comme deux transactions. Si le résultat ne vous convient pas, l'historique des imports, en bas de l'écran, permet de l'annuler d'un geste pendant 30 jours, puis de réimporter le même fichier.

Pour la mécanique générale, lisez [Importer un relevé bancaire](/blog/fr/importer-releve-bancaire/). Si votre banque ne figure pas dans la liste, consultez [Importer un relevé de n'importe quelle banque](/blog/fr/importer-releve-nimporte-quelle-banque/).

## Est-ce sûr ?

Vous ne saisissez jamais vos identifiants Revolut. Vous importez un fichier statique que vous avez téléchargé vous-même : l'appli ne voit que l'historique contenu dans ce fichier. Vous pouvez essayer AI Budget Assistant gratuitement sur [ai-budget.pl](https://ai-budget.pl) ou sur [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ : Importer un relevé Revolut

**Quel format de relevé Revolut me faut-il ?**

Le CSV. C'est le fichier avec les colonnes Type, Started Date, Description, Amount, Currency, State et Balance que Revolut génère dans la rubrique des relevés de votre compte. Un PDF ne peut être lu que par la lecture IA, une fonction Pro ; pour des imports réguliers, choisissez le CSV.

**Les transactions refusées ou en attente sont-elles importées ?**

Non. Seules les lignes à l'état COMPLETED sont prises en compte. Un paiement par carte refusé ne diminuera pas votre budget, et un paiement en attente apparaîtra dans un relevé ultérieur, une fois réglé.

**Un change de devises Revolut compte-t-il comme une dépense ?**

Non. Deux lignes de change de même date et de signes opposés sont fusionnées en un change de devises dans le Portefeuille. Il ne gonfle ni vos dépenses ni vos revenus.

**Puis-je importer deux fois le même relevé ?**

Oui, rien ne sera dupliqué. Les lignes répétées sont reconnues et décochées dans l'aperçu comme déjà importées.

**Puis-je annuler un import Revolut ?**

Oui. Dans l'historique des imports, en bas de l'écran d'import, touchez la flèche d'annulation à côté de l'import. C'est possible pendant 30 jours, après quoi vous pouvez réimporter le même fichier.
