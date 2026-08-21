---
title: "Que se passe-t-il si votre banque n'est pas dans la liste"
meta_description: "Votre banque n'est pas dans la liste ? Découvrez comment l'IA reconnaît les colonnes d'un CSV ou lit un relevé PDF pour importer presque n'importe quelle banque."
target_keyword: "importer relevé de n'importe quelle banque"
slug: "importer-releve-nimporte-quelle-banque"
pair: "ai-bank-import"
lang: "fr"
date: "2026-08-20"
---

# Que se passe-t-il si votre banque n'est pas dans la liste

Vous importez votre fichier en espérant que l'application aligne les colonnes automatiquement, et à la place vous obtenez un écran de correspondance, ou pire, une liste de transactions vide. Votre banque ne fait simplement pas partie de celles que l'application reconnaît d'emblée. C'est une déception classique, surtout au moment où vous venez de décider de rattraper plusieurs mois de dépenses en un seul import, et que le fichier d'une petite banque, d'un service de change ou d'une caisse coopérative locale refuse de se ranger en colonnes propres.

La bonne nouvelle, c'est que "pas dans la liste" ne veut pas dire "impossible à importer". Cet article explique précisément ce qui se passe en coulisses quand AI Budget Assistant ne reconnaît pas le format d'un fichier, et pourquoi le mécanisme qui prend alors le relais est plus sûr qu'il n'y paraît au premier abord.

## Pourquoi aucune liste de banques n'est jamais complète

Toute application de budget qui prend en charge l'import doit décider dès le départ quelles banques elle reconnaît directement. AI Budget Assistant détecte automatiquement mBank, PKO, Revolut, ING, Millennium et Pekao, ainsi que Wise et les relevés PDF d'Erste et Alior. Cela couvre la plupart des comptes courants en Pologne, mais les comptes bancaires ne se limitent pas aux grands noms. Il existe des banques plus petites, des comptes professionnels avec un export non standard, des comptes à l'étranger, et des exports d'autres applications financières que quelqu'un essaie de récupérer en changeant d'outil.

Maintenir un analyseur dédié pour chacun de ces formats pour toujours n'est pas réaliste, et tout nouveau format resterait "non pris en charge" un moment avant que quelqu'un ne le remarque et n'écrive une règle pour lui. Plutôt que d'attendre que la liste finisse par inclure votre banque, l'application dispose donc d'un mécanisme qui essaie de comprendre lui-même la structure d'un fichier qu'il n'a jamais vu.

## Ce qui se passe quand un fichier n'est pas reconnu

Quand vous importez un CSV ou un fichier XLSX et qu'aucun des analyseurs intégrés ne reconnaît sa disposition, un modèle d'IA entre en jeu. Sa tâche est étroite et précise : il ne lit ni les montants ni les dates lui-même, il indique seulement **quelle colonne est laquelle** - laquelle contient la date de l'opération, laquelle le montant, laquelle la description ou le nom du commerçant. Ces noms de colonnes sont ensuite vérifiés, mot pour mot, par rapport aux en-têtes réellement présents dans votre fichier. Si le modèle "inventait" une colonne absente du fichier, la réponse entière est rejetée, jamais acceptée en silence. Ce n'est qu'après cette vérification que les mêmes règles déterministes qui gèrent le mappage manuel des colonnes lisent réellement les chiffres et les dates du fichier.

Pour les relevés PDF, une fonctionnalité du plan Pro, le mécanisme fonctionne différemment, car on ne peut pas simplement extraire des noms de colonnes d'un PDF - le modèle doit extraire directement les lignes de transactions à partir du texte tiré de la page. C'est le même type de tâche que faisaient déjà les analyseurs écrits à la main pour Erste ou Alior, sauf qu'au lieu d'un code dédié pour chaque banque, le modèle se débrouille avec une disposition que personne n'a encore décrite.

## Ce que ce mécanisme ne fait jamais

Cette distinction compte, car on pense facilement que "l'IA importe le relevé" signifie que le modèle devine simplement les chiffres. Ce n'est pas le cas. Côté CSV et XLSX, le modèle ne renvoie jamais un montant ni une date - il ne renvoie que des noms de colonnes, et ceux-ci sont toujours comparés aux véritables en-têtes de votre fichier. Les chiffres et les dates sont lus par le même code prévisible qui gère le mappage manuel des colonnes depuis des années. Cela fait de ce mécanisme un assistant pour reconnaître la structure, pas quelqu'un qui saisit vos dépenses au jugé.

Cela ne garantit toujours pas une précision parfaite du premier coup - aucun mécanisme de reconnaissance de format ne le fait. C'est pourquoi, avant que quoi que ce soit n'atteigne votre budget, vous obtenez un aperçu à vérifier, ce dont il est question plus bas.

## Ce que vous voyez et ce que vous acceptez avant que rien ne quitte votre téléphone

Avant qu'un seul morceau du fichier n'atteigne le modèle d'IA, l'application demande votre consentement, une fois par compte, et vous montre exactement ce qui sera envoyé. Pour un fichier CSV ou XLSX, il s'agit de la ligne d'en-tête plus dix lignes d'exemple au maximum - pas le fichier entier, ni tout votre historique de transactions. Pour un relevé PDF, ce sont les vingt premières lignes de texte extraites. Vous voyez cela sur l'écran de consentement avant que quoi que ce soit ne se passe, si bien que la décision est éclairée, pas par défaut.

Si votre compte dispose du chiffrement de bout en bout complet (le mode confidentialité totale de l'application), ce mécanisme ne s'active pas du tout. Des données que l'application elle-même ne peut pas déchiffrer ne peuvent pas non plus être envoyées à un modèle d'IA - ces comptes n'ont donc accès qu'au mappage manuel des colonnes, plus sûr, quoique demandant un geste de plus.

## Vous vérifiez et corrigez avant que quoi que ce soit ne soit enregistré

Une fois que le modèle propose un mappage, vous ne voyez pas un résultat brut sans contexte. Vous voyez une rangée de "puces" modifiables montrant ce qui a été reconnu, quelque chose comme "Date → Data operacji" ou "Montant → Suma transakcji". Si l'une d'elles est fausse, une option "Faux ? Corriger" ouvre le même mappeur manuel de colonnes, déjà pré-rempli avec la proposition du modèle, si bien que vous corrigez une colonne au lieu de repartir de zéro.

C'est la même étape d'aperçu qui accompagne chaque import dans AI Budget Assistant, que la banque ait été reconnue instantanément ou seulement avec l'aide de l'IA : une liste complète des transactions à vérifier avant que quoi que ce soit n'atteigne votre budget, avec des catégories déjà suggérées automatiquement selon le commerçant.

## La deuxième fois va plus vite

Une fois qu'un mappage de colonnes pour un format donné s'avère correct, sa structure - les noms de colonnes eux-mêmes et la façon dont les dates sont écrites, sans aucune de vos données personnelles ou de transaction - est enregistrée dans un dictionnaire global de formats. La personne suivante qui importe un relevé de cette même banque n'a même plus besoin de l'étape d'IA : le format est déjà reconnu d'emblée, comme mBank ou PKO. En un sens, vous êtes la première personne à "débloquer" votre format pour tous ceux qui viendront après vous.

## Comment l'essayer

Si vous avez quelque part un fichier d'une banque pour lequel vous avez abandonné l'import parce que l'application ne le reconnaissait pas, cela vaut la peine de réessayer. Importez le CSV, le XLSX ou le PDF dans [AI Budget Assistant](https://ai-budget.pl), et si aucun des analyseurs intégrés ne le reconnaît, vous verrez l'écran de consentement décrit plus haut au lieu d'une liste vide. Une fois que vous acceptez, vous obtenez un aperçu avec un mappage proposé à vérifier, comme pour tout autre import.

Le déroulé complet d'un import de relevé, de la récupération du fichier auprès de votre banque à l'évitement des doublons lors d'une réimportation, est détaillé dans notre guide [comment importer un relevé bancaire dans une appli de budget](/blog/fr/importer-releve-bancaire/). Si vous préférez ne pas vous occuper de fichiers du tout et laisser l'application enregistrer les dépenses directement à partir des notifications de paiement de votre banque, découvrez comment fonctionne [enregistrer ses dépenses automatiquement](/blog/fr/enregistrer-depenses-automatiquement/). L'application est gratuite dans le navigateur sur [ai-budget.pl](https://ai-budget.pl), sans carte bancaire requise, et disponible pour Android sur [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## FAQ : importer le relevé d'une banque qui n'est pas dans la liste

**Que se passe-t-il si ma banque n'est pas prise en charge directement ?**

Si vous importez un CSV ou un XLSX qu'aucun des analyseurs intégrés ne reconnaît, AI Budget Assistant essaie de déterminer lui-même quelle colonne est la date, laquelle le montant et laquelle la description, et vous montre le résultat à vérifier et corriger. Pour les relevés PDF (fonctionnalité Pro), le mécanisme extrait directement les lignes de transactions du texte du document. Dans les deux cas, vous obtenez un aperçu complet avant que quoi que ce soit ne soit enregistré.

**L'IA peut-elle se tromper et saisir un montant erroné ?**

Côté fichiers CSV et XLSX, le modèle d'IA ne lit jamais lui-même les montants ni les dates - il indique seulement quelle colonne est laquelle, et ces noms sont comparés aux véritables en-têtes de votre fichier, donc une colonne inventée est rejetée. Les chiffres eux-mêmes sont lus par le même mécanisme que le mappage manuel. Dans tous les cas, vous obtenez un aperçu de toutes les transactions avant l'enregistrement, pour vérifier et corriger ce qui semble incorrect.

**Le contenu de mon relevé est-il envoyé quelque part ?**

Avant qu'un seul fragment du fichier n'atteigne le modèle d'IA, vous voyez un écran de consentement, unique par compte, qui montre exactement ce qui sera envoyé : la ligne d'en-tête plus dix lignes d'exemple au maximum pour un CSV ou XLSX, ou les vingt premières lignes de texte pour un relevé PDF. Les comptes avec chiffrement de bout en bout complet n'utilisent pas du tout ce mécanisme, car l'application ne peut pas accéder à leurs données pour les envoyer au modèle.

**L'import assisté par IA fonctionne-t-il aussi bien que pour mBank ou PKO ?**

Cela dépend du format du fichier, mais le mécanisme est conçu pour s'améliorer avec le temps : quand le mappage de colonnes d'une nouvelle banque s'avère correct, la structure même du fichier (sans vos données) est enregistrée dans un dictionnaire global, si bien qu'un futur import de ce même format de banque n'a plus besoin de l'étape d'IA. Il reste toujours utile de vérifier l'aperçu avant de confirmer l'import, comme pour n'importe quelle autre banque.

---

*Articles liés : [Importer un relevé bancaire dans une appli de budget](/blog/fr/importer-releve-bancaire/) | [Enregistrer ses dépenses automatiquement, sans tout saisir](/blog/fr/enregistrer-depenses-automatiquement/)*
