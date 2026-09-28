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
