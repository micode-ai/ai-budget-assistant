# Film 2 "Tarcza z papieru" (cut paper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 30 s, 9:16 cut-paper ad film about Inflation Shield (PL + EN), plus the reusable `paper` house style for the `ad-film` skill.

**Architecture:** A new film project copied from `D:\Work\tools\films\cien-podwojny\` (film 1: the same harness, its tests, its polygon cast with profile bed poses). The look is a new engine `src/engine/paper.js` grown from the approved look test `D:\Work\tools\films\craft-sheet\styles.js` (`paper`), replacing `shadow.js`; the cast is drawn by the paper renderer (colour fills, layered shadows, torn edges). Scenes call the engine, cast, sets and props; they never copy them.

**Tech Stack:** Canvas 2D in headless Chrome (puppeteer-core 25.12.0), HyperFrames 0.8.111, GSAP proxy timeline, Python 3 + numpy/scipy, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-11-craft-films-series-design.md` (section "Film 2 — Tarcza z papieru"). Binding: `.claude/skills/ad-film/SKILL.md`, `.claude/skills/ad-film/PITFALLS.md` (incl. the shadow-puppets section — most rows apply to any silhouette-like craft style).

## Global Constraints

- Projects `D:\Work\tools\films\tarcza-papier\` and `-en` — outside the repo, own git, `core.autocrlf=false`.
- 1080×1920, 30 s, 24 fps on twos, 120 bpm; shot boundaries on whole beats; turn at 12.0 s; poster from 27.0 s.
- Determinism: no `Math.random` / `Date`; every random draw seeded (`A.mulberry`, `A.hash`).
- Every visible string through `src/strings.js` (PL + EN, identical key sets). App strings VERBATIM and guarded by `tools/truth-test.cjs`, which reads them from the app's sources:
  - push = server `inflationShieldTitle` / `inflationShieldBody` (`apps/api/src/modules/notifications/notification-i18n.ts`): PL „Czas na zapasy?” / „Ceny "Kawa ziarnista" rosną o ok. 6%/miesiąc — to dobry moment, żeby zrobić zapas.”; EN "Time to stock up?" / "Whole-bean coffee prices are rising ~6%/month — now's a good time to stock up."
  - the shield screen = mobile `inflationShield.*` (`title`, `buyAheadTitle`, `buyAheadTip` filled with `units` only, `atStore`, `savedSoFar`, `estimated`), laid out as `apps/mobile/app/inflation-shield/index.tsx` does: card header „Kawa ziarnista” + „+6%”, action „Kup 4 szt teraz — oszczędź ~12,00 zł”, „w {{store}}”, hero „Dotychczas zaoszczędzono · szacunkowo”.
- Truth: the forecast comes only from the user's own receipts; long-shelf-life goods only (coffee, never milk); every saving is an estimate (always „~” / „szacunkowo”); the push carries no money; the app suggests, the family buys.
- Yoka: background only (one reaction per beat, never over the phone, a lens or a caption).
- Captions: font ≥ 66 px, inside x 60–1020 / y 220–1540, typed over 6 frames, done within 0.7 s, held to the cut (except 01: complete at frame 0); payoff text only in a lens (≥ 44 px, fully inside the circle).
- Deliverables: `docs/marketing/creatives/antinflation/renders/{pl,en}/` (gitignored; never `git add`); phone −14 ±1 LUFS, TP ≤ −1 dBFS; sync ≤ 40 ms; onsets ≤ 10 ms.

## Review Focus

1. **Paper figures read at feed size** — a paper figure is a stack of coloured parts; at 25 % the family must read as people (faces, Kasia's curls, Michał's beard + glasses), not as confetti. Pinned by the Task 3 cast sheet at 0.25 and the Task 9 whole-film sheet.
2. **The money is always an estimate and never in the push** — any „oszczędź”/„zaoszczędzono” string without „~” or „szacunkowo”, or a push body with an amount, is a truth defect. Pinned by `truth-test.cjs` (Task 1/9) checking the push template has no `{{save}}`/amount and every money string in `strings.js` starts with „~”.
3. **The pop-up phone stays legible during the unfold** — a phone drawn mid-fold can shear its text. Pinned in Task 6: the push is laid out flat and only the card is transformed; text appears only once the fold is ≥ 80 % open.
4. **EN has no Polish** — pinned by the EN literal scan + the key-parity check in `truth-test.cjs`.
5. **Seek determinism** with paper grain and torn edges — every wobble/grain seeded per part, not per frame order. Pinned by `seek-check.cjs`.

---

## Shot table

| n | id | beats | seconds | content |
|---|---|---|---|---|
| 1 | gazeta | 0–8 | 0.0–4.0 | paper kitchen, Michał reads the newspaper „CENY ROSNĄ!” (cover); Yoka under the table |
| 2 | ceny | 8–16 | 4.0–8.0 | the coffee shelf: price tags peel and stack higher (4.5, 5.5, 6.5), a paper arrow climbs; Kasia frowns; Yoka runs off with a newspaper scrap (7.0) |
| 3 | paragony | 16–24 | 8.0–12.0 | Kasia opens the receipts drawer; paper receipts fly into the phone (8.5–11.0); caption „Z Twoich paragonów” |
| 4 | popup | 24–32 | 12.0–16.0 | **turn 12.0**: the phone unfolds like a pop-up book; push „Czas na zapasy?”; lens on the body at 13.0; Yoka's ears up (12.5) |
| 5 | koszyk | 32–42 | 16.0–21.0 | the shield card (header „Kawa ziarnista +6%”, „Kup 4 szt teraz — oszczędź ~12,00 zł”, „w …”) in a lens (16.5); Michał puts 4 packs in a paper basket (18.0–19.5); the climbing arrow hits a paper shield (20.0) |
| 6 | spizarnia | 42–50 | 21.0–25.0 | the shelf tag climbs again (21.5) — the pantry holds 4 packs; hero „Dotychczas zaoszczędzono · szacunkowo — ~12,00 zł” (22.5); Yoka asleep on the scrap |
| 7 | spokoj | 50–54 | 25.0–27.0 | the kitchen, breakfast again, calm; the newspaper folded |
| 8 | cta | 54–60 | 27.0–30.0 | poster: icon, „AI Budżet”, „Tarcza antyinflacyjna”, „Pobierz za darmo”, ai-budget.pl · Google Play · przeglądarka |

---

### Task 1: Scaffold from cien-podwojny, strings, cues, truth test

**Files:** copy `cien-podwojny` → `tarcza-papier` (minus `node_modules`, `exports`, `.snaps`, `.tmp`, `.git`); delete `src/scenes/*`, `src/sets.js`, `src/engine/shadow.js`, `tools/double-check.cjs`; rewrite `tools/gen-cues.py`, `src/strings.js`, `tools/truth-test.cjs`, `package.json` (name `tarcza-papier`), `index.html` (script list), `HANDOFF.md`; stub 8 scenes; 30 s silent placeholder WAV.

- [ ] **Step 1:** copy with PowerShell `robocopy … /E /XD node_modules exports .snaps .tmp .git .frames`; prune; `npm install`; `git init`, `core.autocrlf false`.
- [ ] **Step 2: truth test first (RED).** `tools/truth-test.cjs` reads: server `inflationShieldTitle`/`inflationShieldBody` (PL and EN blocks, fill product + pct), mobile `inflationShield.{title,buyAheadTitle,buyAheadTip,units|units_one…,atStore,savedSoFar,estimated}` and `nav`/none as needed; asserts `push.t`, `push.b` equal the filled server text, `card.tip` equals `buyAheadTip` filled with `units`(4) and `~12,00 zł` / `~€3.00`, every string key containing `save`/`saved` starts its amount with „~”, `push.b` contains no currency symbol or digit-comma amount, PL/EN key parity, `cta.platforms` names Google Play. Run → FAIL (strings not written).
- [ ] **Step 3:** `src/strings.js` PL/EN tables (headline letters, captions, product, pct, store, push, card, hero, CTA); `tools/gen-cues.py` with the shot table and events (cover 0, peel 4.5/5.5/6.5, scrap 7.0, drawer 8.25, receipts whoosh 9.0, turn 12.0, ears 12.5, lens 13.0, card lens 16.5, packs 18.0/18.5/19.0/19.5, shield 20.0, tag 21.5, hero 22.5, cut 25.0, poster 27.0, tail 29.5) and sync regions isolating the EVENT (PITFALLS: the region excludes the approach motion).
- [ ] **Step 4:** `node tools/truth-test.cjs` → `truth OK`; `node tools/shot.cjs all` renders 8 stubs; `npx hyperframes lint .` 0/0. Commit.

### Task 2: The paper engine `src/engine/paper.js`

**Interfaces (Produces `window.PAPER` = `PA`):** `PA.bg(ctx, tone)` (kraft wall + paper grain), `PA.layer(ctx, pts, col, { seed, shadow = 1, edge = true })` (one torn-edged paper piece with drop shadow, grain, fibre edge), `PA.figure(ctx, placedFig, { seed })` (every part as a paper piece in order; details as thin paper strips/dots; skip `only:'shadow'` and holes), `PA.strip(ctx, lines, cx, cy, p, { size, col })` (a caption on a torn paper strip, typed on by p), `PA.letters(ctx, text, x, y, size, seed)` (newspaper collage letters, each on its own scrap, varied font/colour/tilt — deterministic), `PA.phone/push/card/hero` (the app UI as the app looks: white cards, brand orange; `card` = the shield card per `index.tsx`), `PA.magnifier` + `PA.lensPush` + `PA.lensCard` (port the circle-aware lens from `shadow.js`), `PA.popup(ctx, fold, drawFlat)` (draws a flat-laid card through a fold transform; text only when `fold ≥ 0.8`), `PA.tag(ctx, x, y, price, seed)` (a paper price tag on a string), `PA.frame(ctx)` (a torn-paper border, ignores the camera).

- [ ] **Step 1:** `tools/engine-test.cjs` (RED): every API exists; `bg` deterministic; a `layer` casts a shadow (pixel below-right darker than the piece's surround) and keeps its colour inside; a popup at fold 0.5 draws NO text pixels and at fold 1 draws them; lens lines stay inside the circle for both push bodies; frame ignores the camera; a tag/letters call is deterministic across two calls.
- [ ] **Step 2:** implement by porting `craft-sheet` `paper` (wobble/densify/grain/shadow), and the lens/phone/push code from `cien-podwojny/src/engine/shadow.js`; keep one cached offscreen per static layer.
- [ ] **Step 3:** test GREEN; a look frame `.tmp/engine-look.png` (bg + a strip + the phone with the push + the card in a lens + three tags + „CENY ROSNĄ!” letters), LOOK at it; a frame with 4 figures ≤ 60 ms. Commit.

### Task 3: Cast on paper + props

**Files:** keep `src/cast.js` (unchanged API); create `src/props.js` (`PROPS.coffee(x,y,s)`, `PROPS.basket`, `PROPS.newspaper(open|folded)`, `PROPS.drawer`, `PROPS.receipt(seed)`, `PROPS.shield`, `PROPS.arrow`), `tools/cast-sheet.cjs` (renders every pose with `PA.figure`, plus the props).
- [ ] **Step 1:** extend the cast test (RED): props exist and return placed part lists; the paper cast sheet at 0.25 is written; the poses needed (Michał `stand`/`sit`, Kasia `stand`, son `stand`, Yoka `home`/`street`/`stand`) all render.
- [ ] **Step 2:** implement `props.js`; colours for paper (coffee pack brown/red label, basket wicker); LOOK at the 0.25 sheet — every person reads (Review Focus 1). Fix part order/colours in the cast where paper reveals overlaps (cast changes are additive and must keep `cien-podwojny` behaviour; that project has its own copy).
- [ ] **Step 3:** show the cast sheet to the user (SendUserFile) and continue. Commit.

### Task 4: Sets, storyboard, geometry dry-run, scene brief

- [ ] **Step 1:** `src/sets.js`: `SETS.kitchen({ breakfast })` (table x 120–960 top y 1300, a window, a hanging lamp, a wall clock), `SETS.shelf()` (a store shelf with coffee packs, tags hang at fixed anchors `SETS.TAGS`), `SETS.pantry({ packs: 0..4 })`; `tools/sets-test.cjs` (exist, deterministic, anchors defined).
- [ ] **Step 2:** `storyboard.md` (truth, strings, shot sections, shared geometry) and **a geometry dry-run** (`tools/geometry.cjs`): every shared position placed once per shot in one frame, written to `.tmp/geometry-NN.png`; LOOK before writing the brief (PITFALLS: storyboard numbers are not placed figures). Fix the numbers, then `docs/SCENE-BRIEF.md` (contract, draw order, rules, the PITFALLS rows that apply).
- [ ] **Step 3:** commit.

### Tasks 5–7: Scenes (four scene agents, two shots each: 01–02, 03–04, 05–06, 07–08)

Each agent owns its two scene files only, reads the brief + storyboard + engine/cast/sets/props headers, snaps every 0.25 s and LOOKS, keeps engine/cast/sets/truth tests green and lint 0, and reports the final-frame calls and cost. 04 owns the pop-up unfold and its Review Focus 3 check (text only at fold ≥ 0.8).

### Task 8: Score (one background agent)

Owns `audio/synth.py` + `assets/audio.wav`; keeps the engine (seeded, `cue()` fails on an unvoiced cue, pre-cue carve, −16 LUFS / TP ≤ −1.5, 30.000 s, loop seam); new score: a light paper ragtime (stride piano, pizzicato, woodblock, paper rustles), C major with a minor colour in 02–03 and a bright lift at 12.0; every event voiced; `onsets.py` ≤ 10 ms; md5 stable.

### Task 9: Critic wave, determinism, truth

- [ ] seek-check over 17 times; whole-film sheet at 0.25; two critics (composition/readability; story/truth/fidelity) with P1/P2/P3 and evidence frames; owners fix; shared fixes by the director with RED→GREEN tests; all tests green; lint 0.

### Task 10: Deliver PL, EN copy, deliver EN

- [ ] `node tools/deliver.cjs` PL (exit 0: loudness + sync); EN copy (`lang` default `en` in index.html AND the `STR` default); EN literal scan + truth-test; deliver EN; shots.md both.

### Task 11: Campaign files, skill update, closure

- [ ] renders + social cuts (master video + phone audio) to `creatives/antinflation/renders/{pl,en}/`; Story script `docs/marketing/scripts/build_antinflation_paper_story.py` (from `build_anomaly_alerts_shadow_story.py`: paper look, the card with the estimate wording, 9:16 keeps the sticker gap); copy doc `docs/marketing/copy/feature-antinflation-paper-film.md`; `ad-film` SKILL §1d **Cut paper** row + PITFALLS section; memory; `HANDOFF.md`; final reviewer (opus); then the ABA issue + wiki log line + one squashed commit (push only after the user's OK).
