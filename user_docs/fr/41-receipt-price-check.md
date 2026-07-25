# Vérification des prix du ticket — est-ce plus cher que d'habitude ?

> Juste après avoir scanné un ticket de caisse, chaque article est comparé au prix médian que vous avez déjà payé pour ce même produit dans ce même magasin — pour repérer une remise non appliquée pendant que vous êtes encore à la caisse.

## De quoi s'agit-il

Chaque ticket que vous scannez est discrètement comparé à votre propre historique d'achats : le prix médian que vous avez payé pour ce produit précis, dans ce magasin précis, au cours des 12 dernières semaines. Quand une ligne coûte nettement plus cher que ça, c'est signalé immédiatement — pendant que vous pouvez encore demander à la caisse ou regarder dans votre sac, pas enfoui dans un rapport que vous n'ouvrirez jamais.

C'est du simple calcul sur vos propres tickets passés. Aucune IA n'intervient, et il n'y a rien à activer ni à configurer.

## Ce que cette fonctionnalité ne dit jamais

Elle n'affirme jamais que vous avez été surfacturé, arnaqué, ou qu'une remise vous a été délibérément refusée — un ticket ne peut rien prouver de tel. S'il n'y a aucune ligne de remise imprimée, rien n'indique qu'il devait y en avoir une, donc l'application n'accuse jamais. La formulation est toujours la même, honnête : **plus cher que d'habitude — ça vaut la peine de vérifier le ticket**. Une promotion qui ne s'est silencieusement pas appliquée est la cause réelle la plus fréquente, et cette formulation la met en lumière sans pointer du doigt le magasin.

Ce que l'application vous montre, c'est ce qu'elle a **trouvé** au-dessus de vos prix habituels — jamais ce que vous avez **économisé**, car il n'y a aucun moyen de savoir si vous avez réellement agi en conséquence.

## Où vous le verrez

- **Juste après avoir scanné un ticket** — une carte du type « 2 articles coûtent plus cher que d'habitude », avec en dessous « Environ 6,20 zł de plus que ce que vous payez habituellement ici — ça vaut la peine de vérifier le ticket ». Appuyez dessus pour voir chaque produit signalé : ce que vous payez habituellement, ce que vous avez payé cette fois, et la différence. Cela ne vous empêche jamais d'enregistrer le ticket et ne modifie jamais un montant à votre place — c'est une information, pas une correction.
- **Dans les bots de chat** (Telegram, WhatsApp, Slack) — scanner un ticket via un bot ajoute une ligne supplémentaire au message de confirmation quand quelque chose a été trouvé, car les scans par bot passent exactement par la même vérification que l'application.
- **Dans l'onglet Analyse** — une ligne indiquant « Trouvé X au-dessus de vos prix habituels cette année », affichée uniquement quand quelque chose a effectivement été trouvé.
- **Dans vos alertes** — chaque ticket scanné avec une découverte peut aussi apparaître comme une alerte dans votre cloche, pour que vous n'ayez pas à y penser vous-même.

## Quelle confiance accorder à une découverte

Un produit a besoin d'au moins **deux** achats précédents dans le même magasin avant que la vérification ne dise quoi que ce soit à son sujet — elle reste donc silencieuse un moment sur un compte tout neuf, et devient plus précise à mesure que vous scannez. Une découverte basée sur exactement deux achats précédents est signalée comme « **basé sur seulement deux achats précédents** », pour que vous sachiez quel poids lui accorder ; trois achats précédents ou plus constituent un signal plus solide.

## Ce qui est comparé — et ce qui ne l'est délibérément pas

- Seulement **le même produit dans le même magasin**. Un prix dans une boutique n'est jamais comparé au même produit acheté ailleurs.
- Seulement **la même devise** — rien n'est jamais converti pour cette comparaison.
- Des tailles de conditionnement différentes comptent comme des produits différents : le scanner conserve la taille dans le nom du produit (par exemple « Mleko Łaciate 3,2 % 1L »), donc une bouteille de 1 L et une de 0,5 L sont suivies séparément — exactement comme il se doit.
- Un bond de prix énorme est délibérément ignoré plutôt que signalé — il est bien plus probable qu'il s'agisse d'un produit différent (ou d'une ligne mal lue) que d'un véritable changement de prix.

## Le total annuel

Si quelque chose a déjà été trouvé dans plusieurs devises, l'onglet Analyse n'affiche qu'un seul total — votre propre devise, si quelque chose y est apparu, sinon le montant unique le plus élevé. Les montants ne sont jamais additionnés entre devises, car cela impliquerait de convertir de l'argent, ce que cette fonctionnalité se garde bien de jamais faire.

## À noter

- Fonctionne automatiquement sur chaque ticket scanné — par appareil photo, depuis la galerie, en PDF, et sur les reçus scannés via Telegram, WhatsApp ou Slack.
- Une découverte n'empêche jamais d'enregistrer le ticket et ne modifie jamais un montant à votre place.
- Les prix et les différences sont affichés dans la devise propre du ticket.
