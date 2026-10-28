# Ad-film pitfalls (грабли)

A living list. **Every film adds to it**: when a scene agent, a critic or the director hits a
defect that cost a re-do, write it here as *symptom → cause and fix* before the film is delivered.
Read it at the start of every film and paste the relevant rows into the scene brief.

Collected from `receipt-journey`, `real-salary`, `shared-family`, `oddam-pietnastego`, `kto-placi`
(and their `-en` copies), `paragon-anime` (the anime house style), `sprawa-pieniedzy` (noir), `na-glos` (1930s cartoon), `rpg-subskrypcje` (8-bit RPG), `import-typo` (kinetic typography), `okna-95` (90s OS), `cien-podwojny` (shadow puppets), `tarcza-papier` (cut paper), `kto-komu-ile` (1920s silent film), `super-okazja` (VHS teleshopping), 2026-09/10.

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

## Clay (from `ulepione-z-paragonu`)

| Symptom | Cause and fix |
|---|---|
| A clay frame costs seconds (blur filters per piece: core shadow, contact shadow, specular) | Never blur per frame. Bake each figure pose / prop / set piece once into an offscreen sprite keyed by pose + seed + scale and blit it; animate by transforming sprites; draw text (receipt, screen, lens) directly so it stays crisp. A busy frame went to ~1.5 ms. |
| A sprite cached under a rounded radius but drawn with the exact one breaks seek determinism | Key AND build the sprite on the same rounded value (`CL.roll`); `seek-check.cjs` caught it. |
| Home shots waste the top half of the frame (wall, window) and the family, bowls and flying balls are tiny in the feed | Push the camera in (~1.25×, capped by the width that keeps every cast member in frame) per shot, framed on the subject; captions, bubbles and lenses stay in screen space; the same camera across a continuing cut (cut-check 0 %). Re-place the set in world px to fit the push-in. The director's review caught it after delivery. |
| A HyperFrames render comes out ~6 dB quieter than the score (master −22.3 LUFS from a −16.1 WAV); render.log says "Audio lowered by 6.2 dB to stay under −1 dBTP" although the WAV's true peak is −1.9 | A near-full-scale onset in the first ~25 ms sits in the AAC encoder's priming window; HyperFrames' pad/trim pass re-encodes to AAC, measures +4.7 dBTP there, and lowers the WHOLE track. Make the first ~70 ms of the score soft (×0.45 to 25 ms, back to 1 by 70 ms), then check render.log for "Audio lowered". |
| A "the app saved it" beat shows a word before the tap | Nothing may say saved before the user's tap: a wordless tick appears only after „Zapisz wydatek”, and the truth test checks the cue order. |

## Silent film (from `kto-komu-ile`)

| Symptom | Cause and fix |
|---|---|
| The "hand-tinted" colour pass looked like the original colours, only paler | Desaturating + posterising the chroma keeps every hue the drawing had. Stencil colour is a few DYES: snap each pixel's (soft, low-res, off-register) wash hue to the nearest of ~8 period dyes at 2–3 strengths (`SI.DYES`), keep greys bare, give skin a flesh dye. |
| Off-register colour turned into a garish rainbow halo round every white | A 7 px offset on a 1/8-res wash plus full-strength dyes. Keep the misregistration at 2–4 px, the wash at ~1/6 res, the dye at ≤ 0.85, and a saturation floor (< 0.22 = no dye). |
| Intertitle letters came out with random gaps („Bartek iO la”) | The card drew per character but inherited `textAlign = 'center'` (and letterSpacing) from an earlier draw call. Set `textAlign = 'left'` and `letterSpacing = '0px'` explicitly in every per-character text routine. |
| Sleeve garters rendered as round balls at the elbow | A short tube segment through `tubeFrom` gets round end caps wider than the arm. Draw a band as a quad between the sleeve's two edges. |
| A sitting dog's hind legs stuck out like sticks | Rotating the standing barrel + legs does not make a sit. Author `sit` as its own silhouette: upright torso on a haunch, hind paw tucked forward, front legs straight, short neck. |
| Friends' phones vanished behind the hero's QR phone | Draw order: the figure drawn LAST covers everyone's props. Draw the hero first and the people leaning in after, with their phones on their own side. |
| Bulb glow smeared into a white fog band across the sky | 'lighter' radial glows at 0.55 alpha on bulbs 70 px apart overlap into a solid band, and the sepia LUT lifts it further. Glow alpha ≤ 0.4 with a fast falloff. |
| A python patch silently changed a CRLF file to mixed endings | `open()` in text mode translates CRLF on read; writing with `newline=''` then keeps LF for old lines and CRLF for new. Read/write bytes, or normalise the whole file after patching (`file` to check). |
| The bash heredoc with JS inside failed again | Already in PITFALLS (Windows and files) — it happened again here; write the snippet to a scratch file with the editor tool and insert it with a short script. |
| A film burn left dark smudges on the faces round the hole | Blisters scattered out to 1.6× the burn radius landed on mouths and eyes. Keep blisters in a tight ring at the rim (1.08–1.3 R, small) and the char halo ≤ 1.45 R. |
| A look-test sheet came out showing only one panel | Parallel agents ran the same sheet tool with a panel filter and overwrote the shared `.tmp/<style>-sheet.png`. Read the per-panel PNGs, or write filtered runs to their own sheet name. |
| The render's sync check failed by 165–250 ms on the turn, the colour reel and a screen flip, although the shots looked right in snapshots | The cue drawing carried no visible change: a FROZEN jam frame with a burn at p 0.24, a leader numeral change under a music hit meant for the picture, a quiet hero-label swap. The event the sound marks must be a big change ON its drawing: a one-drawing lamp flare + the burn already at p 0.45, the picture opening on the hit (a real Academy leader beeps on "2" and cuts to picture — no "1"), a shine pulse on the card that flips. |
| A flat colour poster run through the stencil grade came out muddy (dye blotches, lifted blacks, halos round every letter) | The 1/6-res off-register wash is built for drawn scenes, not flat type. Draw the end card in `post`, after the grade, in hand-picked period colours; leave only the raw icon box ungraded, on a mount 6 px larger than the box so the gate weave never pulls background into it. |
| A round lens showed a lighter square box round it | An `unlit` rect stops vignette/flicker at its straight edge. Draw round lenses in `post` after the grade (offset by the weave), or approximate the circle with many thin unlit bands. |
| An empty intertitle plate appeared before its cue; a plate typed to the last drawing never showed complete | `SI.card` draws its black plate even at p 0, and a type-on running to the cut ends on the drawing before it. Gate the call on the cue (`info.on(cue − 0.06)`), and finish typing ≥ 2 drawings before the cut. |
| A patch script turned a 40 KB scene into 4.9 MB | `s.index('})();')` matched an earlier IIFE, the slice was empty, and `str.replace('', new)` inserted the text between every character. Anchor on `rindex`/a unique marker and assert the slice is non-empty before replacing. |
| The EN copy project still rendered Polish in `tools/shot.cjs` sheets | The standalone harness has no HyperFrames runtime, so the `lang` composition variable is never read. Set the default in `strings.js` (`lang: 'en'`) as well as in `index.html`. |
| The app screen in the film painted the owed amount in brand orange; the real app shows it green | The engine author guessed the colour. Read the real component (`GroupBalanceHero.tsx`: owed → `success`, owes → `danger`, settled → only a grey label) before drawing any app state; brand orange only where the app uses it. |

## VHS teleshopping (from `super-okazja`)

| Symptom | Cause and fix |
|---|---|
| The grade cost 300 ms on the rewind, 130–280 ms elsewhere | ~14 full-frame passes (a separate soft-luma pass, two chroma ghosts, an oversized grain fill, scanlines and vignette apart, and, likely, a CPU-backed (willReadFrequently) chroma canvas that made the downscale read the whole GPU frame back). Merge: draw the geometry bands FROM the squeezed soft copy, pre-ghost the tiny chroma canvas on itself, bake scanlines × vignette into one multiply, one dark noise texture `'screen'`ed (lift + grain + chroma noise), bloom only over the red bbox, keep the readback canvas tiny and GPU-side. ~5 passes. |
| Timings jumped 70 → 300 ms between identical runs | Other processes (playwright, dev servers) contending for the GPU/CPU; even the ungraded panel went 3 → 120 ms. Measure with a GPU sync (`V.sync`) and take the MIN of many drawings, not one cached frame. |
| The Host's face blew out to white under the studio lights | Additive light cones at 0.22 over pale anime skin. Cones ≤ 0.1 alpha. |
| The Host's hair read as a loaf / a hat with a yellow band; the mullet read as long hair down the cheeks | A symmetric dome with the frosted tips as one band; a mullet wider than the jaw. Build the quiff from a back volume + an asymmetric front wave with a forelock curl, frost as a ragged band clipped INSIDE each lock; keep the mullet narrower than the jaw (only the nape flip shows). |
| Kasia's open coat showed a bare-skin stripe to the waist | A cream sweater between the coat panels reads as skin. Give the knit a clear colour (dusty blue) and rib lines. |
| Receipt prices overprinted the long product name (`14Rg99`) | 380 px paper for `Kawa ziarnista 1 kg` + `47,99 A` at 26 px Consolas. Widen to 440 (measure the longest line). |
| A phone held out to the side floated with a single dangling finger | The figure's hold puts the wrist at the phone's lower corner (1.04 w below centre); beyond the arm's reach the IK clamps and the hand hides behind the phone, leaving only the thumb. Hold the phone in front of the torso; give hold poses a longer forearm (`L1 300, L2 330`). |
| The payoff lens lines crossed Kasia's face | Corner-to-corner lines from a phone beside the face. Put the panel on the far side of the phone from the face, or join to the near edge (`join: 'near'`). |
| The mic did not reach the mouth in `shout` | The far wrist at local y 400 is chest height; the mic grille sits ~146 units up the fist's axis. Wrist ~[-176, 300], handAng 0.36 puts the grille at the mouth corner. |
| Props in a fist (mic, basket handle) | The figure bakes the hand into its sprite. Recompute the hand from the pose (`CAST.heldProp`), draw the prop, then re-draw the same hand (`CAST.hand` with angle π − a and the mirror toggled for facing −1) over it. |
| The app's scan screen was going to show brand brackets and app strings | The app opens the SYSTEM camera (ImagePicker); the brackets were an earlier film's invention. Draw a generic camera; the app's own UI starts at the processing state. |
| Kasia's elbows "moved in a weird way" (user): flat across the chest at shoulder height while carrying, pointing INTO the torso on a hanging arm, folded over the chest with a remote | The IK bend sign is relative to the shoulder→wrist direction, so a per-pose `bend: 1` puts the elbow below for a wrist out to the side but ABOVE / inside for a wrist across the body. `src/cast.js` `armIK` chooses the elbow side from the BODY by the wrist's direction, changes side only through a ±10° crossover band (continuous), and soft-clamps the reach (tanh past 92 % of L1+L2). Never fix an elbow with a per-pose sign. |
| The sync check failed by 166 ms on the REWIND although the picture tore on the cue drawing | The `flash` sync region measures whole-frame BRIGHTNESS; a rewind tear changes structure, not mean luminance. Give the cue drawing a brightness event too (a one-drawing white head-switch flash, a 0.55). |
| The English version printed „PLN 8.00” | The app's `formatCurrency` formats PLN with pl-PL + „zł” in EVERY UI language. Copy the formatter, not the language: „8,00 zł” in EN too. |
| A hanging „%” sale sign in the aisle next to the app's „costs more than usual” | Reads as „the promotion was not applied”, which the price-check copy rule forbids. No sale signs anywhere near the product the card talks about; the TV shop's shouting is the fictional channel's, never the shelf's. |
| An English caption ran edge to edge (outside x 60–1020) | Teletext Consolas is wide; a 30-character line overflows. Count characters per line for the EN table too, and re-snap the EN copy before rendering. |
| The counter jumped at a cut | One tape = one counter: write the formula once in the brief (forward from START, backwards at 40× during REW, forward again from where REW stopped) and have every scene compute it, not copy a value. |
| An old snapshot looked like an unfixed drawing | `t1.167.png` from an earlier grid survived next to the new `t1.166.png`. Delete `.snaps/NN-*` before re-snapping a fix. |

## Felt (from `prognoza`)

| Symptom | Cause and fix |
|---|---|
| A key change (a sign flips, a chip appears) showed one drawing BEFORE its sound | Scenes wrote `on(cue - 0.06)` to "land early". `info.on(g)` is already `T >= snap(g) - 1/24`, so the cue drawing is the first one that is on; subtracting more moves the change to the previous drawing (83 ms early on twos). A DISCRETE switch uses `on(cue)` exactly; only a continuous ramp (`prog`, the pencil rule above) starts ~0.08 s before. Write it in the scene brief before the agents start: two of nine got it wrong. |
| Polish words in the caption plates came out in a fallback face with wrong widths | Cooper Black (`F.FONT.cut`) has no ąćęłńśźż. `F.plText` sets the BASE letter in Cooper Black and adds the mark: the acute and the dot clipped from Cooper's own é/É and i, the ogonek and the ł bar drawn; `F.measure` measures the base letters. Every text path (`F.text` stroke and fill, `o.stroke`, both `F.embroider` fills) must go through it. Snap one word with each mark (ś ł Ę ą ż) before rendering. Check any display font for the Polish set before choosing it. |
| A caption wider than the safe zone (x 60–1020) | `Uwaga! Nadciąga front rachunków.` in two 70 px lines. Re-split by meaning and measure both tables, PL and EN. |
| The poster's pill sync failed by 167 ms although the pill appeared on the cue | The `flash` region measures the first brightness change in a window BEFORE the cue; the board was still dropping into the region two drawings earlier. Nothing may move inside an event region during the two drawings before its cue: settle the board at 26.75 for a 27.0 pill. |
| Shot 05 started from a different board than shot 04 ended on | The flip agent drew its own start state. The director forwards the exact end-state calls (board, flip point, cast poses) from the finished shot to the next agent, and the next shot interpolates from them (`F.MAP` → `F.BOARD` during the flip). |
| The fronts on the map suggested a per-day forecast ("Friday 40 zł") | Safe-to-Spend is ONE number for TODAY. The fronts are the app's already-subtracted breakdown rows (subscriptions, recurring, goals); the flipped board shows the real rows (2 400 − 210 − 840 − 342 = 1 008, / 12 = 84). No amounts on future days anywhere in the film. |
| The EN copy project's `node_modules` became a 1 GB copy | Git Bash `ln -s` copies on Windows. Make a junction from PowerShell: `New-Item -ItemType Junction -Path node_modules -Target D:\Work\tools\films\paragon-anime\node_modules`; before removing a wrong one, check `(Get-Item node_modules).LinkType` so you never `rmdir` the real tree. |
| The EN copy carried `.snaps`, `exports`, `.tmp` from the PL project | The exclusion list matched `ls` output with type suffixes (`exports/`). Copy with explicit excludes (`robocopy … /XD .snaps exports .tmp node_modules`) and check the copy's size. |
| A 35 MB social cut could not be sent for review | The chat upload limit is 30 MB. Send the 720p phone cut for review; the social cut is only for publishing. |

## 1950s home of tomorrow (from `dom-przyszlosci`)

| Symptom | Cause and fix |
|---|---|
| The cover (frame 0) rendered its title in a fallback serif in the runtime, correct on every later frame | `FILM.mount` rendered t=0 before the bundled faces loaded and the per-drawing memo kept that frame. `film.js` now `document.fonts.load()`s every face with the Polish set at mount (so `fonts.ready` waits) and clears the memo when they arrive. Check frame 0 through `npx hyperframes snapshot --at 0`, not only `shot.cjs`. |
| Headless Chrome drew a Windows display face (Gill Sans Ultra Bold) as a fallback | It does not resolve installed Monotype faces by family name. Bundle the TTF (fsType 8 = editable embedding is allowed) with `@font-face`; one file needed its cmap language ids rewritten with fontTools before Chrome's OTS accepted it. Prove the Polish set: the same letters measured in "face, serif" and "face, monospace" must be equal. |
| The turn's fade 1 → 0 hardly read | The first "aged print" was a gentle tint. Make the before-state clearly aged (cyan fade + warm/magenta cast, lower saturation and contrast, grain, dust, a scratch, a dark gate border) — the turn is the difference. Gate weave folded into the camera matrix as whole pixels (a copy-based weave cost ~70 ms). |
| The storyboard's push text produced NO merchant in the app | „Płatność kartą 47,99 PLN · SKLEP OSIEDLOWY” — the parser needs a connector („w”, „at”). Bundle the app's real parser (esbuild) and run the film's push text through it; the app also writes the description as `${merchant} (auto-captured)` in English in every language, so the row truncates to „Sklep Osiedlowy (aut…” — show it as the app does. |
| The app was going to show a "saved" toast after capture | The toast handler in `captureService.ts` is never registered. Read the UI path before drawing feedback: the row simply appears in the list. |
| A dimming cue ("lights out") failed sync by 83 ms | `cues_check.py` measured only brightness INCREASES for `flash` cues and found the recovery. It now takes `abs(diff)`. |
| The poster pill failed sync by 209 ms although nothing moved before 27.0 | The baseline subtraction took the hard cut at 26.5 (one value) as the boil baseline and made the whole window negative, so `argmax` returned the window's first frame. A baseline now needs ≥ 3 changed drawings. When a check disagrees with the frames, probe the region frame by frame before moving the animation. |
| A robot with `facing: -1` showed its nameplate mirrored | The flip mirrors the baked sprite including its text. Keep text-bearing characters at facing +1 (or bake text unflipped). |
| `R.rowLens` cut off the amount line | Below r ≈ 340 the last line leaves the glass. Budget the lens and the plate under/over it together before placing either. |

## Real 3D / Three.js (from `gdansk-w-kuli`)

| Symptom | Cause and fix |
|---|---|
| A brass/wood "material" look drawn in 2D canvas (baked volume sprites) was rejected as cheap and the idea as boring | Fake material in flat canvas reads as clip-art next to real 3D. For a material look use Three.js (`D:\Work\tools\films\gdansk-w-kuli\` is the reference: `src/world.js` scene, `src/film.js` compositor, `src/overlay.js` 2D layer). Check the mechanic against past films first: balls-into-bowls had already been the clay film. |
| Whole frames went black at a few exact camera angles, reproducibly, and only with bloom on | A grazing GGX highlight on the glass produced a NaN pixel; `UnrealBloomPass` blurs it over the whole frame. A `ShaderPass` right after `RenderPass` replaces NaN/Inf with black and clamps to 64. After render, scan the master: `signalstats` YAVG over all frames, none dark. |
| `node tools/snap.cjs` timed out waiting for the film while a plain 8 s sleep found it loaded | `page.waitForFunction` returning a GSAP timeline object (not a boolean) never resolved in puppeteer-core 25. Poll `page.evaluate(() => !!window.FILM_READY)` instead. |
| The first snapped frame showed the cover instead of the requested time | The page's own initial `render(0)` ran after an `await img.decode()` and overwrote the snap. Set `FILM_READY` only after that first render and wait for it. |
| WebGL in headless Chrome | Works with real GPU (ANGLE D3D11, Iris Xe), ~10–15 ms/frame at 1080×1920; HyperFrames render 30 s in ~3.5 min. `preserveDrawingBuffer: true` so the GL canvas can be `drawImage`d into the 2D compositor canvas. Module scripts + an importmap to `./node_modules/three/...` load under file:// with `--allow-file-access-from-files`. |
| A popup "pop" failed sync by 40 ms | It scaled from 0 at the cue, so the first visible change was a frame late and too small for a full-frame region. Make it visible on the cue frame (start the ramp one frame early) and give the sync region the popup's own box. |
