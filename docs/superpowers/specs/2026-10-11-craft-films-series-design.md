# Craft-style ad films series (with Yoka) — design

Date: 2026-10-11 · Status: approved in conversation, awaiting spec review

## Goal

Four new procedural ad films, one per hand-craft animation technique the `ad-film` skill does not
have yet: shadow puppets, cut paper, woodcut, clay. Each one adds a reusable house style to the
skill (a style engine + a reference project), the same way 8-bit RPG, kinetic typography and the
90s OS did. The family cast (Michał, Kasia, their son) gains a recurring background character:
**Yoka**, the family's miniature schnauzer.

Success: each film passes the `ad-film` "done" list (gate green; master + phone transcode + HTML +
shots.md; Story 9:16 + 4:5; Polish caption copy), PL and EN versions, and the style is documented in
`.claude/skills/ad-film/SKILL.md` §1d plus its pitfalls in `PITFALLS.md`.

## Decisions taken with the user

| Decision | Choice |
|---|---|
| Techniques | all four: shadow puppets, cut paper, woodcut, clay |
| Yoka's role | **always background** — present in every film, one small reaction per beat, never drives the plot, never covers the app UI or captions |
| Family | the caricature cast (Michał, Kasia, son), leads in every film |
| Build order | sequential, simplest render first: shadow → paper → woodcut → clay (option A) |
| Look test | approved as "basically similar": `D:\Work\tools\films\craft-sheet\.tmp\craft-sheet.png` |
| Length / format | ~30 s, 9:16 1080×1920, PL + EN (`ad-film` defaults) |

## Feature per film

| # | Technique | Story (family leads) | Yoka beat | Feature (wiki) |
|---|---|---|---|---|
| 1 | Shadow puppets | a double charge as a shadow's doppelgänger | growls at the double | anomaly alerts — `docs/wiki/features/anomaly-alerts.md` |
| 2 | Cut paper | Michał reads "CENY ROSNĄ!", the app says what to stock up on | runs off with a scrap of newspaper | Inflation Shield — `docs/wiki/features/inflation-shield.md` |
| 3 | Woodcut chronicle | each month "tribute collectors" (forgotten subscriptions) come to the gate | barks at every stranger at the gate | subscription manager — `docs/wiki/features/subscription-manager.md` |
| 4 | Clay | Kasia scans a long receipt, items sort themselves into categories | pulls the leash at the shop, sleeps at home | receipt category auto-split — `docs/wiki/features/receipt-category-split.md` |

Films 2–4 get their own storyboard pass (premise → beats → approval) when their turn comes; this
spec fixes only their feature and Yoka's beat.

## Yoka — model sheet

- **Silhouette first** (the shadow film depends on it): rectangular muzzle, spade beard, brow tufts
  projecting forward, folded triangular ears, short upright tail, straight thin legs.
- **Colour**: black body; silver beard, brows, muzzle underside, chest and legs; pink tongue; red
  collar (doubles as the woodcut's second colour).
- **Size**: head top below Michał's knee (user correction; the sheet puts her withers at ~0.18 of
  his height).
- **Three states**: *home* — lying, eyes closed; *street* — rearing on a taut leash, ears back,
  tongue out; *stranger* — legs planted, hackles up, snarl under the beard, "HAU!".
- Source of truth for proportions: `D:\Work\tools\films\craft-sheet\cast.js` (`yoka(pose)`).

## Film 1 — "Podwójny cień" (shadow puppets)

### Truth (from the wiki and `user_docs/pl/31-anomaly-alerts.md`)

- The alert fires when **the same merchant charged the same amount twice within two days**.
- Push title (app wording): **„Możliwa podwójna płatność”**; body: „{merchant} pobrał {amount}
  {currency} dwa razy w ciągu dwóch dni.”
- No configuration is needed; at most 3 pushes a day.
- The app **warns**; it does not refund or cancel anything. The film may claim "noticed in time,
  checked" — never "the app got the money back".
- Example values: Piekarnia, 48,00 zł (illustrative, not a real merchant brand).

### Beats (~30 s, turn at 40 %)

| t | Picture | Yoka |
|---|---|---|
| 0–4 s | Night, the house in silhouette, a moon. Cartouche „Pewnej nocy…” (frame 0 already drawn) | asleep by the door |
| 4–11 s | By day Michał pays at the bakery: a coin „48,00 zł” flies to the baker. At night an exact **double** of the baker's shadow steps out and carries off a second identical coin. Cartouche „Ten sam sklep. Ta sama kwota. Dwa razy.” | an ear twitches |
| **12 s turn** | The phone lights up — the only colour in the film (warm brand accent). Push „Możliwa podwójna płatność”; magnifier on „Piekarnia pobrał 48 PLN dwa razy w ciągu dwóch dni.” (app template verbatim) | jumps up, growls at the double, one short „HAU!” |
| 13–24 s | The family wakes; Michał opens the alert, the two identical charges side by side. The double is lifted off the screen like a paper puppet off its rod. Cartouche „Sprawdzone, zanim pieniądze zniknęły.” | back asleep, content |
| 27–30 s | Poster: app icon, „AI Budżet — alerty bez konfiguracji”, Google Play. Nothing moves; CTA complete by duration − 3 s | — |

### Look

Lotte Reiniger: ink-black silhouettes (`#170E08`) on a backlit amber screen, lace-like cut-outs
(eyes, glasses lenses, buttons, Yoka's beard strands and brow line), visible hinge pins and rods, a
soft penumbra copy behind each puppet, a carved frame with a cut-paper arch. The phone is the only
colour. Captions in silhouette cartouches; cap height ≥ 48–56 px, nothing must-read in the bottom
20 %.

### Build

- Project `D:\Work\tools\films\cien-podwojny\` (+ `-en`), harness copied from `okna-95`: cues
  authored in beats (`tools/gen-cues.py`), `src/strings.js` with PL and EN tables, HyperFrames
  render, `tools/deliver.cjs`, `HANDOFF.md` kept current.
- Engine `src/engine/shadow.js`, grown from `craft-sheet/styles.js` `shadow`: an offscreen
  silhouette layer, `destination-out` cut-outs, pins, rods, penumbra, the amber screen and frame.
- Cast from `craft-sheet/cast.js`, extended with the poses the beats need (Michał paying, holding
  the phone; the baker and his double; family waking) — scenes call the cast, never copy it.
- Score by a background agent from the previous film's `audio/synth.py`: music-box tone —
  xylophone/celesta, pizzicato, a low drone under the double, a sting on the turn.
- Deliverables per `ad-film` §4 and §6: `docs/marketing/creatives/anomaly-alerts/renders/pl/`,
  `docs/marketing/scripts/build_anomaly_alerts_story.py`,
  `docs/marketing/copy/feature-anomaly-alerts-film-pl.md` (all local-only, gitignored).

### Risks

- Silhouette readability at feed size: Kasia's curls merged into a lump on the sheet — her hair edge
  needs bigger scallops; every character must read in pure black.
- The double must read as "the same" — identical puppet, mirrored timing, not a different villain.
- The phone screen is tiny in a wide shot: the payoff needs the magnifier.

## After each film

Add the style row to `ad-film` SKILL.md §1d, every re-do-costing defect to `PITFALLS.md`, and update
the memory note `project_yoka_dog_character.md` with what is done.
