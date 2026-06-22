---
title: "Importer un relevé bancaire dans une appli de budget"
meta_description: "Comment importer un relevé bancaire dans une appli de budget en quelques minutes. Récupérer le fichier, mapper les colonnes, éviter les doublons à la réimportation."
target_keyword: "importer un relevé bancaire"
slug: "importer-releve-bancaire"
pair: "bank-import"
lang: "fr"
---

# Importer un relevé bancaire pour rattraper des mois en minutes

La première cause d'abandon d'un budget, c'est la saisie manuelle. Noter chaque dépense à la main tient quelques semaines, puis on oublie un jour, puis une semaine, et le budget meurt en silence. L'importation d'un relevé bancaire règle ce problème d'un coup : elle remplit des mois de transactions en quelques minutes, sans rien taper. Cet article explique pourquoi l'import bat la saisie manuelle, comment récupérer le fichier auprès de votre banque, et comment importer proprement sans créer de doublons.

## Pourquoi l'import bat la saisie manuelle

La saisie manuelle a un défaut fatal : elle dépend de votre discipline jour après jour. Une seule journée oubliée crée un trou, et les trous découragent. Au bout de quelques semaines, la plupart des gens renoncent, persuadés de manquer de rigueur, alors que c'est la méthode qui était trop exigeante.

L'import inverse la logique. Votre banque a déjà enregistré chaque transaction, à l'euro et à la date près. Plutôt que de recopier ce travail, vous récupérez le fichier et vous le versez d'un bloc dans votre application de budget. Un relevé de trois mois se charge aussi vite qu'une seule dépense saisie à la main. Vous partez ainsi d'une base complète et exacte, sans le moindre trou.

## Récupérer le fichier auprès de votre banque

Presque toutes les banques permettent d'exporter l'historique d'un compte, généralement au format CSV ou PDF. Le chemin exact varie, mais il ressemble le plus souvent à ceci : connectez-vous à votre espace en ligne, ouvrez le compte concerné, cherchez l'historique ou les opérations, puis une option d'export ou de téléchargement.

Choisissez une période, par exemple les trois derniers mois pour démarrer, et téléchargez le fichier. Le **CSV** est le format idéal car ses colonnes sont structurées, mais beaucoup de banques ne proposent qu'un **PDF** de relevé, qui fonctionne aussi. Si vous avez le choix, prenez le CSV.

Conservez le fichier dans un dossier sûr le temps de l'importer. Une fois la procédure prise en main, vous referez cet export chaque mois en moins d'une minute.

## L'import pas à pas

La marche à suivre est presque toujours la même, quelle que soit l'application sérieuse.

**Téléversez le fichier.** Sélectionnez le CSV ou le PDF exporté depuis votre banque.

**Laissez détecter la banque, ou mappez les colonnes.** Une bonne application reconnaît le format de nombreuses banques et associe automatiquement les colonnes (date, libellé, montant). Si votre banque n'est pas reconnue, vous indiquez manuellement quelle colonne correspond à quoi. Ce mappage est mémorisé pour les imports suivants.

**Vérifiez l'aperçu.** Avant de valider, l'application affiche un aperçu des transactions détectées, avec une catégorie suggérée pour chacune. C'est le moment de corriger une catégorie ou de décocher une ligne que vous ne voulez pas importer.

**Confirmez.** Une fois l'aperçu vérifié, vous validez et les transactions rejoignent votre budget, déjà catégorisées et prêtes à être suivies.

L'ensemble prend quelques minutes pour des mois de données, là où la saisie manuelle aurait demandé des heures étalées sur des semaines.

## Éviter les doublons à la réimportation

La crainte la plus courante, c'est de réimporter et de tout compter en double. Deux périodes qui se chevauchent, ou un même fichier importé deux fois par mégarde, et le budget devient faux.

Une application solide gère cela par une détection des doublons : elle reconnaît une transaction déjà présente, par sa date, son montant et son libellé, et évite de l'ajouter une seconde fois. Vous pouvez ainsi réimporter sereinement, même avec un léger chevauchement de dates, sans gonfler artificiellement vos dépenses. C'est ce qui rend l'import mensuel pratiquement sans risque.

## Restez à jour avec un import mensuel

Une fois le premier import passé, prenez l'habitude d'exporter et d'importer une fois par mois. C'est l'équivalent d'un rapprochement bancaire, mais en quelques minutes au lieu d'une corvée. Votre budget reste ainsi toujours à jour, sans dépendre de votre constance quotidienne.

Ce rythme mensuel combine le meilleur des deux mondes : l'exactitude des données bancaires et la régularité d'une routine légère. Pour replacer cet import dans une démarche complète, notre guide sur le [suivi des dépenses](/blog/fr/suivi-des-depenses/) montre comment exploiter ces transactions une fois importées.

## L'import dans AI Budget Assistant

AI Budget Assistant prend en charge l'import de relevés sous plusieurs formes. Il reconnaît des banques comme mBank, PKO et Revolut, importe les fichiers Wise, et lit aussi les relevés au format PDF de banques comme Erste et Alior. Quand une banque n'est pas reconnue, le mappage manuel des colonnes permet d'importer n'importe quel CSV, et le réglage est mémorisé pour la fois suivante.

À l'import, l'application catégorise automatiquement les transactions, apparie les lignes de change pour les opérations multidevises, et détecte les doublons afin qu'une réimportation ne compte jamais deux fois la même dépense. Vous vérifiez l'aperçu, ajustez si besoin, et confirmez.

AI Budget Assistant est gratuit pour commencer, fonctionne dans le navigateur sur [ai-budget.pl](https://ai-budget.pl) sans carte bancaire, et est disponible sur [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant) pour Android. Importer votre premier relevé suffit souvent à voir, enfin, où part vraiment votre argent.

---

## FAQ : importer un relevé bancaire

**Quel format de fichier faut-il pour importer un relevé ?**

Le CSV est le format idéal, car ses colonnes sont structurées et faciles à mapper. Beaucoup de banques ne proposent toutefois qu'un relevé au format PDF, qui fonctionne aussi avec les applications capables d'en extraire le texte. Si votre banque offre le choix, prenez le CSV. Sinon, le PDF convient parfaitement pour la plupart des relevés courants.

**L'import va-t-il créer des transactions en double ?**

Pas avec une application qui détecte les doublons. Elle reconnaît une transaction déjà présente, par sa date, son montant et son libellé, et évite de l'ajouter une seconde fois. Vous pouvez donc réimporter même avec un chevauchement de dates sans gonfler vos dépenses. AI Budget Assistant intègre cette détection, ce qui rend l'import mensuel sûr.

**Peut-on importer un relevé de n'importe quelle banque ?**

Les banques courantes sont souvent reconnues automatiquement, ce qui mappe les colonnes pour vous. Pour les autres, le mappage manuel des colonnes permet d'importer n'importe quel CSV, et le réglage est mémorisé pour les fois suivantes. AI Budget Assistant reconnaît notamment mBank, PKO, Revolut et Wise, lit les relevés PDF d'Erste et Alior, et accepte les autres banques via le mappage manuel.

**Est-il sûr d'importer son relevé bancaire ?**

Importer un relevé consiste à téléverser un fichier que vous avez vous-même téléchargé depuis votre banque : il ne s'agit pas de partager vos identifiants bancaires ni de connecter votre compte. Vous gardez la maîtrise du fichier, vous vérifiez l'aperçu avant de valider, et aucune donnée de connexion n'est en jeu. C'est l'une des manières les plus sûres de rattraper des mois de transactions.

---

*Articles liés : [Suivi des dépenses : garder le contrôle au quotidien](/blog/fr/suivi-des-depenses/) | [Catégories de dépenses : la liste qui tient vraiment](/blog/fr/categories-de-depenses/)*
