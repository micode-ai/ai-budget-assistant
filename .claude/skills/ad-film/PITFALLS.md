# Ad-film pitfalls (грабли)

A living list. **Every film adds to it**: when a scene agent, a critic or the director hits a
defect that cost a re-do, write it here as *symptom → cause and fix* before the film is delivered.
Read it at the start of every film and paste the relevant rows into the scene brief.

Collected from `receipt-journey`, `real-salary`, `shared-family`, `oddam-pietnastego`, `kto-placi`
(and their `-en` copies), `paragon-anime` (the anime house style), `sprawa-pieniedzy` (noir), `na-glos` (1930s cartoon), `rpg-subskrypcje` (8-bit RPG), `import-typo` (kinetic typography), `okna-95` (90s OS), `cien-podwojny` (shadow puppets), `tarcza-papier` (cut paper), 2026-09/10.

## Story and timing

| Symptom | Cause and fix |
|---|---|
| N events "on 8ths" don't fit their window (seven rows in five 8ths; 49 coins "two per 16th"; three ticks on 8ths in a quarter-beat) | The storyboard was written without counting. Count every timed list against its grid before handing it out: events ≤ window ÷ step. |
| The first tap of a shot lands 3 frames after the cut, so its sound cue is early | Frame 0 must equal the previous shot's end, so nothing can change on frame 0. Put the first action at least one 16th after the cut, and put the cue there too. |
| Running totals in the film differ from the storyboard's numbers | The app's maths (a shared line divides among whoever has claimed it so far) beats the storyboard's invented sequence. Let the cast compute from state; write only the endpoints in the storyboard. |
| Viewers can't finish reading a caption before the cut (noir: line 2 finished typing 0.4 s before the cut) | Type EVERY line within ~0.7 s of the shot start and hold it to the cut; budget ~15 characters per second of hold. When a shot is too short for its caption, keep the card up over the first beat of the next shot. Move the typewriter-clack cues with the typing. |
| A caption is half-typed on frame 0 | House rule: captions type on over 6 frames. Only the thumbnail shot (01) draws its caption complete on frame 0. |

## Readability at feed size

| Symptom | Cause and fix |
|---|---|
| The key UI state (a status chip, a pill, a total) is ~13–16 px and lost on a phone feed | A phone held by a character is ~300 px wide, so its UI text is tiny. Plan a **magnifier lens or zoom panel** for every payoff state in the storyboard, popping on the beat, joined to the real element by two ink lines. |
| A tapping finger hides the word being tapped, or the price | Aim at the edge of the control (icon end, lower-right corner, chip's bottom edge), never its centre. |
| Speech-bubble tail crosses a face, or a bubble sits on someone's quiff | The cast's tail is vertical. Place bubbles side by side above the heads in speaking order and end each tail in the gap beside the speaker's cheek. Two lines at ~52 px beat one line that runs into the next head. |
| Big phones in a three-shot cover the characters' bodies | Accepted trade-off for readability; keep the faces clear and raise the phones above the table line. |
| A dashed motion line crosses a face | Route overlays through the gaps between heads, or under the chin. |

## Gate and engine

| Symptom | Cause and fix |
|---|---|
| Gate fails "text below y 1540" | A phone or bill placed low draws real text. Keep all UI text above 1540; cast helpers fall back to grey dashes automatically, scenes must not force text there. |
| Frame-cost WARN, 400–900 ms first frames | Cast sprites are cached per pose/scale/boil/target; every new pose or moved hug target rebuilds one. Fine for a WARN; avoid changing poses on every frame. |
| ~100 ms per frame spent on the background | Live `L.stripes` with continuous drift in a set helper. Cache the stripes per boil drawing like the other layers. |
| A "glow" makes an illustrated shot look computer-made | Radial gradients are allowed only on the blueprint plate. Use buzz lines / ink rays on paper. |
| An undefined palette name draws black | Copied scenes reference colours the new film's `lib.pal` lacks. Grep every `P.<name>` against `src/lib.js` after copying a scene from another film. |
| `snap.cjs --help` rendered the whole film | It has no help flag. Always pass `--shot <id> --only`. |
| `render.cjs` output name differs from the expected slug | It names the file after the project folder (`kto-placi-en.mp4`). Adapt the transcode commands. |

## Shared work between agents

| Symptom | Cause and fix |
|---|---|
| Two blueprint shots that should be "the same diagram" drift in styling | No owner for the shared geometry. Name one scene as the owner, make it write the shared block (`// ===== G3 … =====`) **first**, and have the others poll for it and copy it verbatim. |
| A match-cut shot's frame 0 doesn't equal the previous shot's end | The director must forward the exact final-frame calls (stripes call, character pose and opts, screen state) from the finished shot to the next agent. Ask every scene agent to describe its final frame's calls in its report. |
| A characters' expression can't be changed ("grin wider", "eyes slide", "head turns") | The cast API had poses only. Design cast characters with expression parameters (grin level, brow, gaze direction, head turn) from the start. |
| Scenes hand-place hands and props and they drift from shot to shot | The cast exposed whole poses only. Give the cast **hand anchors** (returned points for each hand) and **arm-only / forearm calls** (`CAST.forearm`, `CAST.phoneHeld`) from the start, so a scene attaches a phone or a pointing finger instead of guessing coordinates. |
| A message to a scene agent went to the wrong agent | Keep a written shot → agent map when launching a wave. |
| Characters drift between shots | Characters, phones, app screens and sets live in one `src/cast.js`; scenes call it and never redraw them. |

## Characters, hands and poses (from `paragon-anime`)

| Symptom | Cause and fix |
|---|---|
| A phone held and tapped by two hands tangles into crossed forearms | Both hands came from the same side of the body. Hold the phone with one hand and tap with the hand from the **other** side. |
| A pose with crossed forearms, or a hand floating beside the head, reads as broken | The elbow is hidden or detached. Keep every elbow attached and visible; tightly folded arms need a short, foreshortened forearm (`L2`) or the sleeves cross into an X. |
| A pose looks different in every scene that uses it | Scenes overrode the pose's arm per shot. Fix the cast's default for that pose once and remove the per-scene overrides. |
| A real-person caricature keeps coming back for "one more fix" | Likeness converges feature by feature (hair, then eyes, then relative height). Plan several short rounds, one feature each, and get the likeness sheet + style frames approved **before** any scene is written. |

## Windows and files

| Symptom | Cause and fix |
|---|---|
| A Windows path in a doc turns into `D:\Work<TAB>ools<FF>ilms` | Python/JS string escapes (`\t`, `\f`) in hand-written paths. Use forward slashes, `chr(92)`, or write the file with the editor tool. |
| A bash heredoc fails with "unexpected EOF while looking for matching `'`" | Mixed quotes inside an unquoted or nested heredoc. Write the script to a file with the editor tool and run it. |
| An English string breaks a single-quoted JS literal | Straight `'` in "I'll", "don't". Use typographic ’ “ ” in on-screen English. |
| `sed -i` silently changed a file's line endings | Git Bash `sed -i` writes LF. Keep each file's existing endings; check with `file` after editing. |

## Rendering and audio (from the HyperFrames pencil test, `D:\Work\tools\films\pencil-test\`)

| Symptom | Cause and fix |
|---|---|
| An event drawn one drawing (83 ms) after its sound | The seek time sits just below k/24, and `floor(t*12)` rounds down. Quantise with a tolerance of **+0.05 drawing** (`floor(t*12 + 0.05)`, ~4 ms) — HyperFrames seeks further below k/24 than `+1e-3` covers, so that one still lands on the previous drawing (paragon-anime), and snap cue constants to the drawing grid (`round(c*12)/12`). A reveal `prog(T, cue, …)` is 0 *on* the cue drawing — start it a hair before the cue. |
| `loudnorm I=-14:TP=-1.5` lands at −13 or overshoots the peak | Two-pass linear loudnorm can't reach −14 inside the TP cap on a −15/−16 LUFS mix and falls back to dynamic mode. Two-pass loudnorm then `alimiter`, and measure again. |
| A home-made limiter misses the true peak | Decimating a 4× oversampled signal with `[::4]` drops the inter-sample peak; take the max per group of 4. |
| An eraser leaves striped residue or a ghost that clutters the poster | Sweep a filled band with a rough edge (not a zigzag wider than the brush), pad the rect by overshoot + wobble, and erase to 93–95 % for a "clear the page" rub. |
| "Make the music more anime" | It means a TV-anime **J-rock OP**: double-time drums (120 bpm felt at 240), two rhythm guitars hard L/R + a lead, the royal-road progression IVmaj7–V7–iii7–vi in the choruses, and a key change up a step for the last chorus. Template: `paragon-anime/audio/synth.py`. |
| Sound cues are inaudible or unmeasurable in a dense mix (onset check fails) | The bed masks the cue's attack. Duck every stem for ~45 ms before each cue (paragon-anime: −9 dB) and sharpen the cue's transient; check every onset against the WAV (`audio/onsets.py`, budget 10 ms). |
| HyperFrames is no faster than our renderer on Windows | Screenshot capture mode (~8 fps) plus encoding: ~80 s for 12 s. Iterate with `hyperframes snapshot --at`, render once at the end. |

## Truth

| Symptom | Cause and fix |
|---|---|
| A push in the film says `50 zł` but the real app says `50 PLN` | The product's push copy prints the currency code (`50 PLN`, `EUR 50`). Copy push text verbatim from `notification-i18n.ts`; brand money style applies everywhere else. |
| A child is in the frame and the set has a bar or bottles | No alcohol in any set or receipt when a child appears (paragon-anime moved the scene from a bar to a café; the receipt has no alcohol lines). |
| A feature claim the code doesn't support | Every string, number and status comes from the wiki page, `pl.ts`/`en.ts` or the server i18n. Name the source in the art bible's subject section. |

## Noir grade (from `sprawa-pieniedzy`)

| Symptom | Cause and fix |
|---|---|
| Every panel of a look-test sheet shows the same frame | `FILM.render` memoizes per drawing. Render each panel at a different time (`100 + 10 * i`). |
| The kept colour, the tint or a key light lands beside its object in a zoomed shot | Grade options are SCREEN coordinates and the camera moved the object. Compute them from the camera (the turn: phone at (540, ~976) after the zoom), or from anchors returned this frame. |
| Blind bands stripe across the payoff card and make it hard to read | Mark the card `unlit` (light = 1, no vignette) from the drawing it appears. |
| A grey box shows where the app icon will pop | A `raw` rect leaves pixels ungraded even before the icon draws. Gate `raw` on the icon being visible. |
| A pop, stamp or flash shows one drawing after its sound | `prog(cue, …)` is 0 on the cue drawing (the pencil rule again). Start it ~0.08 s before the cue. And point the sync region at where the event really is (the stamp lands at y 1440, not mid-frame). |
| The orange flood makes the phone screen unreadable | Do not apply the tint inside the keep rects; the screen stays neutral white with only its orange in colour. |
| A Story crop cuts off the hero's hat | Crops copied from another film's Story script: check the frame before you build the card. |

## 1930s cartoon (from `na-glos`)

| Symptom | Cause and fix |
|---|---|
| "Something is wrong with every character's right hand" | The glove was drawn the same way on both sides, so the right one came out inside out (thumb pointing backwards). Mirror the glove across its own axis on one side, so both thumbs point outward. |
| One arm of every character is missing ("не видно правой руки") | The arm target was mirrored twice (the pose already said "outward" with a minus, then the rig flipped it again), so the left-of-frame arm went inward, behind the body, beard or curls. Write arm targets in the figure's own x, check BOTH hands in every shot's contact sheet, and keep a raised hand outside the hair cloud and inside the frame. |
| A bow reads as the whole family tipping sideways | A rotation about the feet is a lean, not a bow. Front view: squash the figure from the feet and close the eyes. |
| A woman reads taller than the man in a two-shot | Hair counts toward height. Measure the top of the hair, not the head (Kasia: figure scale 0.84). |
| A cut opens on a black frame | An iris that opens from radius 0 shows nothing on the first drawing. Start it at ~160 px, centred on the hero's face, and close the previous shot onto the same face. |
| The sync check reports a tap 170 ms early | The approaching finger enters the region before the press. Check the press frames in a snapshot; such a region is a false positive. |
| A `✓` (or other symbol) renders as a box in a Pillow Story | Segoe UI Bold has no glyph for it. Use text only, or a font that has the glyph. |
| `cat > file <<'EOF'` with JS inside fails again ("here-document delimited by end-of-file") | Already in Windows and files: write scripts with the editor tool. A heredoc that holds both quote kinds breaks. |

## 8-bit RPG, kinetic typography, 90s OS (from `rpg-subskrypcje`, `import-typo`, `okna-95`)

| Symptom | Cause and fix |
|---|---|
| Pixel art looks like a blurry vector drawing | Antialiased shapes at full size. Draw at the native low resolution, snap the palette, then scale up nearest-neighbour; text must be thresholded, not just drawn small. |
| "The hero has no eyes in the battle" | The genre's back-view player sprite hides the face, and a caricature of a real person needs his face. Turn the party to the camera; put the supporting cast (the son) in the fight too, reacting to every hit. |
| A victory screen feels empty | A bare "YOU WIN" is no reward. Give the ending a goal from the genre: a castle, a treasure chest that pays out the saving, a princess (Kasia) who joins the party. |
| Polish letters vanish in the pixel font | The stock 8x8 NES fonts have no ą ę ł ś ż. Render a system font at native size and threshold its alpha; bold Consolas/Tahoma at 11 px and up keep the diacritics. |
| A string in the EN version is still Polish ("AI Budżet" in a push, "-87,40" in a column) | A literal in a scene instead of a `STR` key. Every visible string, including brand names and number formats, goes through `strings.js`; check the EN contact sheet frame by frame. |
| A wide word overflows the frame on its first frame | The slam starts at 1.6x scale. Use a smaller `from` (1.15) for long headlines. |
| A typed/stacked layout leaves the bottom third of a 9:16 frame empty | The Reels UI covers the bottom 20 %, but empty is not the same as safe. Fill it with decoration (ground, fence, flowers, a taskbar) that carries nothing must-read. |
| A claim the feature can't back ("AI reads your PDF", "the app cancels the subscription") | Check the gate and the actor: AI PDF reading is Pro, the tracker only reminds — the user cancels. Say who does what on screen ("MICHAŁ anuluje…"). |
| A real-world UI parody drifts toward a trademark | Use the era's grammar only (bevels, title bars, an hourglass), our own product name, our own sounds. |

## Shadow puppets (from `cien-podwojny`)

| Symptom | Cause and fix |
|---|---|
| A figure vanishes against the house or the bed | Ink on ink: a silhouette in front of an ink set has no edge. Pass `{ rim: SH.LIGHT }` to `SH.puppet` (a light outline under the puppet), or keep a strip of screen light between figure and set. |
| Two puppets read as one blob (the baker and his double, a couple in bed, a family sitting up) | Silhouettes merge wherever they touch. Measure the placed figures' x-extents and keep ≥ 20 px of light between figures that must read separately; a front-view puppet is wider than it looks (the baker at s 0.95 is ~270 px). |
| People in bed read as a crumpled lump or "half a body" (user: "образы в тени вообще не понятны") | A front-view figure turned a quarter under a blanket, or cut at the waist to "sit up", has no readable outline. Bed poses are PROFILE poses (Reiniger's own rule): `lie` = a human profile face up (forehead, nose, lips, chin) on a pillow edged by a cut line, above a blanket hump; `sit` = the whole upper body upright, never a torso cut at the waist. Two sleepers: the far one higher, on her own pillow. A circle with a triangle for a nose reads as a cat's ear. |
| A close-up of a held phone hides the family it belongs to | Show the family reacting first, then cut to an INSERT (the room dimmed behind the phone); the tapping hand is a short hand from the frame edge (finger, knuckles, palm, wrist), not a long stick across the frame. |
| The payer looks like the villain (a black mask with white eye slits) | Glasses punched as filled holes read as a burglar's mask in silhouette. Cut the glasses as RIMS (rings), not slots. |
| The son reads as an owl or a cat | His cat-ear headband plus dot-eye holes, without a body below, make an animal head. Take the headband off when he sits up or sleeps. |
| Arms raised "to wake up" read as cheering | Sitting-up poses reach forward/out (≤ the head top), never straight up. |
| The magnifier crops the payoff text | An optical zoom of a 170–420 px phone is wider than the lens. Lay the payoff out at large size IN lens coordinates (`SH.lensPush` / `lensRows`), at the FINAL radius — the pop only scales it, or the lines re-wrap and touch during the pop. |
| The turn's flash looks like a dim | A full-frame translucent overlay greys the ink. Light the turn additively ('lighter') around the source, under the ink, and keep the room warmer afterwards. |
| The proscenium frame slides during a camera push | `SH.frame` must draw under the identity transform; a punch-in whose fixed point lies below the frame bottom shows past the canvas (white strip) — keep the fixed point inside the frame. |
| cues_check fails by 90–210 ms although the picture is on the beat | The detector catches the FIRST change in the window: a coin's flight, a hop, a rise toward the event, or a hard cut inside its baseline window. Make the sync region cover only the EVENT (the coin's resting band, the bubble), let the object hold still before it vanishes, and cap the baseline (a cut is not boil). |
| The action reads as the app doing it ("the app removed the charge") | A bare rod or a disembodied effect after the phone shot gets credited to the app. Put the family's hand on the rod — the app only warns. |
| A shared set or cast value in the storyboard is physically impossible (arms crossing, figures overlapping) | The storyboard was written from numbers, not from the placed figures. Before briefing scene agents, place every figure of the shared geometry once in a test frame and look. |

## Cut paper (from `tarcza-papier`)

| Symptom | Cause and fix |
|---|---|
| Storyboard positions collide (a headline over the window, a phone floating in the air, an arrow missing its target) | Numbers typed into a storyboard are not placed figures. Put every shared position in ONE file (`src/geometry.js`), render one key frame per shot from it (`tools/geometry.cjs`) and LOOK before the scene brief; scenes read GEO, never retype numbers. It caught three collisions before any scene agent started. |
| A product moves "by itself" (packs fly into the basket) | Reads as the app acting — the app only suggests. Put a hand at the object on its cue (a `reach` pose; the object leaves FROM the hand). |
| A metaphor over-claims ("the shield stops the price arrow" = "the app stops inflation") | Keep the metaphor true to the feature: the shield guards the family's STOCK while the arrow keeps climbing; the price rises again and they are covered. |
| A visible sum that a viewer can check does not add up (+1,50 × 4 ≠ ~12 zł) — and then "fixed" to a sum the APP does not compute (gap × qty, while Inflation Shield halves the end-gap) | On-screen arithmetic must follow the feature's own formula, read from the code/wiki, not the obvious one: here gap × qty / 2 ≈ the estimate (a sharp viewer's gap × qty then over-reads, never under-reads, the claim). Test it in `truth-test.cjs`; the final reviewer caught the first version. |
| Text on a big standing page is legible at 1080 but not in the feed (~25 %) | Size it for the feed: a page scaled from the phone screen (1.4×) put the push body at ~5 px in the feed. Give the page an absolute width so the body is ≥ ~38 px at 1080 and pin it with `tools/feed-check.cjs` (reads the scene's `pushRect(T)`). |
| The amount wraps alone onto the next line („~12,00 / zł”) | Format money like the app does: a no-break space between amount and currency (Intl uses U+00A0); test the format. |
| A lens line falls outside the circle at a different radius | Lay lens text out circle-aware (each line wraps to the chord at its height), shrink when it cannot fit, never split the last short line (`nowrap`), test at every radius the storyboard uses. |
| A pop-up/fold shows sheared text or too few in-betweens | Draw text only at fold ≥ 0.8; check the easing gives ≥ 5 visible mid-fold drawings (a pure ease-out overshoots to ~1 in 4). |
| A continuing cut jumps (the same kitchen, different paper edges) | Two shot files drew the same figures with different seeds / lean. Share seeds across a continuing cut and test the last/first drawings with `tools/cut-check.cjs`. |
| A per-letter jiggle done by overriding `ctx.translate` | Fragile monkey-patching of the canvas API; add the option to the engine (`PA.letters({ jitter })`). |
| An action that is only implied ("he reads the paper": a newspaper standing on the table edge in front of a man with no hands) | The user could not tell what he was doing. An action needs its body: a pose that does it (`CAST michal('read')`: both hands up at the shoulders) and the prop IN the hands, with the hands drawn again over the prop so they grip it; the face peeks over. Pinned in `cast-sheet.cjs` (the paper sits at the reading hands). |
| A member of the agreed cast is simply missing (the son never appeared) | The cast list lives in the series spec, but scenes are briefed shot by shot and nobody checked the sum. Check the cast per shot in the storyboard, and pin it (`cast-sheet.cjs`: every home shot's GEO has `syn`). |
| A comment inserted mid-line (`a: 1, // note b: 2,`) silently drops the rest of the object | Happened three times in this film via sed/patch scripts; the key-parity check in `truth-test.cjs` and a page error caught them. Put comments on their own line. |

## Woodcut (from `kronika-daniny`)

| Symptom | Cause and fix |
|---|---|
| A gate shot reads as one black tangle (portcullis, a hooded figure and the dog merge; the lever invisible) | Woodcut black masses have no tonal separation. Keep a mid-tone (hatched) passage behind a grille, thin bars with WIDE ivory gaps, the figure behind it hatched rather than solid, a plaque in a bar gap, and the actor's mechanism big and in front (a lever post gripped and pulled). Guard it: no bar pixels over the plaque text at hold frames (`sets-test.cjs`). The director's review caught it after delivery. |
| A push-in crops the family at the frame edge | Check every cast member's bbox inside x 60–1020 at every push-in frame (`sets-test.cjs` guard); drop the push-in when the subject is the whole family. |
| Seek is not deterministic with sprite caches | A cache key built from raw float geometry flips an edge pixel between forward and backward seeks. Normalise geometry to the bbox (1/256 px) before hashing; key plaques by their exact text + size. |
| Chain clinks before a slam steal the slam's onset in the sync check | End the preparatory SFX before the event's sync region, or exclude it from the region. |
| The push amount reads „43,00 PLN” in the film but the phone shows „43.00 PLN” | The server cron fills `{amount}` with `Number(amount).toFixed(2)` — a dot, not the locale comma. Read the FILLER, not just the template; the truth test pins it. The in-app screen uses `formatCurrency` (pl-PL comma; EUR as de-DE „47,47 €”). |
