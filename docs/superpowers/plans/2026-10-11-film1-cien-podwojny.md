# Film 1 "Podwójny cień" (shadow puppets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 30 s, 9:16 shadow-puppet ad film about duplicate-charge alerts (PL + EN), plus the reusable `shadow` house style for the `ad-film` skill.

**Architecture:** A new film project copied from the multi-scene harness of `D:\Work\tools\films\okna-95\` (cues in beats → `src/cues.js`, one file per shot registering with `TIMELINE`, `FILM.render(t)` pure in t, HyperFrames render, `tools/deliver.cjs`). The look is a new engine `src/engine/shadow.js` grown from the approved look test `D:\Work\tools\films\craft-sheet\styles.js` (`shadow`), and the cast is the polygon cast of `craft-sheet\cast.js` extended with the poses this film needs. Scenes call the engine and the cast; they never copy them.

**Tech Stack:** Canvas 2D in headless Chrome (puppeteer-core 25.12.0), HyperFrames 0.8.111, GSAP (paused proxy timeline), Python 3 + numpy/scipy (score synthesis, onset and sync checks), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-11-craft-films-series-design.md` (section "Film 1 — Podwójny cień"). Also binding: `.claude/skills/ad-film/SKILL.md` and `.claude/skills/ad-film/PITFALLS.md`.

## Global Constraints

- Project folder `D:\Work\tools\films\cien-podwojny\` and `D:\Work\tools\films\cien-podwojny-en\` — **outside the repo**.
- 1080×1920, 30 s, 24 fps, drawings on twos (12/s), 120 bpm (beat = 0.5 s); shot boundaries on whole beats.
- The turn at 12.0 s (40 %); poster from 27.0 s, CTA complete by 27.0 s, nothing fast-moving after it.
- Frame 0 is the cover: the night set and the cartouche „Pewnej nocy…” are fully drawn at t = 0.
- Determinism: no `Math.random`, no `Date`; every random draw is `A.hash`/`mulberry` seeded.
- Every visible string goes through `src/strings.js` (PL and EN tables, same keys). App strings verbatim:
  PL `alerts.duplicateTitle` „Możliwa podwójna płatność”, `alerts.duplicateBody` „{{merchant}} pobrał {{amount}} {{currency}} dwa razy w ciągu dwóch dni.”;
  EN „Possible duplicate charge”, „{{merchant}} charged {{amount}} {{currency}} twice within two days.”
- Example values: PL Piekarnia, 48,00 zł (body uses „48 PLN”, the app's format); EN Bakery, 12 EUR. No real brand names.
- Truth: the app **warns**; it never refunds, cancels or blocks. Allowed claim: noticed in time, checked. „bez konfiguracji” is true (`user_docs/pl/31-anomaly-alerts.md`).
- Yoka is **background only**: one reaction per beat, never covers the phone, a magnifier or a caption.
- Colour rule: ink `#170E08` silhouettes on the amber screen; the phone and its magnifier are the ONLY colour (brand `#E37F2B` family + the app's light UI).
- Captions: cap height ≥ 48–56 px (font ≥ 66 px); must-read content inside x 60–1020, y 220–1540; nothing must-read in the bottom 20 %. Captions type on over 6 frames (except shot 01, complete at frame 0) and finish within ~0.7 s of their shot start.
- Phone deliverable: −14 ±1 LUFS, true peak ≤ −1 dBFS (`deliver.cjs` enforces); AV sync ≤ 40 ms (`cues_check.py`); score onsets ≤ 10 ms (`audio/onsets.py`).
- Deliverables are local-only (gitignored `docs/marketing/`); never `git add` them; nothing is pushed.

## Review Focus

1. **Silhouette readability at feed size** — at 25 % scale every character is identifiable in pure black: Michał (bald egg head, beard, rectangular glasses holes), Kasia (scalloped curl edge, not a lump), the son (cat ears), Yoka (beard, brow tuft, stub tail). Pinned by the Task 3 cast sheet at `--scale 0.25` and Task 9's full-film sheet.
2. **"The double is the same"** — the baker's double must be the identical puppet (same function, same seed, mirrored timing), not a different villain. Pinned in Task 6 by drawing both from `CAST.baker()` and a pixel-diff check of the two puppets.
3. **The payoff text is readable** — the push body on a held phone is tiny; a magnifier carries „Piekarnia pobrał 48 PLN dwa razy w ciągu dwóch dni.” (the app template filled verbatim) at ≥ 44 px. Pinned in Task 7 by `tools/measure.cjs` on the magnifier text box.
4. **EN version has no Polish left** — any literal in a scene leaks PL into EN. Pinned in Task 10 by a source scan (`grep` for Polish diacritics/strings in `src/scenes/`) plus the EN contact sheet.
5. **Seek determinism** — HyperFrames seeks frames out of order; a scene with hidden state (a memo not keyed on t) renders differently. Pinned in Task 9 by snapping the same frames in two orders and comparing hashes.

---

## File structure (the film project)

| File | Responsibility |
|---|---|
| `index.html` | HyperFrames composition: scripts in order, canvas, `#app-icon`, `<audio id="score">`, inline timeline registration |
| `package.json` | name `cien-podwojny` (the slug `deliver.cjs` uses), hyperframes + puppeteer-core pins |
| `tools/gen-cues.py` → `src/cues.js` | shots, sound events, sections, sync regions — authored in beats |
| `src/strings.js` | every on-screen string, PL + EN |
| `src/engine/rng.js`, `src/engine/anime.js` | kept from okna-95 unchanged: rng/ease/prog, colour roles `A.c`, `A.text`, sprites — the harness core |
| `src/engine/shadow.js` | NEW `window.SHADOW`: screen, frame, ground, puppet layer (fill + cut-outs + pins + rods + penumbra), cartouche captions, the phone glow, the magnifier |
| `src/cast.js` | NEW `window.CAST`: polygon cast (Michał, Kasia, son, Yoka, baker) + poses; replaces okna-95's anime cast |
| `src/sets.js` | NEW `window.SETS`: night house exterior, bakery counter, bedroom — all as silhouette polygons |
| `src/timeline.js`, `src/film.js` | kept from okna-95 (shot dispatch, render, mount) |
| `src/scenes/01-noc.js` … `08-cta.js` | one shot each |
| `audio/synth.py`, `audio/onsets.py` | music-box score from `CUES.events`; onset check |
| `tools/*.cjs/py` | `_page.cjs`, `shot.cjs`, `bench.cjs`, `measure.cjs`, `cues_check.py`, `deliver.cjs` kept; NEW `cast-sheet.cjs`, `seek-check.cjs` |
| `docs/SCENE-BRIEF.md`, `storyboard.md`, `HANDOFF.md` | briefs, storyboard, resumable state |

Shot table (beats → seconds), used by every task:

| n | id | beats | seconds | content |
|---|---|---|---|---|
| 1 | noc | 0–8 | 0.0–4.0 | night house, moon, „Pewnej nocy…”; Yoka asleep at the door |
| 2 | piekarnia | 8–15 | 4.0–7.5 | day flashback (a paler amber): Michał pays, a „48,00 zł” coin arcs to the baker |
| 3 | sobowtor | 15–23 | 7.5–11.5 | night: the baker's identical double steps out of his shadow and takes a 2nd coin; „Ten sam sklep. Ta sama kwota. Dwa razy.”; Yoka's ear twitches at 10.5 |
| 4 | alert | 23–31 | 11.5–15.5 | **turn at 12.0**: the phone lights (only colour), push „Możliwa podwójna płatność”; magnifier on the body at 13.0; Yoka jumps up + „HAU!” at 12.5 |
| 5 | sprawdzenie | 31–40 | 15.5–20.0 | family wakes; Michał opens the alert: two identical 48 PLN charges side by side (magnifier) |
| 6 | zdjecie | 40–48 | 20.0–24.0 | the double is lifted off the screen on its rod; „Sprawdzone, zanim pieniądze zniknęły.” |
| 7 | spokoj | 48–54 | 24.0–27.0 | calm: family back to bed, Yoka asleep, content |
| 8 | cta | 54–60 | 27.0–30.0 | poster: app icon, „AI Budżet — alerty bez konfiguracji”, „Pobierz za darmo”, Google Play / ai-budget.pl |

---

### Task 1: Scaffold the project from okna-95 and prove the stub film renders

**Files:**
- Create: `D:\Work\tools\films\cien-podwojny\` (copy of okna-95 minus media/engines listed below)
- Modify: `package.json`, `index.html`, `tools/gen-cues.py`, `src/strings.js`, `HANDOFF.md`
- Delete (in the copy): `src/cast.js`, `src/cast-audit.js`, `src/cast-props.js`, `src/hose-props.js`, `src/engine/{fx,hose,noir,os95,pix,sets,typo}.js`, `src/scenes/*`, `tools/{noir-sheet,hose-sheet,font-test,ios-landing-test,sheets}.*`, `tools/cast-sheet.cjs`, `exports/*`, `.snaps`, `.tmp`, `assets/audio.wav`

**Interfaces:**
- Produces: `CUES.shots` with the 8 ids above; `TIMELINE.stub(ctx, t, info, plan)`; `STR.t(key)`; `node tools/shot.cjs all` renders all 8 stubs.

- [ ] **Step 1: Copy without the heavy folders**

```bash
cd /d/Work/tools/films
robocopy okna-95 cien-podwojny /E /XD node_modules .frames exports .snaps .tmp /NFL /NDL /NJH /NJS
cd cien-podwojny
rm -f src/cast.js src/cast-audit.js src/cast-props.js src/hose-props.js src/scenes/*.js assets/audio.wav
rm -f src/engine/fx.js src/engine/hose.js src/engine/noir.js src/engine/os95.js src/engine/pix.js src/engine/sets.js src/engine/typo.js
rm -f tools/noir-sheet.cjs tools/hose-sheet.cjs tools/font-test.cjs tools/ios-landing-test.cjs tools/sheets.js tools/cast-sheet.cjs
sed -i 's/"name": "okna-95"/"name": "cien-podwojny"/; s/"description": ".*"/"description": "AI Budzet shadow-puppet ad film (duplicate-charge alerts)"/' package.json
npm install
```

- [ ] **Step 2: Rewrite `tools/gen-cues.py` with the shot table**

Replace the `shots`, `ev`, `sections`, `C` blocks and the header strings (`okna-95` → `cien-podwojny`, style line → shadow puppets):

```python
shots = [  # [n, id, startBeat, endBeat]
    [1, 'noc', 0, 8], [2, 'piekarnia', 8, 15], [3, 'sobowtor', 15, 23], [4, 'alert', 23, 31],
    [5, 'sprawdzenie', 31, 40], [6, 'zdjecie', 40, 48], [7, 'spokoj', 48, 54], [8, 'cta', 54, 60],
]
ev = [  # [beat, kind, note] - one entry per audible event; every one is voiced by audio/synth.py
    (0, 'hit', 'Music-box opening: celesta arpeggio over a soft drone (frame 0 is the cover)'),
    (4, 'sfx', 'Owl-like woodwind call, far away'),
    (8, 'cut', 'Day flashback: pizzicato walking figure, brighter'),
    (11, 'sfx', 'Coin flick + bright chime as the 48,00 coin lands'),
    (15, 'cut', 'Night again: the drone darkens, a low clarinet'),
    (17, 'sfx', 'The double peels off the baker: a paper-rustle swell'),
    (20, 'sfx', 'Second coin: the SAME chime as beat 11, a semitone lower'),
    (21, 'sfx', 'Yoka ear twitch: tiny woodblock tick'),
    (24, 'hit', 'THE TURN: the phone lights - a bright celesta chord + soft gong'),
    (25, 'sfx', 'Yoka HAU!: a short pizzicato double-stop bark'),
    (26, 'sfx', 'Magnifier pops on the push body: glass ting'),
    (31, 'cut', 'Family wakes: strings warm in, major key'),
    (34, 'sfx', 'Tap on the alert'),
    (36, 'sfx', 'Magnifier on the two charges: glass ting'),
    (41, 'sfx', 'The double is lifted: rising paper whoosh'),
    (44, 'hit', 'The double is gone: warm resolving chord'),
    (48, 'cut', 'Calm: lullaby celesta, the drone returns soft'),
    (54, 'hit', 'Poster: final music-box cadence (poster complete from here)'),
    (59, 'swell', 'Tail rings out into the loop'),
]
sections = [
    [0, 8, 'night', 0.4], [8, 15, 'day', 0.55], [15, 24, 'double', 0.6], [24, 31, 'turn', 0.85],
    [31, 48, 'resolve', 0.7], [48, 54, 'calm', 0.45], [54, 60, 'poster', 0.6],
]
C = {
    'dur': 30, 'fps': 24, 'drawingsPerSecond': 12, 'bpm': BPM,
    'turn': t(24), 'posterFrom': 27.0, 'audioSource': 'synth',
    'shots': [[n, i, t(a), t(b)] for n, i, a, b in shots],
    'events': [[t(b), k, s] for b, k, s in ev],
    'sections': [[t(a), t(b), n, e] for a, b, n, e in sections],
    'ones': [],
    'sync': [['coin', t(11), [520, 600, 1020, 1200]], ['turn', t(24), 'flash'], ['hau', t(25), [40, 1000, 520, 1500]], ['lift', t(44), [300, 200, 1000, 1300]]],
    'write': [], 'strike': [], 'erase': [], 'sfx': [], 'music': {},
}
```

Run: `python tools/gen-cues.py` — Expected: `wrote src/cues.js 19 events`.

- [ ] **Step 3: Write `src/strings.js` (PL + EN)**

Keep okna-95's `STR` object, `t()` and the `lang` detection verbatim; replace the header comment and the tables:

```js
    pl: {
      'cap.noc': 'Pewnej nocy…',
      'cap.dwa': ['Ten sam sklep.', 'Ta sama kwota.', 'Dwa razy.'],
      'cap.ok': ['Sprawdzone, zanim', 'pieniądze zniknęły.'],
      'coin': '48,00 zł', 'shop': 'Piekarnia', 'amount': '48', 'currency': 'PLN',
      'push.app': 'AI Budżet', 'push.t': 'Możliwa podwójna płatność',
      'push.b': 'Piekarnia pobrał 48 PLN dwa razy w ciągu dwóch dni.',
      'ui.alerts': 'Alerty', 'row.date1': '03.10', 'row.date2': '04.10', 'row.amount': '-48,00 zł',
      'hau': 'HAU!',
      'cta.line1': 'AI Budżet', 'cta.line2': 'alerty bez konfiguracji', 'cta.btn': 'Pobierz za darmo',
      'cta.url': 'ai-budget.pl', 'cta.platforms': 'Android · przeglądarka',
    },
    en: {
      'cap.noc': 'One night…',
      'cap.dwa': ['Same shop.', 'Same amount.', 'Twice.'],
      'cap.ok': ['Checked before', 'the money was gone.'],
      'coin': '12.00 €', 'shop': 'Bakery', 'amount': '12', 'currency': 'EUR',
      'push.app': 'AI Budget', 'push.t': 'Possible duplicate charge',
      'push.b': 'Bakery charged 12 EUR twice within two days.',
      'ui.alerts': 'Alerts', 'row.date1': '03.10', 'row.date2': '04.10', 'row.amount': '-12.00 €',
      'hau': 'WOOF!',
      'cta.line1': 'AI Budget', 'cta.line2': 'alerts with zero setup', 'cta.btn': 'Download free',
      'cta.url': 'ai-budget.pl', 'cta.platforms': 'Android · web browser',
    },
```

Note: `push.b` is the app template filled verbatim („{{merchant}} pobrał …”) — the masculine „pobrał” is the app's own wording; do not "fix" it in the film.

- [ ] **Step 4: Stub every shot and wire `index.html`**

For each id create `src/scenes/NN-<id>.js`:

```js
(function () {
  'use strict';
  TIMELINE.register({ id: 'noc', draw(ctx, t, info) { TIMELINE.stub(ctx, t, info, 'night house, moon, Pewnej nocy'); } });
})();
```

(ids/plans: `01-noc` „night house”, `02-piekarnia` „Michał pays, coin”, `03-sobowtor` „the double takes a coin”, `04-alert` „TURN: push + HAU”, `05-sprawdzenie` „two charges”, `06-zdjecie` „double lifted”, `07-spokoj` „calm”, `08-cta` „poster”.)

In `index.html`: `<title>cien-podwojny</title>`; script list = `gsap, cues, strings, engine/rng, engine/anime, engine/shadow (added in Task 2), cast (Task 3), sets (Task 4), timeline, scenes/01…08, film`. Remove every deleted script tag. Keep `#app-icon` and `<audio id="score">`.

- [ ] **Step 5: Verify the stub film**

Run: `node tools/shot.cjs all` → Expected: 8 folders in `.snaps/`, each sheet shows its id and times; no `[pageerror]`.
Run: `npx hyperframes lint .` → Expected: 0 errors (a missing `assets/audio.wav` warning is fine until Task 8).

- [ ] **Step 6: Record state**

Overwrite `HANDOFF.md` with: purpose (one paragraph from the spec), the shot table, a checklist mirroring Tasks 1–11, and "copied from okna-95; anime cast/engines removed". Initialise a local git repo for the film (`git init && git add -A && git commit -m "scaffold from okna-95"`) so later tasks can commit.

---

### Task 2: The shadow engine `src/engine/shadow.js`

**Files:**
- Create: `src/engine/shadow.js`, `tools/engine-test.cjs`
- Reference: `D:\Work\tools\films\craft-sheet\styles.js` (`shadow` object, `path`, `rng`, `grain`)

**Interfaces:**
- Consumes: `window.ANIME` (`A.hash`, `A.mulberry`, `A.text`, `A.c`), placed figures `{ p: [{pts, col}], d: [...], rods, pins, foot, s }` from Task 3.
- Produces `window.SHADOW` (alias `SH`):
  - `SH.INK = '#170E08'`
  - `SH.screen(ctx, { tone: 'night' | 'day', glow: [x, y] })` — amber backlit screen (+ grain, faint seams); `day` is paler (`#FFF0C8` centre)
  - `SH.frame(ctx)` — carved frame + gold bead + cut arch (drawn last by scenes, over everything)
  - `SH.ground(ctx, y, seed)` — cut grass strip from `y` to the bottom
  - `SH.puppet(ctx, fig, { alpha = 1, penumbra = 0.22, rods = true })` — one silhouette layer: fills, `destination-out` cut-outs (`cut`/`only:'shadow'`/`hole`), solid details (`solid`), pins, rods; draws penumbra then crisp layer
  - `SH.cartouche(ctx, lines, cx, cy, p, { size = 70 })` — ink plaque with scalloped edge, lines typed on by `p` 0..1 (characters revealed `floor(p * total)`), text in the screen's light colour `#FFE3A1`
  - `SH.phone(ctx, x, y, w, glow)` — a held phone: ink body, the screen as the ONLY colour (`A.c('uiBg')` + brand orange header), returns `{ screen: {x, y, w, h} }`
  - `SH.push(ctx, rect, title, body, app)` — the app's push card inside a rect (light UI, brand dot, title bold, body wrapped)
  - `SH.magnifier(ctx, from, to, r, drawInside)` — round lens at `to` with an ink rim, two tangent lines to `from`, `drawInside(ctx)` clipped and scaled 2.4×
  - `SH.bubble(ctx, x, y, text, p)` — the „HAU!” silhouette lettering (italic 900 Georgia, ink), scale-pops by `p`

- [ ] **Step 1: Write the failing engine test**

`tools/engine-test.cjs` opens the film page (via `_page.cjs` `openFilm`) and, in the page:

```js
const out = await page.evaluate(() => {
  const errs = [];
  for (const k of ['screen', 'frame', 'ground', 'puppet', 'cartouche', 'phone', 'push', 'magnifier', 'bubble'])
    if (typeof window.SHADOW?.[k] !== 'function') errs.push('missing SHADOW.' + k);
  if (errs.length) return { errs };
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d');
  const draw = () => { x.clearRect(0, 0, 1080, 1920); SHADOW.screen(x, { tone: 'night' }); SHADOW.ground(x, 1700, 3);
    SHADOW.cartouche(x, ['Pewnej nocy…'], 540, 400, 1); SHADOW.frame(x); return c.toDataURL(); };
  const a = draw(), b = draw();
  if (a !== b) errs.push('non-deterministic screen');
  const px = x.getImageData(540, 960, 1, 1).data; // the screen centre must be warm light
  if (!(px[0] > 200 && px[1] > 140 && px[2] < 170)) errs.push('screen centre not amber: ' + px.join(','));
  const ink = x.getImageData(540, 1880, 1, 1).data; // the ground is ink
  if (ink[0] > 60) errs.push('ground not ink: ' + ink.join(','));
  return { errs };
});
if (out.errs.length) { console.error(out.errs.join('\n')); process.exit(1); } console.log('engine OK');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tools/engine-test.cjs` — Expected: FAIL `missing SHADOW.screen` (and the others).

- [ ] **Step 3: Implement `shadow.js`**

Port from `craft-sheet/styles.js`: `shadow.bg` → split into `screen` (gradient + grain + seams; replace its `rng(seed)` with `A.mulberry(seed)`), `frame` (border + bead + arch), `ground` (grass strip). `shadow.figure` → `puppet` (offscreen layer per call is too slow at 24 fps: keep ONE module-level 1080×1920 layer canvas, clear it per call; penumbra `blur(9px)` at `penumbra` alpha, then crisp `blur(0.7px)`). Add `cartouche`, `phone`, `push`, `magnifier`, `bubble` as specified in Interfaces; text through `A.text(ctx, s, x, y, { size, weight, align, color, family })`. Header comment = the interface list above.

- [ ] **Step 4: Run the test to see it pass**

Run: `node tools/engine-test.cjs` — Expected: `engine OK`.
Run: `node tools/bench.cjs` — Expected: a stub frame plus one `puppet` call under 60 ms.

- [ ] **Step 5: Commit** (film repo)

```bash
git add src/engine/shadow.js tools/engine-test.cjs index.html && git commit -m "shadow engine"
```

---

### Task 3: The cast `src/cast.js` with this film's poses, and a cast sheet

**Files:**
- Create: `src/cast.js`, `tools/cast-sheet.cjs`
- Reference: `D:\Work\tools\films\craft-sheet\cast.js`

**Interfaces:**
- Consumes: nothing but geometry helpers it owns.
- Produces `window.CAST`: `michal(pose)`, `kasia(pose)`, `syn(pose)`, `yoka(pose)`, `baker(pose)`, `place(fig, x, y, s, flip)`, helpers `ell, blob, caps, rrect`. Every builder returns `{ p, d, rods, pins, h, anchors }`; `anchors` gives `hand`, `head`, `collar` (Yoka) in model units, mapped by `place`.
  - `michal`: `'stand' | 'pay' (near arm out, hand open at chest height) | 'phone' (phone held at chest, anchors.phone) | 'sleep' (lying, profile)`
  - `kasia`: `'stand' | 'sleep' | 'wake' (sitting up, arms out)`
  - `syn`: `'stand' | 'sleep' | 'wake'`
  - `yoka`: `'home' | 'street' | 'stranger' | 'stand' | 'twitch'` (home + one ear raised)
  - `baker`: `'stand' | 'take' (arm out, hand closed)` — tall hat, apron outline, moustache; the DOUBLE is the same call

- [ ] **Step 1: Write the failing cast sheet test**

`tools/cast-sheet.cjs`: for every (character, pose) pair draw `SHADOW.puppet` of `CAST.place(CAST[who](pose), …)` into a grid tile on the amber screen, write `.tmp/cast-sheet.png` and `.tmp/cast-sheet-025.png` (whole sheet at 0.25), and assert in-page: every builder returns ≥ 1 part; every part has ≥ 3 points and finite coordinates; `CAST.yoka('stand')` head top (min y of parts tagged `head`/`ear`/`brow`) is above −205 × (Yoka scale) relative to Michał's knee — i.e. at the lineup scale `s = 1.07` her highest point is lower than Michał's knee at y = −205 (below the knee, per the spec).

```js
const r = await page.evaluate(() => {
  const errs = [];
  const poses = { michal: ['stand', 'pay', 'phone', 'sleep'], kasia: ['stand', 'sleep', 'wake'], syn: ['stand', 'sleep', 'wake'], yoka: ['home', 'street', 'stranger', 'stand', 'twitch'], baker: ['stand', 'take'] };
  for (const [who, list] of Object.entries(poses)) for (const pose of list) {
    let f; try { f = CAST[who](pose); } catch (e) { errs.push(who + ':' + pose + ' throws ' + e.message); continue; }
    if (!f.p.length) errs.push(who + ':' + pose + ' empty');
    for (const q of f.p) if (q.pts.length < 3 || q.pts.some(([x, y]) => !isFinite(x) || !isFinite(y))) errs.push(who + ':' + pose + ' bad part');
  }
  const y = CAST.yoka('stand'); const top = Math.min(...y.p.flatMap((q) => q.pts.map((p) => p[1]))) * 1.07;
  if (top < -205) errs.push('Yoka taller than the knee: ' + top.toFixed(0));
  return errs;
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tools/cast-sheet.cjs` — Expected: FAIL (`CAST is not defined` / missing poses).

- [ ] **Step 3: Implement `src/cast.js`**

Copy `craft-sheet/cast.js` as the base (`michal`, `kasia`, `syn`, `yoka`, `place`, helpers). Then:
- **Kasia's silhouette**: the curl ring makes a lump in black. Give the outer ring 26 curls at radius `r = 26–34`, pushed 12 px further out than now, so the scallops break the outline; check on the 0.25 sheet.
- Add poses by transforming groups (tag parts with `g`, as `yoka` already does): `michal.pay` rotates the near arm group (sleeve, forearm, hand) about the shoulder by −1.1 rad; `michal.phone` both forearms toward the chest centre, `anchors.phone = [0, -470]`; `*.sleep` = lying profile built as its own part list (head on a pillow line, body a long blob under a blanket polygon).
- `baker`: front view like Michał's proportions, tall chef hat (a blob of three puffs over a band), apron as a `hole` outline (cut line in the shadow), a moustache with upturned ends sticking out of the profile; `take` rotates the near arm out with a closed hand.
- `yoka.twitch` = `home` with the ear group rotated −0.6 rad (up).
- `place` also maps `anchors`.

- [ ] **Step 4: Run the test to see it pass; look at both sheets**

Run: `node tools/cast-sheet.cjs` — Expected: no errors; then open `.tmp/cast-sheet.png` and `.tmp/cast-sheet-025.png` and check Review Focus item 1 by eye. Show `.tmp/cast-sheet.png` to the user (SendUserFile) — the new poses and the baker are new designs.

- [ ] **Step 5: Commit**

```bash
git add src/cast.js tools/cast-sheet.cjs && git commit -m "polygon cast + film poses"
```

---

### Task 4: Sets, storyboard and scene brief

**Files:**
- Create: `src/sets.js`, `storyboard.md`, `docs/SCENE-BRIEF.md`

**Interfaces:**
- Produces `window.SETS`: `house(ctx, { windowsLit: 0..1 })` (night exterior: house with gable roof, door at x 280, a window that can light, a tree, the moon at [820, 420]); `bakery(ctx)` (counter, shelf with loaves, awning scallop — all silhouettes); `bedroom(ctx, { lamp: 0..1 })` (a bed line, nightstand, a window with the moon). All drawn in `SH.INK` on the current screen; static (cached per set into an offscreen canvas on first call, keyed by option values rounded to 0.1).

- [ ] **Step 1: Write the storyboard**

`storyboard.md`: logline („Podwójne obciążenie to cień, który ma sobowtóra — AI Budżet go zauważa.”), numbers (120 bpm, beat 0.5 s, 60 beats), the shot table above, and per shot the eight subsections the procedural-film template uses (Picture, Camera, Cast + positions in frame px, Yoka, Text, Overlays/magnifier, Sound cues with beats, Transition). Positions to fix now (shared geometry, used by several shots):

| Element | Value |
|---|---|
| Ground line | y 1700 (shots 1, 3, 7) / 1640 (2, bakery floor) |
| House door | x 230–330, y 1360–1700; Yoka at the door: `place(yoka('home'), 300, 1700, 1.6)` |
| Baker | `place(baker, 760, 1640, 1.0)`; the double starts as the same puppet at the same spot and slides to x 900 |
| Coin | ink disc r 46 with the light-coloured text `STR.t('coin')` (size 30, bold) |
| Phone (shots 4–5) | centre x 540, y 760, width 420 → screen text stays above y 1540 |
| Magnifier | centre [540, 1180], r 300, lens text ≥ 44 px |
| Cartouches | centre x 540; y 300 (shot 1), y 330 (shots 3, 6); width ≤ 920 |

Self-review: shots tile 0–30 exactly; every Sound cue matches `tools/gen-cues.py`; every timed list fits its window (PITFALLS "Story and timing").

- [ ] **Step 2: Write `docs/SCENE-BRIEF.md`**

Copy okna-95's brief structure and replace the content: the engine and cast APIs (paste the two header comments), the colour rule, the truth rules, the caption rules, Yoka's background rule, file ownership (each scene agent owns exactly one `src/scenes/NN-*.js`), and the PITFALLS rows that apply (Story and timing; Readability at feed size; "frame 0 must equal the previous shot's end"; "aim a tap at the edge of the control"; the EN literal row).

- [ ] **Step 3: Implement `src/sets.js` and check it**

Run: `node tools/shot.cjs 01 --at 0` after temporarily drawing `SH.screen + SETS.house + SH.frame` in the 01 stub — Expected: the house reads at 0.25 scale (look at `.snaps/01-noc/sheet.png`). Revert the stub edit (Task 5 owns the scene).

- [ ] **Step 4: Commit**

```bash
git add src/sets.js storyboard.md docs/SCENE-BRIEF.md && git commit -m "sets, storyboard, scene brief"
```

---

### Task 5: Scenes 01 noc and 02 piekarnia

**Files:** Modify `src/scenes/01-noc.js`, `src/scenes/02-piekarnia.js`

**Interfaces:** Consumes `SH.*`, `CAST.*`, `SETS.*`, `STR.t`, `info.prog/on/at`, `A.ease`.

- [ ] **Step 1: 01 noc (0–4 s)** — `SH.screen(night)`, `SETS.house({ windowsLit: 0 })`, `SH.ground(1700)`, Yoka `home` at the door (`place(yoka('home'), 300, 1700, 1.6)`), the moon drifting 6 px over the shot, cartouche `STR.t('cap.noc')` at [540, 300] complete at frame 0 (p = 1 throughout), `SH.frame` last. Camera: a slow push-in `s = 1 + 0.03 * info.p`.
- [ ] **Step 2: 02 piekarnia (4–7.5 s)** — `SH.screen(day)`, `SETS.bakery`, Michał `pay` at [300, 1640] facing right, baker `stand` → `take` at 5.5 s. The coin leaves Michał's hand at 4.5 s and lands in the baker's hand at 5.5 s (beat 11, the sync cue `coin`) along an arc (`A.ease.out`), spinning (scaleX = cos). Yoka is absent (she is at home in this flashback).
- [ ] **Step 3: Snap and look**

Run: `node tools/shot.cjs 01` and `node tools/shot.cjs 02 --every 0.25` — Expected: sheets on-brief; the coin label legible at 0.4 scale; frame 0 of 01 complete; the last drawing of 01 ≠ a black frame.
- [ ] **Step 4: Commit** — `git add src/scenes/01-noc.js src/scenes/02-piekarnia.js && git commit -m "scenes 01-02"`

### Task 6: Scenes 03 sobowtor and 04 alert (the turn)

**Files:** Modify `src/scenes/03-sobowtor.js`, `src/scenes/04-alert.js`, `tools/double-check.cjs` (create)

- [ ] **Step 1: Write the failing "same double" check** — `tools/double-check.cjs` renders shot 03 at local t = 1.0 into the page, then renders `CAST.baker('stand')` alone at the baker's spot and at the double's spot on a blank screen and compares the two puppet masks after translating by the slide offset: Expected identical (≥ 99.5 % of mask pixels equal). Run → FAIL (03 is a stub).
- [ ] **Step 2: 03 sobowtor (7.5–11.5 s)** — night screen, house set behind (windows dark), the baker standing at [760, 1700]; at 8.5 s (beat 17) the double peels off: same `CAST.baker('stand')` drawn a second time, sliding from x 760 to 900 over 0.5 s with a paper-rustle wobble (±2 px), then `take`s a second coin at 10.0 s (beat 20). Cartouche `cap.dwa` (3 lines) types on over 6 frames from 7.6 s at [540, 330], held to the cut. Yoka `home` at the door; at 10.5 s (beat 21) she switches to `twitch` for 4 drawings.
- [ ] **Step 3: 04 alert (11.5–15.5 s)** — bedroom set; Michał `sleep`. At 12.0 s (beat 24, the turn): the phone on the nightstand lights — `SH.phone` + `SH.push(screen, push.t, push.b, push.app)`, a warm brand-orange glow radius 500 (the only colour), `flash` 0.35 for 2 drawings. At 12.5 s (beat 25) Yoka `stranger` pops in at the bed's foot [220, 1700, 1.5] facing the phone with `SH.bubble(STR.t('hau'))`. At 13.0 s (beat 26) `SH.magnifier` from the push body to [540, 1180] r 300 showing `push.b` at ≥ 44 px.
- [ ] **Step 4: Verify** — `node tools/double-check.cjs` → PASS; `node tools/shot.cjs 03 --every 0.25`, `node tools/shot.cjs 04 --every 0.25` → sheets on-brief; `node tools/measure.cjs` on 04 at local 2.0 s → the lens text box cap height ≥ 44 px.
- [ ] **Step 5: Commit** — `git add src/scenes/03-sobowtor.js src/scenes/04-alert.js tools/double-check.cjs && git commit -m "scenes 03-04"`

### Task 7: Scenes 05 sprawdzenie, 06 zdjecie, 07 spokoj, 08 cta

**Files:** Modify `src/scenes/05-sprawdzenie.js` … `08-cta.js`

- [ ] **Step 1: 05 (15.5–20 s)** — bedroom, lamp on; Kasia and the son `wake` (sit up), Michał `phone` centre [540, 1500, 1.1] holding the phone up; at 17.0 s (beat 34) a tap on the push's lower-right edge; the phone screen becomes the alerts list (`ui.alerts` header) with two identical rows `shop` / `row.date1|row.date2` / `row.amount`; at 18.0 s (beat 36) the magnifier on the two rows (r 300, text ≥ 44 px). Yoka `stand` at the bed's foot, facing the phone, no bubble.
- [ ] **Step 2: 06 (20–24 s)** — night exterior again (house, windows lit); the double stands by the baker; at 20.5 s (beat 41) a rod appears from the top of the frame, hooks the double's hat and lifts it up and out by 22.0 s (beat 44) with a slight swing (`sin`, decaying); the original baker stays. Cartouche `cap.ok` types on from 20.1 s at [540, 330]. Yoka `home` at the door, eyes closed.
- [ ] **Step 3: 07 (24–27 s)** — bedroom, lamp off, the family `sleep`, Yoka `home` curled at the foot of the bed; the moon in the window; a slow pull-out `s = 1.04 - 0.04 * info.p`.
- [ ] **Step 4: 08 cta (27–30 s)** — amber screen, the app icon (`A.images.icon`, real pixels, 260 px, in an ink cartouche frame), `cta.line1` (size 96), `cta.line2` (size 64), a light button `cta.btn`, `cta.url` · `cta.platforms` small; Yoka `home` small at the lower left on the ground. Everything complete at 27.0 s (the shot's frame 0) and static — no boil-driven motion beyond the house boil.
- [ ] **Step 5: Snap and look** — `node tools/shot.cjs 05 --every 0.25` … `08`; Expected: on-brief, nothing must-read below y 1540, poster frames identical apart from boil.
- [ ] **Step 6: Commit** — `git add src/scenes && git commit -m "scenes 05-08"`

### Task 8: The score

**Files:** Modify `audio/synth.py`, keep `audio/onsets.py`

**Interfaces:** Consumes `CUES.events` (19 events, every one voiced through `cue(t, kind)` — a missing or unvoiced cue must stop the build, as in okna-95).

- [ ] **Step 1: Dispatch a background agent** (one agent owns `audio/synth.py`) with: the storyboard Sound cues, the style („music box / shadow-theatre fairy tale: celesta + glockenspiel lead, pizzicato strings, a low clarinet and a dark drone under the double, warm string pad from the turn, a lullaby close; D minor → F major at the turn; 120 bpm felt at 60”), okna-95's `synth.py` as the engine to keep (patch functions, `cue()`, the 9 dB pre-cue dip, loudness targets −16 LUFS / TP ≤ −1.5 dBFS, determinism).
- [ ] **Step 2: Verify** — `python audio/synth.py` → `assets/audio.wav` 30.000 s 48 kHz stereo; `python audio/onsets.py` → all 19 onsets ≤ 10 ms; run twice and compare md5 → identical.
- [ ] **Step 3: Commit** — `git add audio/synth.py assets/audio.wav && git commit -m "score"`

### Task 9: Critic wave and determinism

**Files:** whichever scene files the critics' P1/P2 findings point at; Create `tools/seek-check.cjs`

- [ ] **Step 1: Seek determinism test** — `tools/seek-check.cjs` renders frames at t = [0, 5.5, 12.0, 13.0, 18.0, 21.0, 28.0] in that order and again in reverse order (fresh page each time), hashing `cv.toDataURL()`; Expected: identical hash per t. Run it → PASS or fix the scene holding state.
- [ ] **Step 2: Whole film at feed size** — `node tools/shot.cjs all --scale 0.25`; any shot that does not read at that size is a P1.
- [ ] **Step 3: Critics** — two critic subagents score each shot's sheet (composition, faithfulness to the storyboard, silhouette readability, Yoka's background rule, the truth rules) with P1/P2/P3 and evidence frames; the owning scene's agent fixes; re-snap; the director spot-checks every P1.
- [ ] **Step 4: Gate** — `npx hyperframes lint .` 0 errors; `node tools/engine-test.cjs`, `node tools/cast-sheet.cjs`, `node tools/double-check.cjs`, `node tools/seek-check.cjs` all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "critic wave 1"`

### Task 10: Render, deliver PL, build the EN copy

**Files:** `cien-podwojny-en\` (copy), `index.html` (EN: `lang` default `en`, `<html lang="en">`)

- [ ] **Step 1: Deliver PL** — `node tools/deliver.cjs` → Expected exit 0: `exports/cien-podwojny.mp4`, `exports/cien-podwojny-phone.mp4`, loudness PASS, sync PASS (`exports/deliver-report.txt`).
- [ ] **Step 2: Watch** the phone MP4 end to end with sound; fix anything found (back to Task 9).
- [ ] **Step 3: EN copy** — `robocopy cien-podwojny cien-podwojny-en /E /XD node_modules exports .snaps .tmp .git`, set `package.json` name `cien-podwojny-en`, the composition variable `lang` default `"en"`, `npm install`.
- [ ] **Step 4: EN literal scan (Review Focus 4)** — `grep -nE "[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|zł|Piekarnia|Pewnej" src/scenes/*.js src/cast.js src/sets.js src/engine/shadow.js` → Expected: no matches. Then `node tools/shot.cjs all --scale 0.25` and read every frame for Polish.
- [ ] **Step 5: Deliver EN** — `node tools/deliver.cjs` in `cien-podwojny-en` → exit 0.
- [ ] **Step 6: HTML player** — if okna-95 has no `tools/build.cjs`, copy it from `D:\Work\tools\procedural-film` foundation (`tools/build.cjs`) and run it to get `dist/cien-podwojny.html` (and `-en`); open once.
- [ ] **Step 7: shots.md** — write `exports/cien-podwojny-shots.md` (one line per shot) in both projects.

### Task 11: Campaign deliverables, Story, copy, and the skill update

**Files (repo, local-only unless noted):**
- Copy to: `docs/marketing/creatives/anomaly-alerts/renders/pl/` and `/en/`: `cien-podwojny{,-en}.mp4`, `-phone.mp4`, `dist/*.html`, `-shots.md`
- Create: `docs/marketing/scripts/build_anomaly_alerts_shadow_story.py` (from `build_fat_finder_story.py`), `docs/marketing/copy/feature-anomaly-alerts-shadow-film-pl.md`
- Modify (tracked): `.claude/skills/ad-film/SKILL.md` (§1d table: a **Shadow puppets** row — For / Reference project `D:\Work\tools\films\cien-podwojny\` / How it is built: `src/engine/shadow.js` + polygon cast `src/cast.js`), `.claude/skills/ad-film/PITFALLS.md` (a "Shadow puppets (from `cien-podwojny`)" section with every defect that cost a re-do), memory `project_yoka_dog_character.md` (film 1 done, paths)

- [ ] **Step 1: Copy renders** to both `renders/` folders (do not `git add`).
- [ ] **Step 2: Story** — the script renders 9:16 and 4:5 from the poster frame (28.5 s) + the Google Play sticker; run it; look at both PNGs.
- [ ] **Step 3: Copy doc** — Polish caption (truthful: „zauważa”, never „zwraca”), hashtags, the shot list.
- [ ] **Step 4: Skill + pitfalls + memory** — edit the three files; `git add .claude/skills/ad-film/SKILL.md .claude/skills/ad-film/PITFALLS.md && git commit -m "ad-film: shadow puppets house style (cien-podwojny)"` (local commit only, no push).
- [ ] **Step 5: Hand over** — SendUserFile the PL phone MP4 and the Story PNG; update the film's `HANDOFF.md` to all-done.
