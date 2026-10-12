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

## Film 2 — "Tarcza z papieru" (cut paper)

Approved in conversation 2026-10-11. Film 1 shipped (ABA-665); its lessons in `ad-film/PITFALLS.md` apply from
the start (app strings read from the app's source and guarded by a truth test; shared geometry placed once before
scene agents; bed/sitting poses in profile).

### Truth (from `docs/wiki/features/inflation-shield.md`, `user_docs/pl/40-inflation-shield.md`, the app strings)

- The forecast comes ONLY from the user's own scanned receipts; free on every tier; no AI.
- It recommends stocking up only on **long-shelf-life** goods (`isStockpileable`); never milk or other perishables.
  The example product is whole-bean coffee („Kawa ziarnista”).
- Every saving is an **estimate** — always „~” and „szacunkowo” (the engine halves the end-gap on purpose).
- The **push never carries money**: title `inflationShieldTitle` „Czas na zapasy?”, body `inflationShieldBody`
  „Ceny "Kawa ziarnista" rosną o ok. 6%/miesiąc — to dobry moment, żeby zrobić zapas.” (server template, verbatim).
- In-app copy (mobile `inflationShield.*`, verbatim, laid out as `app/inflation-shield/index.tsx` does): `title`
  „Tarcza antyinflacyjna”; a card with the product name „Kawa ziarnista” and „+6%” in its header, then `buyAheadTip`
  filled with `units` only — „Kup 4 szt teraz — oszczędź ~12,00 zł”, then `atStore` „w {{store}}”; the hero
  `savedSoFar` · `estimated` — „Dotychczas zaoszczędzono · szacunkowo”.
- The app **suggests**; the family buys. Example values: +6%/month, 4 pcs, ~12 zł, a generic store name.

### Beats (~30 s, turn at 12.0)

| t | Picture | Yoka |
|---|---|---|
| 0–4 s | A paper kitchen; Michał at breakfast reads a newspaper whose headline is cut-out letters „CENY ROSNĄ!” (frame 0 is the cover) | lying under the table |
| 4–8 s | Paper price tags on the coffee shelf peel off and stack, each higher; a paper arrow climbs; Kasia frowns | runs off with a scrap of the newspaper |
| 8–12 s | Kasia opens the drawer of their receipts; the paper receipts fly into the phone; caption „Z Twoich paragonów” | — |
| **12 s turn** | The phone unfolds like a pop-up book: push „Czas na zapasy?”, the body in a lens | ears up |
| 13–21 s | The card „Kawa ziarnista +6%” / „Kup 4 szt teraz — oszczędź ~12,00 zł” in a lens; Michał puts 4 packs in a paper basket; the climbing price arrow hits a paper shield | — |
| 21–25 s | The shelf tag climbs again — the family's pantry already holds 4 packs; „Dotychczas zaoszczędzono · szacunkowo — ~12,00 zł” | asleep on the newspaper scrap |
| 27–30 s | Poster: „AI Budżet — Tarcza antyinflacyjna”, „Pobierz za darmo”, Google Play · przeglądarka | — |

### Look

Cut paper (the approved look test, `craft-sheet` `paper`): flat coloured paper layers with soft drop shadows, paper
grain, torn edges, a light fibre edge; newspaper collage letters; a pop-up-book unfold for the phone. The phone and the
app UI are drawn as the app looks (white cards, brand orange). Captions on torn paper strips.

### Build

Project `D:\Work\tools\films\tarcza-papier\` (+ `-en`), harness copied from `cien-podwojny` (tests included); engine
`src/engine/paper.js` from `craft-sheet/styles.js` `paper` (layers, wobble, grain, shadow; phone, push, lens, cards);
the polygon cast reused with a paper renderer; new sets: kitchen, coffee shelf, pantry. Score: a light paper ragtime
(piano, pizzicato, paper rustles). Truth test reads `inflationShield*` from the server and the mobile locales.
Deliverables per `ad-film` §4/§6 under `docs/marketing/creatives/antinflation/renders/` (the existing Inflation Shield campaign folder).

## After each film

Add the style row to `ad-film` SKILL.md §1d, every re-do-costing defect to `PITFALLS.md`, and update
the memory note `project_yoka_dog_character.md` with what is done.

## Film 3 — "Kronika daniny" (woodcut)

Approved in conversation 2026-10-12. Films 1–2 shipped (ABA-665, ABA-667); their PITFALLS rows apply (app strings read
from the app's source by a truth test; shared geometry placed once before scenes; an implied action needs a pose and a
prop in the hands; every cast member present where the story says so; feed-size text only in a lens or a big page).

### Truth (from `docs/wiki/features/subscription-manager.md`, `user_docs/pl/29-subscription-manager.md`, the app strings)

- Subscriptions are **not detected automatically** — the user lists them (by hand, or from Fat Finder). The film shows
  Michał writing them down once.
- A push **3 days before** each renewal. Server templates, verbatim: `subscriptionReminderTitle` „{name} odnawia się za
  3 dni”, `subscriptionReminderBody` „{amount} {currencyCode} zostanie pobrane za {name}” → „Kino+ odnawia się za 3 dni”
  / „43,00 PLN zostanie pobrane za Kino+”.
- The screen (`apps/mobile/app/subscriptions/index.tsx`, mobile `subscriptionManager.*`): header `monthlyTotal`
  „Miesięczny koszt” with the sum of ACTIVE subscriptions' monthly equivalents and `activeCount`; rows with name,
  amount · cycle, `renewalInDays` „Odnawia się za 3 dni” (warning colour at ≤ 3 days); an inactive row shows
  `inactive` „Nieaktywna” and leaves the total.
- **The app does not cancel anything.** The family cancels the service itself and marks it inactive in the app.
- Example values (invented names, no real brands): Kino+ 43,00 · Muzyka 23,99 · Siłownia 129,00 · Chmura 9,99, all
  monthly → 205,98 zł; without Kino+ → 162,98 zł.

### Beats (~30 s, turn at 12.0)

| t | Picture | Yoka |
|---|---|---|
| 0–4 s | Cover: a woodcut of the family's little castle; cartouche „Kronika rodu. Rok 2026.” | asleep by the gate |
| 4–8 s | Each month hooded "tribute collectors" come to the gate, a plaque on each (Kino+, Muzyka, Siłownia, Chmura); red coin trickles leave the family chest | barks at each stranger |
| 8–12 s | Michał writes the collectors into the chronicle — the phone; cartouche „Spisz ich raz.” | — |
| **12 s turn** | The phone lights red; lens on the push „Kino+ odnawia się za 3 dni” / „43,00 PLN zostanie pobrane za Kino+” | ears up |
| 13–21 s | „Kino+? Nikt tego nie ogląda.” Michał himself closes the gate on the Kino+ collector; lens on the screen: Kino+ „Nieaktywna”, „Miesięczny koszt” 205,98 → 162,98 zł | chases the collector to the gate |
| 21–27 s | The chest no longer leaks; the family at the table; cartouche „Wiesz, kto i kiedy przyjdzie.” | asleep |
| 27–30 s | Poster: „AI Budżet — Menedżer subskrypcji”, „Pobierz za darmo”, ai-budget.pl · Android · przeglądarka | — |

### Look and build

Two-colour lino print (the approved `craft-sheet` `woodcut`): black + one red on ivory paper, gouged black masses,
hatched light areas, carved ground strokes, a chronicle border; red only for money, the phone and the app. Project
`D:\Work\tools\films\kronika-daniny\` (+ `-en`), harness copied from `tarcza-papier`; engine `src/engine/woodcut.js`
from `craft-sheet/styles.js` `woodcut`. Score: a medieval chronicle tune (recorder/shawm, lute, frame drum). Truth test
reads the two push templates and `subscriptionManager.*`. Deliverables under `docs/marketing/creatives/subscription-tracker/renders/`.

## Film 4 — "Ulepione z paragonu" (clay)

Approved in conversation 2026-10-12.

### Truth (from `docs/wiki/features/receipt-category-split.md`, `user_docs/pl/04-voice-and-receipt.md`, the app strings)

- One scanned receipt is split across categories by its own lines; the confirm screen shows `receipt.scannedTitle`
  „Paragon zeskanowany”, `receipt.totalAmount` „Łączna kwota”, a chip row titled `receiptCategorySplit.title`
  „Podział na kategorie”, the action `receiptCategorySplit.edit` „Zmień kategorie”, and `receipt.saveExpense`
  „Zapisz wydatek”. Nothing is saved before that tap.
- A correction is remembered for the next scan of the same product. When the lines do not add up to the total, the app
  refuses to split (not shown, never contradicted).
- Example: `PARAGON FISKALNY`, `SUMA PLN 240,00` = Spożywcze 180 · Chemia domowa 35 · Zdrowie 25 (no alcohol: the son
  is in the shot). No shop name.

### Beats (~30 s, turn at 12.0)

| t | Picture | Yoka |
|---|---|---|
| 0–4 s | Cover: a clay shop; Kasia and the son at the till; the till squeezes out an endless receipt | pulls the leash to the door |
| 4–9 s | At home the receipt reaches the floor, „PARAGON FISKALNY … SUMA 240,00”; Kasia: „Jedzenie, chemia, apteka… wszystko w jednym?” | asleep on the rug |
| 9–12 s | Kasia photographs the receipt with the phone | — |
| **12 s turn** | The receipt's lines peel off as clay rolls and roll into three labelled clay bowls | opens one eye |
| 13–21 s | Lens: „Paragon zeskanowany”, chips „Podział na kategorie” Spożywcze 180 · Chemia domowa 35 · Zdrowie 25, „Łączna kwota 240 zł”; Kasia taps „Zapisz wydatek” | — |
| 21–27 s | The son moves one ball to another bowl („Zmień kategorie”); cartouche „Zapamięta na następny raz.” | asleep |
| 27–30 s | Poster: „AI Budżet — Podział paragonu na kategorie”, „Zeskanuj pierwszy paragon”, ai-budget.pl · Android · przeglądarka | — |

### Look and build

Clay (the approved `craft-sheet` `clay`): soft volume, key light, specular, thumbprints, contact shadows; a pastel set.
Project `D:\Work\tools\films\ulepione-z-paragonu\` (+ `-en`), harness copied from `tarcza-papier`; engine
`src/engine/clay.js` from `craft-sheet/styles.js` `clay`, cached per static piece (blur filters are expensive). Score: a
bouncy stop-motion tune (marimba, tuba, kazoo, squelches). Truth test reads `receipt.*` and `receiptCategorySplit.*`.
Deliverables under `docs/marketing/creatives/receipt-auto-split-categories/renders/`.
