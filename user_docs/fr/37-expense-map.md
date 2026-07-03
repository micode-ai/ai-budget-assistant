# Carte des Dépenses

Consultez vos dépenses sur une carte. Les dépenses peuvent porter une localisation — reprise de l'adresse du magasin imprimée sur un ticket de caisse scanné, du GPS de votre téléphone au moment où vous ajoutez une dépense, ou placée manuellement — et l'application peut afficher n'importe quelle liste filtrée de dépenses sous forme d'épingles cliquables sur une carte.

## D'où viennent les localisations

Une dépense obtient sa localisation à partir de l'une de ces trois sources (la priorité la plus haute l'emporte) :

1. **Épingle manuelle** — vous placez ou déplacez vous-même l'épingle sur l'écran de localisation de la dépense.
2. **Adresse du ticket** — lorsque vous scannez un ticket de caisse, l'application lit l'adresse du magasin qui y est imprimée et la convertit automatiquement en coordonnées cartographiques. Cela fonctionne même si vous scannez le ticket plus tard, chez vous.
3. **GPS au moment de la saisie** — en option, l'application peut joindre silencieusement votre position actuelle lorsque vous ajoutez une dépense sur place (saisie manuelle, saisie vocale ou capture automatique par notification bancaire).

Les transactions importées (fichiers CSV/PDF bancaires) n'obtiennent pas de localisation.

## Activer la capture GPS

La capture GPS est **désactivée par défaut**. Pour l'activer :

1. Ouvrez **Paramètres → Données et rapports**.
2. Dans la section **Localisation**, activez **Joindre la localisation aux nouvelles dépenses**.
3. Autorisez la permission de localisation lorsque le système la demande.

Une fois activée, les nouvelles dépenses que vous ajoutez en déplacement récupèrent automatiquement votre position actuelle. Vous pouvez toujours consulter et supprimer la localisation d'une dépense, et désactiver l'interrupteur à tout moment.

## Vue carte dans l'onglet Dépenses

Dans l'onglet **Dépenses**, appuyez sur l'icône de carte à côté de l'icône de recherche pour passer de la liste à la carte. La carte affiche les mêmes dépenses que la liste — vos filtres de période, de catégorie et de marchand s'appliquent tous. Appuyez de nouveau sur l'icône pour revenir à la liste.

- Les dépenses proches sont regroupées en clusters numérotés ; appuyez sur un cluster pour zoomer.
- Appuyez sur une épingle pour voir le marchand et le montant ; appuyez sur **Ouvrir** pour accéder à cette dépense.
- Si certaines dépenses filtrées n'ont pas de localisation, une petite bannière indique combien.

## Localisation sur l'écran de la dépense

Lorsqu'une dépense a une localisation, son écran de détail affiche une petite carte avec l'épingle et l'adresse (ou les coordonnées). Depuis là, vous pouvez :

- **Modifier la localisation** — ouvre une carte en plein écran où vous pouvez appuyer pour placer l'épingle, la faire glisser, ou utiliser **Ma position** pour vous rendre à l'endroit où vous êtes.
- **Supprimer la localisation** — l'icône de corbeille à côté de la carte supprime l'épingle en un seul geste.

Une dépense sans localisation affiche à la place un bouton **Ajouter une localisation** (éditeurs uniquement).

## Carte du voyage

Les comptes voyage disposent d'un point d'accès dédié : ouvrez le compte voyage et appuyez sur **Carte du voyage**. L'application bascule sur ce voyage et ouvre l'onglet Dépenses en mode carte — un journal visuel de l'endroit où l'argent du voyage a été dépensé. Combiné au scan de tickets et à la capture GPS, la plupart des dépenses de voyage se retrouvent automatiquement sur la carte.

## Confidentialité

- La capture GPS est strictement optionnelle et désactivée par défaut ; la permission n'est demandée que lorsque vous activez l'interrupteur.
- La recherche d'adresse à partir du ticket utilise uniquement l'adresse imprimée sur le reçu — aucune localisation du téléphone n'est impliquée.
- Une localisation fait partie de l'enregistrement de la dépense : les membres d'un compte partagé qui peuvent voir la dépense voient aussi sa localisation.
- Vous pouvez supprimer la localisation de n'importe quelle dépense à tout moment.
