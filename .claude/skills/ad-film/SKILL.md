---
name: ad-film
description: Use when the user asks for a procedural / animated / hand-drawn advert film for AI Budget Assistant (AI Budżet) — "zrób film", "сделай рекламный фильм/ролик про фичу X" in the procedural-film style (drawn on canvas, synthesised sound). Wraps the global procedural-film skill with the product's brand brief, truth rules, file locations and the Story companion. NOT for the screenshot-based Reels (build_<feature>_reel.py) — those are a separate Pillow pipeline.
---

# Ad film (AI Budżet × procedural-film)

A thin wrapper. The **method** is the global `procedural-film` skill — invoke it and follow
its ten steps exactly. This file only supplies what that skill cannot know: our brand, what
an advert for a real product may and may not claim, where things live, and what "done" means
for a campaign.

## 1. Before invoking procedural-film

1. **Check the tool is installed**: `~/.claude/skills/procedural-film/SKILL.md` must exist. It is
   a junction to `D:\Work\tools\procedural-film\skills\procedural-film` (clone of
   `kuhnhomeuk-cell/procedural-film`, local branch `windows-fixes` carries the
   `pathToFileURL` fix Playwright needs on Windows). Updating: `git fetch && git rebase
   origin/main` on that branch — never `git pull` on `main` and lose the fix.
2. **Pin the feature to the wiki** before writing a word of story: read the feature's page in
   `docs/wiki/features/` (and `user_docs/pl/` for the app's own Polish wording). Every number,
   label and claim in the film must come from there — copy the research into the film's
   `.tmp/research/` as procedural-film step 2 asks.
3. **Confirm the brief** with the user (procedural-film step 0): feature, mode (default
   **drawn**), the one-sentence premise, length (~30 s), aspect (default 9:16, 1080×1920).
4. **Read `PITFALLS.md`** (next to this file) and paste the rows that apply into the film's
   `docs/SCENE-BRIEF.md`. When the film is delivered, add every new defect that cost a re-do —
   symptom → cause and fix — to `PITFALLS.md`. That file is how the next film starts smarter.

## 1b. Story rules (apply in the storyboard step)

- **One turn at 35–45 % of the length** (a click, a hit, a flash): before it small, quiet, cool;
  after it big, bright, warm. Save the warm brand accent for after the turn.
- **The last ~3 s are a poster**: every text fully written, nothing fast moving — the CTA must
  land complete by `duration − 3 s` (the house CTA is 2.5 s; give it 3 s and finish its type-on
  in the first beat).
- **Frame 0 is never empty**: it is the autoplay cover. Start drawing slightly before zero.
- **≤ 15 s: one continuous scene** in 3–4 phases. **≥ 20 s: a chain of scenes** where the last
  object of one scene becomes the first object of the next (match cuts, G tables).
- **Captions**: cap height ≥ 48–56 px at 1080 wide (≈ 66–78 px font), slogans ≥ 64 px cap height;
  nothing must-read in the bottom 20 % (the Shorts/Reels UI).
- **Plan a magnifier** for every payoff UI state (a chip, a pill, a total) — a character's phone is
  too small to read at feed size (PITFALLS.md, Readability).

## 1c. House styles — pick one in the brief (the five character styles here, more in 1d)

| | **Ink** (default) | **Pencil** | **Anime** | **Noir** | **1930s cartoon** |
|---|---|---|---|---|---|
| For | Stories with people and the product's screens: 30 s, chained shots, comedy, characters (Bartek, Kuba, Ola), phone UI | Short "explain the calculation" ads, 10–15 s, one continuous scene: a number being worked out (Safe-to-Spend, budget, real salary, split totals) | Shōnen-action comedy with characters (including caricatures of real people via likeness sheets) and the app's screens: 30 s, chained shots | Comedy noir with the same caricatured cast as anime: a "case" told in typewriter intertitles (where the money went, a suspect, a confession), 30 s, chained shots | A musical comedy number in the style of a 1930s rubber-hose cartoon (Fleischer / Cuphead era): the family re-drawn in that style, a gag, a lightbulb idea, a song, a bow; 30 s, chained shots |
| Look | Hand-inked illustration on striped paper plates + navy blueprint shots | Graphite on notebook/kraft paper: pen lifts, overshooting contours, hatching, eraser ghosts, handwriting written stroke by stroke; six role-based themes (notebook, kraft, chalk, blueprint, neon, mystic) recolour with one line | Clean variable-weight ink line, cel shading (base + hard-edged shadow + highlight), speed and focus lines, impact frames, chibi beats, sound-effect lettering in Polish/English words — never Japanese; gradients and glows allowed | The anime cast and props re-dressed (fedora + trench, black dress + pearls + veil, bow tie + magnifier), then a grading pass: black and white with crushed blacks, one hard key light, venetian-blind bands, rain, grain, vignette; ONLY the brand orange stays in colour (+ Kasia's red hair). The turn = the phone floods the grey with orange | Thick even ink lines, flat fills with one soft shade rim, pie-cut eyes, rubber-hose limbs with no elbows, white four-finger gloves, big round shoes, everything bouncing on the beat (squash and stretch); 30s sets (a sunburst title card, striped wallpaper, a checkerboard floor, a stage with curtains); a vintage pass: warm sepia, grain, flicker, dust, scratches, vignette |
| Pipeline | global `procedural-film` skill (this file, sections 1–6) | `D:\Work\tools\pencil-film\` — read its `README.md`; new film: `node D:/Work/tools/pencil-film/new-film.cjs <slug> --theme notebook --seconds 12`; render with HyperFrames 0.8.111 (`-q standard -w 6`, ~45 s for 12 s); deliver: `node tools/deliver.cjs` | Copy the reference project `D:\Work\tools\films\paragon-anime\` (read its `HANDOFF.md`): engine `src/engine/anime.js`, `fx.js`, `sets.js`; tools `shot.cjs`, `measure.cjs`, `deliver.cjs`; HyperFrames render (~2 min for 30 s, `-w 6`); score = J-rock OP from `audio/synth.py`, checked by `audio/onsets.py` | Copy the reference project `D:\Work\tools\films\sprawa-pieniedzy\` (EN copy `sprawa-pieniedzy-en`): the anime engine + `src/engine/noir.js` (wardrobe, sets, `NOIR.grade`, typewriter caption, stamp, rain), scene hooks `noir(t)` (grade options) and `post(ctx, t)` (drawn after the grade); cues authored in beats in `tools/gen-cues.py`; score = noir jazz (`audio/synth.py`: muted trumpet, upright bass, brushes); HyperFrames ~3.5 min for 30 s (the grade is a per-pixel pass) | Copy the reference project `D:\Work\tools\films\na-glos\` (EN copy `na-glos-en`): `src/engine/hose.js` (the figures `HOSE.michal/kasia/kid`, gloves, eyes, mouths, `HOSE.vintage`) and `src/hose-props.js` (the phone with real app screens, balloons, notes, bulb, title card, iris, sets); a scene returns `noir(t) -> { vintage: {...} }`; cues in beats in `tools/gen-cues.py` (144 bpm: cues on whole beats only); likeness sheet `tools/hose-sheet.cjs`; score = swing foxtrot where an instrument "sings" each character's line |
| Characters / UI | `src/cast.js` | none — it is a diagram style; composite the real app icon PNG in the poster | `src/cast.js` (characters, expression params, chibi) + `src/cast-props.js` (phone, real app screens, receipt); every on-screen string in `src/strings.js` — a language is a new table there, not edited scenes | as anime, plus `src/cast-audit.js` (the Audyt wydatków report screens, the big report card, lineup suspects); the grade's `keepRects` / `unlit` / `raw` rects are in SCREEN coordinates | `src/engine/hose.js` figures with anchors (`head`, `mouth`, `handL`, `handR`); the app screens are drawn in `src/hose-props.js` from `src/strings.js` |

All five styles share sections 1b (story rules), 2–3 (brand and truth), 4 (where deliverables go) and 6 (done means: deliverables + Story + copy). Reference pencil film: `D:\Work\tools\films\pencil-test-2\`. Known pencil issues: the script `cj` pair can read as "g" (prefer the sans hand for words with "cj"), the script middle dot sits low. Anime: present the likeness sheet and style frames before any scene is written (PITFALLS.md, Characters). Noir: show a costume look-test sheet first (`D:\Work\tools\films\paragon-anime\tools\noir-sheet.cjs` made the one that was approved).

## 1d. More house styles (no shared character rig)

Each has a reference project to copy; all keep the harness (cues authored in beats in `tools/gen-cues.py`, `src/strings.js` with PL + EN tables, an `-en` copy project with the `lang` default changed, HyperFrames render, `tools/deliver.cjs`) and a score written by a background agent from `audio/synth.py` of the previous film.

| Style | For | Reference project | How it is built |
|---|---|---|---|
| **8-bit RPG** | A Pokémon-style turn-based battle: the feature is the item that wins (subscriptions as monsters, the app as the menu choice); the family as pixel sprites — the party faces the camera (eyes visible), the son fights beside the hero, the ending is a castle, a treasure chest and Princess Kasia | `D:\Work\tools\films\rpg-subskrypcje\` | `src/engine/pix.js`: draw with ordinary canvas shapes on a NATIVE 360x640 canvas, `PIX.quantize()` snaps every pixel to an NES-like palette, `PIX.present()` scales 3x nearest-neighbour. Pixel text = a system font (bold 11-17 px Consolas/Tahoma) with its alpha thresholded, so Polish diacritics survive (stock NES fonts lack them). Chiptune score (2 pulses, triangle, noise) |
| **Kinetic typography** | A fast, text-only explainer: words and numbers slam in on the beat; best for counts, steps and "before/after" (bank import: 351 transactions sorted into categories) | `D:\Work\tools\films\import-typo\` | `src/engine/typo.js`: `TYPO.word` (slam with overshoot, strike-through, maxW), `TYPO.count`, `TYPO.chip`, `TYPO.lineRain`; Segoe UI Black on a dark warm ground, brand orange for numbers. Modern house / future-garage score with a dead stop and a drop at the turn |
| **90s desktop OS** | A parody of a mid-90s operating system: the app's alerts as a cascade of exclamation dialogs that the turn tidies into one window; an installer wizard as the end card | `D:\Work\tools\films\okna-95\` | `src/engine/os95.js`: teal desktop, grey 4-px bevels, navy title bars, dialogs, icons, cursor, progress bar, taskbar. Our own "AI Budżet 95" — never a real OS name, logo, wallpaper or startup sound. Cheesy General-MIDI score |
| **Shadow puppets** | A fairy tale told by Lotte Reiniger-style silhouettes on an amber backlit screen: the feature as a story beat (a duplicate charge = a shadow that grows an identical double); the phone is the ONLY colour, so the turn is light, not motion; the family's hand on a rod does the action (the app only warns); Yoka the family's dog (miniature schnauzer) as a background reaction | `D:\Work\tools\films\cien-podwojny\` (EN `-en`) | `src/engine/shadow.js` (`SH.screen/frame/ground/puppet/cartouche/phone/push/alertRows/magnifier/lensPush/lensRows/coin/bubble`): ink polygons on one offscreen layer, cut-outs punched with `destination-out`, pins + rods, a 1/8-size upscaled penumbra (a full-frame blur cost 70 ms), `{ rim }` for a figure over an ink set; `src/cast.js` = POLYGON cast (Michał, Kasia, son, Yoka, baker) with group-tagged parts posed by `CAST.pose`, `sleep` = the standing figure turned a quarter under a blanket, `wake` = the upper body on the mattress; `src/sets.js` baked silhouette sets with front layers drawn over puppets; the look test for all four craft styles (shadow, paper, woodcut, clay) is `D:\Work\tools\films\craft-sheet\`. Music-box score (celesta, pizzicato). Tests: `tools/engine-test.cjs`, `cast-sheet.cjs`, `sets-test.cjs`, `double-check.cjs`, `seek-check.cjs` |
| **Cut paper** | A collage told with coloured paper pieces: newspaper cut-out letters, price tags that drop one over another, a phone that unfolds like a pop-up book; warm and domestic, good for money-in-everyday-life features (Inflation Shield: prices rise, the family stocks up from its own receipts); the family + Yoka in colour | `D:\Work\tools\films\tarcza-papier\` (EN `-en`) | `src/engine/paper.js` (`PA.bg/layer/figure/strip/letters{maxW,jitter}/tag/phone/push/card/hero/magnifier/lensPush/lensCard/popup/frame`): every piece is a wobbled torn polygon with a drop shadow, one grain pattern texture (per-piece specks cost ~1 ms each), FIXED seeds per figure (a changing seed makes the paper boil); the polygon cast from `cien-podwojny` with VISIBLE eye/glasses details on profile heads (shadow cut-outs are invisible in colour); `src/props.js`, `src/sets.js` (front layers, `{ taken }`), and `src/geometry.js` = ALL shared positions, placed once in `tools/geometry.cjs` before any scene brief. Tests: engine / cast / sets / truth (reads the push and screen strings from the app's source, checks every saving is "~") / seek / `cut-check.cjs` (a continuing cut must not jump) / `feed-check.cjs` (text on a big pop-up page reads at feed size). Ragtime score. |
| **Woodcut** | A chronicle told as a two-colour lino print: black + one print red on ivory paper, red ONLY for money, the app and two signature details (Kasia's hair, Yoka's collar); good for "who takes our money each month" stories (subscription manager: hooded tribute collectors at the castle gate, the family closes the gate itself) | `D:\Work\tools\films\kronika-daniny\` (EN `-en`) | `src/engine/woodcut.js` (`WC`): ivory grain, chronicle border, carved ground strokes, `WC.figure` (black masses with white gouges, hatched light parts, thick wobbled outline, figure sprites cached with geometry normalised to the bbox for seek determinism), `WC.cartouche` (serif caption on a carved banner), coins, the phone/push/screen printed ivory-and-black with the red accent, circle-aware lenses with a `side` leader; the polygon cast from `tarcza-papier`, a lever IK pose; push-ins with captions/lenses in screen space (`post()`). Tests as cut paper + guards in `sets-test.cjs` (no bar over a plaque, family inside the frame). Medieval chronicle score (lute, recorder, shawm, drone, frame drum, bell). |
| **Clay** | A stop-motion plasticine world: soft volume, key light, specular, thumbprints, contact shadows, a pastel set; good for \"things sort themselves\" features (receipt category split: a long receipt's lines peel off as clay rolls into labelled bowls); the family + Yoka in clay | `D:\Work\tools\films\ulepione-z-paragonu\` (EN `-en`) | `src/engine/clay.js` (`CL.blob/figure/label/roll/ball/bowl/bubble/receipt/phone/screen/magnifier/lens*/tick/viewfinder/frame`): volume BAKED once per pose/prop/set into offscreen sprites (blur filters per frame are unaffordable), text drawn directly; the polygon cast from `tarcza-papier` with photo / phone / leash / reach poses; per-shot cameras (push-in ~1.25×) with captions and lenses in screen space; a geometry dry-run that renders the real camera frames and checks in screen space. Tests as cut paper (truth reads `receipt.*` / `receiptCategorySplit.*` and the app's currency format; lines sum to chips, chips to the total; nothing says saved before the tap). Bouncy stop-motion score (marimba, tuba, kazoo, squelches); keep the first 70 ms soft (AAC priming). |
| **Silent film** | A 1920s silent comedy: sepia nitrate with flicker, gate weave, scratches and dust; the cast speaks only in art-deco INTERTITLE cards (an argument fought in cards); the turn is a projector JAM → film burn → Academy leader (beep on "2") → the second reel in hand-tinted stencil colour; payoff UI can BECOME an intertitle; good for social / "between people" features (shared groups: friends without the app settle a barbecue bill); the anime cast in 1920s wardrobe + friends Bartek and Ola + Yoka | `D:\Work\tools\films\kto-komu-ile\` | the anime engine + `src/engine/silent.js` (`SI`: wardrobe hats, `garden/gardenTable/tableTop` sets, `card/argCard/oval/iris/decoFrame/planCard`, `burn/leader`, `camera/flashPan`, `screen.guest/qr` (the browser guest page and the app's group screen), the grade `SCENE.silent(T)` → `{color 0..1, keepRects, unlit, raw}`: sepia LUT + damage at 0, period-dye stencil wash printed off register at 1) and `src/cast-friends.js` (`CAST.bartek/ola/yoka`, kit `CAST._k` for more characters); look test `tools/silent-sheet.cjs`; a flat poster is drawn in `post` AFTER the grade (the stencil wash muddies flat type). Silent-cinema upright piano score (agitato → dead stop at the jam → glissando into a major stride; theatre effects box). |
| **VHS teleshopping** | A 1990s late-night TV-shopping show on a worn videotape: a shouting host and co-host (caricatures of real people via a likeness sheet, with their consent), starbursts, tickers, a channel bug, a VCR OSD with ONE continuous counter for the whole film; the turn is the TAPE REWINDING (`◀◀ REW`, the counter running backwards) through the user's own past data, then `▶ PLAY` on a suddenly CLEAN signal; payoff gag: STOP on the remote freezes the shouting host; good for "what you usually pay / your own history" features (receipt price check) | `D:\Work\tools\films\super-okazja\` (EN `-en`) | the anime engine + `src/engine/vhs.js` (`V`: the grade `SCENE.vhs(T)` → `{clean, damage, tracking, rew, roll, keep}` — soft luma, chroma smeared right, scanlines, tracking band, head switching, rewind tearing; `clean: 1` skips it; `osd/timecode`, `caption` (teletext plate), `bug/burst/ticker/banner/chyron/slash/product`, sets `studio/aisle/checkout/living` + `tv()` (a CRT with a live studio feed), screens `camera/analyzing/result` with the real PriceFindingsCard, `receipt/receiptShot/rewindFrames`) and `src/cast-tv.js` (`CAST.host/cohost`, Kasia's shopping wardrobe, `CAST.heldProp`); look test `tools/vhs-sheet.cjs`, likeness `tools/vhs-likeness.cjs`; `src/cast.js` `armIK` picks the elbow side from the body, never a per-pose sign. 90s teleshopping/eurodance jingle with tape hiss and wow; the rewind plays the score backwards; PLAY drops the hiss. |
| **Felt** | A needle-felted stop-motion TV WEATHER FORECAST of money: a felt studio with a hand-sewn map, a weatherman, a field reporter in the rain, bead rain on strings; the "fronts" are the app's obligations; the turn is the weatherman FLIPPING the map to its stitched back, where the fronts turn out to be already subtracted (the real breakdown rows); payoff gag: the bead rain is pulled up on its strings; good for "one number you can trust today" features (Safe-to-Spend: 2 400 − 210 − 840 − 342 = 1 008, / 12 = 84 zł) | `D:\Work\tools\films\prognoza\` (EN `-en`) | the anime harness + `src/engine/felt.js` (`window.FELT` = `F`: baked felt pieces `F.piece/group/blit` with fibre tile, `F.runStitch/stitchLine/embroider/yarn/bead/beadString/rain`, `F.text` (Cooper Black caption plates) and `F.plText` (Polish marks drawn onto Cooper Black's base letters — it has no ąćęłńśźż), the grade `F.grade` driven by a scene hook `felt(t)` → `{warm, vignette, grain}`) and `src/engine/felt-sets.js` (`studio/map/MAP/BOARD/flipBoard/flipPoint/street/cinema/puddle/sun/cloud`, the app as felt: `F.phone/screen/breakdown/chipLens/lowerThird/liveBug`) and `src/cast-felt.js` (`FCAST.michal/kasia/son/yoka`, poses + anchors, elbows from `armIK`); look test `tools/felt-sheet.cjs`, perf `tools/felt-bench.cjs`. Felt-and-wood band TV-weather jingle in C major (whistle + glockenspiel, ukulele, woodblock thunder, bead-rain shaker). |
| **1950s home of tomorrow** | A mid-century educational short (UPA / Mary Blair era): flat colour shapes with dry-brush texture printed slightly OFF-REGISTER from a charcoal line, geometric figures, boomerangs and atomic starbursts, a narrator caption plate; the 1956 world is a FADED Technicolor print (cyan fade, warm cast, grain, dust, gate weave) and the turn SNAPS it to clean modern colour; the anachronistic modern phone is the only crisp object; good for "the promised future vs what the app does today" features (bank-push auto-capture: 1956 promises a robot accountant, in 2026 a card tap and the expense logs itself; the robot droops and Yoka walks it on a leash) | `D:\Work\tools\films\dom-przyszlosci\` (EN `-en`) | the anime harness + `src/engine/retro.js` (`window.RETRO` = `R`: baked flat sprites with texture + off-register line, motifs, `R.titlePlate/caption/letters/label/twinkle/starburst/kidney/boomerang/atom`, the grade `R.grade` via the scene hook `retro(t)` → `{fade 0..1, grain, weave, dust, halation, keepRects}`, phone + Android notification + `R.pushCloseup` + `R.notifLens/rowLens` + `R.privacyPlate`, the poster `R.posterBg/cta/appIcon`), `src/engine/retro-sets.js` (kitchen of tomorrow, table, ledger, receipts, shop checkout + card terminal) and `src/cast-retro.js` (`RCAST`: Michał, Kasia, the son, Yoka, the robot „Rachmistrz 3000” with lamps/reels/quill poses `idle/raise/droop/led`); faces Gill Sans Ultra Bold (+ Condensed) and Mistral BUNDLED in `assets/fonts` (Polish set proved); look test `tools/retro-sheet.cjs`. 1950s industrial-short orchestra (brass, strings, vibraphone, theremin) on an optical-soundtrack band-limit that cuts dead at the turn into a clean modern notification ding and groove; the orchestra returns restored. |
| **Real 3D (Three.js)** | A miniature world in real 3D that reads as an expensive object, not a drawing: glass, metal, wood, lit windows, bloom; a camera that orbits and flies through it; the app's UI as a 2D layer composited over the render; good for "where / in what place" features (expense map: a snow globe of Gdańsk, receipts swirl instead of snow and land as pins, the glass dissolves into the app's map) | `D:\Work\tools\films\gdansk-w-kuli\` (EN `-en`) | `src/world.js` (`createWorld(canvas)` → `render(t, state)`, `projectWith(cam, p)`; all geometry procedural, CanvasTexture facades, `RoomEnvironment` PMREM, PCF soft shadows, `EffectComposer`: RenderPass → **NaN-scrub ShaderPass** → UnrealBloom → Output), `src/film.js` (an ES module: per-shot `state(T)` → camera `{r, az, el, tx, ty, tz, fov}` + world params, the GL canvas `drawImage`d into the 2D `#cv`, then the overlay), `src/overlay.js` (`OV`: frosted caption plates, the phone + the app screens, the Leaflet-look map, touch, brass lens, CTA, grade); `index.html` loads three from `node_modules` via an importmap; `tools/snap.cjs` (frames + sheet at global times), `tools/look.cjs` + `lookdev.html` (look tests). Music-box Christmas score with glass rattle at the turn. Render ~3.5 min for 30 s on the local GPU. |

## 2. Brand brief — paste into the film's art bible

The procedural-film art bible keeps sections 1–9 (house style) and lets you rewrite 2.2, the
tints in 2.3, and 10 per film. For our films those sections start from the reference film
`D:\Work\tools\films\receipt-journey\docs\art-bible.md` — copy its **2.2 brand rows**
(`brand*`, `phone*`, `copper*`) and **10.2 phone / 10.6 app icon / 10.7 mistakes** verbatim,
then add the feature's own subjects.

- **Brand accent** (from `apps/mobile/src/theme/colors.ts`): `brand #E37F2B`,
  `brandDeep #B85F16`, `brandPale #FBE3CC`, `brandGlow #FFBA60`; schematic tint
  `schemBrand #F2A66A`.
- **App icon** (`apps/mobile/assets/icon.png`, look at it): a copper **robotic hand, palm up**,
  holding a glowing orange open wallet above the palm, on a dark rounded-square tile. Never a
  human hand, never grabbing or pointing, never a piggy bank.
- **Name on screen**: `AI Budżet` (with the ż). Captions are **Polish**, correct diacritics
  always ("dziś", "każdy", "Budżet") — stripped diacritics are a P1 in the critic wave.
- **CTA shot** (last ~2.5 s), the reference film's shot 14 is the template: caption
  `Pobierz za darmo`, the icon tile, `ai-budget.pl` (weight 800, `brand`), a line
  `Android · przeglądarka`, and a `brandPale` pill carrying the feature's first action
  ("Zeskanuj pierwszy paragon" etc.).
- Amounts in **zł**, written `77 zł` (space, after the number) — never $, €, or "PLN 77".

## 3. Truth rules (this is an advert for a real product)

- Show only what the app actually does, as the wiki page describes it. No "saves you X zł",
  no invented awards, ratings, store stars, user counts or testimonials.
- Example figures must be internally consistent (a split sums to its total, a gauge's
  percentage matches its amounts) and should reuse the wiki's documented example when there
  is one.
- No real shop names, bank names or logos (a receipt header is `PARAGON FISKALNY`); the phone
  is an unbranded slab.
- Respect each feature page's copy constraints — e.g. receipt price check may never say
  "overcharged", deposits are "already paid", never refundable.
- Platforms: Android (Google Play) and the browser (`app.ai-budget.pl`). There is **no iOS app** —
  never draw an App Store badge or say iPhone.

## 4. Where things live

| What | Where |
|---|---|
| Film project (sources, `node_modules`, `.frames`) | `D:\Work\tools\films\<slug>\` — **outside the repo**, it is hundreds of MB |
| Reference film to copy idiom from | `D:\Work\tools\films\receipt-journey\` (receipt auto-split + safe-to-spend) |
| Final deliverables | `docs/marketing/creatives/<feature>/renders/pl/` — copy `<slug>.mp4`, `<slug>-phone.mp4`, `dist/<slug>.html`, `<slug>-shots.md` |
| Caption / post copy | `docs/marketing/copy/feature-<feature>-film-pl.md` |

`docs/marketing/` is gitignored and `creatives/`/`copy/` are local-only — do not `git add`
them. Deliver the MP4 to the user with SendUserFile.

## 5. Windows notes

- `foundation/` copied from the skill already carries the `pathToFileURL` fix; keep LF line
  endings (`core.autocrlf=false` on the clone — do not open-and-save scene files with CRLF).
- `npm install` + `npx playwright install chromium` in the film's `tools/`; ffmpeg must be on
  PATH or `FFMPEG` set.
- The pipeline is long (each scene 1000+ lines, several critic waves). Keep a `HANDOFF.md` in
  the film folder updated after every step, so a stopped session resumes instead of restarting.
- After delivery, `.frames/` can be deleted — it is a regenerable snapshot cache (~700 MB).

## 6. Done means

1. procedural-film's own step-10 "done" (gate green, master + phone transcode + HTML + shots.md,
   watched end to end with sound).
2. Deliverables copied to `docs/marketing/creatives/<feature>/renders/pl/`.
3. **A static Story next to it** — a campaign is never the video alone: build
   `docs/marketing/scripts/build_<feature>_story.py` from `build_fat_finder_story.py`
   (9:16 + 4:5, it carries the Google Play link sticker the film can't). Render both aspects
   and look at them.
4. `docs/marketing/copy/feature-<feature>-film-pl.md`: the Polish post caption, hashtags, and
   the shot list from `<slug>-shots.md`.
