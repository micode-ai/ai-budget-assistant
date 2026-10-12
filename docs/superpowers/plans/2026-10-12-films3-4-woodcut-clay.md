# Films 3–4 "Kronika daniny" (woodcut) and "Ulepione z paragonu" (clay) Implementation Plan

> **For agentic workers:** one agent per film, working inline (superpowers:executing-plans); each owns only its own
> film project. Steps use checkbox (`- [ ]`) syntax.

**Goal:** two 30 s, 9:16 craft-style ad films, PL + EN — woodcut about the subscription manager, clay about receipt
category auto-split — plus the reusable `woodcut` and `clay` house styles for the `ad-film` skill.

**Architecture:** each film is a copy of `D:\Work\tools\films\tarcza-papier\` (film 2: harness, tests, polygon cast with
the reading/stool poses, `geometry.js` + geometry dry-run, `feed-check`, `cut-check`). The look is a new engine replacing
`src/engine/paper.js`, grown from the approved look test `D:\Work\tools\films\craft-sheet\styles.js` (`woodcut` /
`clay`). Scenes call engine, cast, props, sets, geometry; they never copy them.

**Tech stack:** Canvas 2D in headless Chrome (puppeteer-core), HyperFrames 0.8.111, GSAP proxy timeline, Python 3 +
numpy/scipy, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-11-craft-films-series-design.md`, sections "Film 3" and "Film 4" (binding:
truth, beats, Yoka). Also binding: `.claude/skills/ad-film/SKILL.md`, `.claude/skills/ad-film/PITFALLS.md` (read in full;
the Shadow puppets and Cut paper sections apply to any craft style).

## Global constraints (both films)

- Projects outside the repo, own git, `core.autocrlf=false`, LF endings:
  film 3 `D:\Work\tools\films\kronika-daniny\` (+ `kronika-daniny-en`), film 4 `D:\Work\tools\films\ulepione-z-paragonu\`
  (+ `ulepione-z-paragonu-en`). The `-en` copy differs only in the default language (`lang: 'en'` in index.html AND the
  `STR` default).
- 1080×1920, 30 s, 24 fps on twos, 120 bpm; shot boundaries on whole beats; turn at 12.0 s; poster from 27.0 s, CTA
  complete by 27.0 + 0.7 s; frame 0 is a complete cover.
- Determinism: no `Math.random` / `Date`; every random draw seeded; FIXED seed per figure/piece (a changing seed boils).
- Every visible string through `src/strings.js` (PL + EN, same keys). App strings VERBATIM, read from the app's source by
  `tools/truth-test.cjs` (APP root `D:/Work/micode/ai-budget-assistant`).
- Cast: Michał, Kasia, the son, Yoka — every one where the beats say. Yoka background only: one reaction per beat, head
  top below Michał's knee, never over the phone, a lens or a caption. An implied action needs a pose AND the prop in the
  hands (PITFALLS: Cut paper rows).
- Captions ≥ 66 px font inside x 60–1020 / y 220–1540, typed on within 0.7 s, held to the cut; payoff UI text only in a
  lens (≥ 44 px, fully inside the circle) or a big page (feed-check).
- Platforms: Android/Google Play + browser; never iOS/App Store. Name `AI Budżet`. Amounts `43,00 zł` (NBSP before zł).
- Delivery: `node tools/deliver.cjs` exit 0 (phone −14 ±1 LUFS, TP ≤ −1 dBFS, sync ≤ 40 ms); social cut = master video +
  phone audio (`ffmpeg -i master -i phone -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -movflags +faststart`).
- Never `git add` anything under the monorepo's `docs/marketing/` (gitignored); never commit in the monorepo, never push.

## Film 3 specifics — kronika-daniny (woodcut, subscription manager)

- Engine `src/engine/woodcut.js` (`WC`): ivory paper + grain, chronicle border (`WC.frame`, ignores the camera), carved
  ground strokes, `WC.figure` (black masses with white gouges, hatched light parts, thick outline; red only for parts
  flagged red: Kasia's hair, Yoka's collar, money, the phone), `WC.cartouche` (a caption in a carved banner, Times/Georgia
  serif, typed on), `WC.coin`, `WC.phone/push/screen` (the app as it looks, but printed: ivory card, black text, the
  brand accent rendered as the print red `#B8322A`-ish — keep text black on ivory for legibility), `WC.magnifier` +
  `WC.lensPush` + `WC.lensScreen` (port from paper.js), per static layer an offscreen cache.
- Strings (PL): cover „Kronika rodu. Rok 2026.”; plaques Kino+, Muzyka, Siłownia, Chmura; „Spisz ich raz.”; push title
  „Kino+ odnawia się za 3 dni”, body „43,00 PLN zostanie pobrane za Kino+” (server template filled: amount `43,00`,
  currencyCode `PLN`); speech „Kino+? Nikt tego nie ogląda.”; screen: „Subskrypcje”, „Miesięczny koszt” `205,98 zł` →
  `162,98 zł`, rows „Kino+ · 43,00 zł · Miesięcznie” with „Odnawia się za 3 dni” then „Nieaktywna”; „Wiesz, kto i kiedy
  przyjdzie.”; CTA „AI Budżet”, „Menedżer subskrypcji”, „Pobierz za darmo”, ai-budget.pl, „Android · przeglądarka”.
  EN: names Kino+, Music, Gym, Cloud; €9.99 + €5.49 + €29.00 + €2.99 = €47.47 → €37.48; push "Kino+ renews in 3 days" /
  "9.99 EUR will be charged for Kino+"; screen strings from mobile `en.ts` `subscriptionManager.*`.
- truth-test: push = server `subscriptionReminderTitle/Body` (pl and en blocks) filled; screen strings =
  mobile `subscriptionManager.{title,monthlyTotal,renewalInDays(count 3),inactive,cycle.monthly}`; the totals equal the
  sum of the four amounts (and minus Kino+); no string says the app cancels/blocks/stops anything (scan for
  „anuluj/zablokuj/cancel/block” in app-attributed strings); PL/EN key parity; platforms name Android/Google Play.
- Story beat that must read: the app only REMINDS; Michał himself closes the gate (pose + hand on the gate), then the
  row turns „Nieaktywna” and the total drops.
- Score: medieval chronicle (recorder/shawm, lute, frame drum, a bell at the turn), from `tarcza-papier/audio/synth.py`.
- Deliverables `docs/marketing/creatives/subscription-tracker/renders/{pl,en}/kronika-daniny[-en]{.mp4,-phone.mp4,-social.mp4,-shots.md}`.

## Film 4 specifics — ulepione-z-paragonu (clay, receipt category split)

- Engine `src/engine/clay.js` (`CL`): pastel set, `CL.blob` (volume: core shadow, key light, specular, thumbprints,
  contact shadow — blur filters are EXPENSIVE: render each static piece/figure once to an offscreen cache keyed by
  seed+pose and blit; a frame ≤ 80 ms), `CL.figure`, `CL.label` (caption on a clay plaque), `CL.roll` (a clay roll /
  ball), `CL.bowl(label)`, `CL.phone/screen` (the app as it looks: white cards, brand orange `#E37F2B`, real text),
  `CL.magnifier` + lens helpers (port from paper.js), `CL.receipt(lines, p)` (a long paper receipt, clay-world but
  readable).
- Strings (PL): receipt `PARAGON FISKALNY`, lines summing to `SUMA PLN 240,00` (groceries 180,00, household 35,00,
  health 25,00 — real-looking generic product names, no brands, no alcohol); speech „Jedzenie, chemia, apteka…
  wszystko w jednym?”; bowls „Spożywcze”, „Chemia domowa”, „Zdrowie”; screen „Paragon zeskanowany”, „Łączna kwota”
  `240 zł`, „Podział na kategorie”, chips „Spożywcze 180 zł · Chemia domowa 35 zł · Zdrowie 25 zł”, „Zmień kategorie”,
  „Zapisz wydatek”; „Zapamięta na następny raz.”; CTA „AI Budżet”, „Podział paragonu na kategorie”, pill „Zeskanuj
  pierwszy paragon”, ai-budget.pl, „Android · przeglądarka”. EN: €56.00 = Groceries 42 · Household 8 · Health 6; app
  strings from mobile `en.ts`.
- truth-test: screen strings = mobile `receipt.{scannedTitle,totalAmount,saveExpense}` and
  `receiptCategorySplit.{title,edit}` (pl, en); receipt lines sum to the total and each category's lines sum to its chip;
  chips sum to the total; nothing says "saved"/„zapisano” before the save tap (cue order check); no alcohol words; key
  parity; platforms.
- Story beats that must read: the split happens after the photo (the phone in Kasia's hands, the receipt in front of
  it); Kasia's finger taps „Zapisz wydatek” and only then a small confirmation tick appears. Shot 06 (after the
  save): the son picks one clay ball out of a bowl and drops it into another — the „Zmień kategorie” idea, remembered
  next time — with the cartouche „Zapamięta na następny raz.” and NO amounts or chips on screen in that shot (so no total
  can contradict the saved split).
- Yoka: shop — pulls the leash (leash in Kasia's or the son's hand); home — asleep on the rug; one eye opens at 12.0.
- Score: bouncy stop-motion (marimba, tuba, kazoo, squelches, a pop per rolled ball).
- Deliverables `docs/marketing/creatives/receipt-auto-split-categories/renders/{pl,en}/ulepione-z-paragonu[-en]{.mp4,-phone.mp4,-social.mp4,-shots.md}`.

## Tasks (per film, in order)

1. **Scaffold** — robocopy `tarcza-papier` → new slug (exclude node_modules exports .snaps .tmp .git .frames), npm
   install, git init + autocrlf false; delete paper scenes/sets/props-specific content; rename package; stub 8 scenes;
   HANDOFF.md (state list, kept current after every task).
2. **Strings + truth test (RED → GREEN)** + `tools/gen-cues.py` shot table and events (sync regions isolate the event).
3. **Engine** with `tools/engine-test.cjs` (RED first): API exists, deterministic, frame ignores camera, lens text inside
   circle, cost budget. Look frame `.tmp/engine-look.png` — LOOK at it.
4. **Cast + props** on the new engine; `tools/cast-sheet.cjs` writes `.tmp/cast-sheet.png` and a 0.25 version — LOOK:
   every person reads at feed size (faces, Michał's beard+glasses, Kasia's red curls, the son, Yoka as a schnauzer).
5. **Sets + geometry dry-run** (`src/geometry.js`, `tools/geometry.cjs` → `.tmp/geometry-NN.png`, LOOK), storyboard.md,
   docs/SCENE-BRIEF.md (paste the PITFALLS rows that apply).
6. **Scenes 01–08**, snapping every 0.25 s and LOOKING; tests green; lint 0.
7. **Score** (`audio/synth.py`, every cue voiced, onsets ≤ 10 ms, −16 LUFS / TP ≤ −1.5, 30.000 s).
8. **Self-critique pass**: whole-film sheet at 0.25 (`.tmp/film-sheet.png`), seek-check, cut-check, feed-check, truth;
   fix every P1/P2 (story reads without sound; truth; readability; continuity across cuts; Yoka background).
9. **Deliver PL**, make the `-en` copy, **deliver EN**, social cuts, shots.md, copy renders to the campaign folders.
10. Report: paths, test outputs, render stats, the frames to look at, every ruling made and every known minor.
