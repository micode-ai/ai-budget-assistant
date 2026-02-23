# Widgets de l'écran d'accueil

> Ajoutez des widgets Android à votre écran d'accueil pour accéder instantanément à vos données de dépenses, ou pour enregistrer une dépense sans ouvrir l'application.

## Qu'est-ce qu'un widget ?

Les widgets sont de petits panneaux interactifs sur votre écran d'accueil Android. AI Budget Assistant propose quatre widgets :

| Widget | Taille | Contenu |
|--------|--------|---------|
| **Budget – Aujourd'hui** | Petit | Total des dépenses du jour + variation par rapport à hier |
| **Budget – Semaine** | Moyen | Graphique à barres des 7 derniers jours |
| **Budget – Vue d'ensemble** | Grand | Progression du budget + catégories principales |
| **Budget – Ajout rapide** | Bande compacte | Trois boutons d'accès direct |

> **Android uniquement.** iOS ne prend pas en charge les widgets d'écran d'accueil. Toutes les fonctionnalités sont disponibles dans l'application.

---

## Comment ajouter un widget

1. **Appuyez longuement** sur une zone vide de l'écran d'accueil
2. Appuyez sur **Widgets**
3. Faites défiler jusqu'à **AI Budget Assistant**
4. **Appuyez longuement** sur le widget souhaité et faites-le glisser sur l'écran
5. Relâchez pour le placer

---

## Budget – Aujourd'hui (Petit)

Un aperçu rapide de la journée :

- **Total du jour** en dépenses
- **Indicateur de variation** par rapport à hier (vert = moins, rouge = plus)

**Taille** : 110 × 40 dp. Appuyez sur le widget pour ouvrir l'application.

---

## Budget – Semaine (Moyen)

Un aperçu hebdomadaire en un coup d'œil :

- **Graphique à barres** des dépenses de chacun des 7 derniers jours
- **Total du jour** sous le graphique

**Taille** : 250 × 110 dp. Appuyez sur le widget pour ouvrir l'application.

---

## Budget – Vue d'ensemble (Grand)

Votre tableau de bord financier sur l'écran d'accueil :

- **Barres de progression** pour chaque budget actif
- **Principales catégories de dépenses** avec les montants de la période en cours

**Taille** : 250 × 180 dp. Appuyez sur le widget pour ouvrir l'application.

---

## Budget – Ajout rapide

Commencez à saisir une dépense en un seul appui, sans ouvrir l'application.

```
┌──────────────────────────────────────────────┐
│  🎤 Voix  │  📷 Scanner  │  ✏️ Saisie man.  │
└──────────────────────────────────────────────┘
```

| Bouton | Action |
|--------|--------|
| 🎤 **Voix** | Ouvre l'écran d'enregistrement vocal |
| 📷 **Scanner** | Ouvre le scanner de reçus |
| ✏️ **Saisie manuelle** | Ouvre le formulaire de saisie manuelle |

**Taille** : 250 × 60 dp. Aucune actualisation en arrière-plan — aucun impact sur la batterie.

---

## Fréquence d'actualisation

| Widget | Intervalle |
|--------|-----------|
| Budget – Aujourd'hui | Toutes les 30 minutes |
| Budget – Semaine | Toutes les 30 minutes |
| Budget – Vue d'ensemble | Toutes les 30 minutes |
| Budget – Ajout rapide | Statique |

---

## FAQ

**Q : Pourquoi les widgets n'apparaissent-ils pas dans le sélecteur ?**
R : Assurez-vous que l'application est installée et que vous vous êtes connecté au moins une fois.

**Q : Le widget affiche « Aucune donnée ». Que faire ?**
R : Ouvrez l'application et ajoutez au moins une dépense, ou attendez le prochain cycle de synchronisation. Vous pouvez synchroniser manuellement dans **Paramètres → Synchroniser maintenant**.

**Q : Puis-je redimensionner les widgets ?**
R : Aujourd'hui et Ajout rapide ont une taille fixe. Semaine peut être redimensionné horizontalement. Vue d'ensemble peut être redimensionné horizontalement et verticalement.
