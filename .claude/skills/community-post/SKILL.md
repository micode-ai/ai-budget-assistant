---
name: community-post
description: Use when the user wants to post, launch, share or promote AI Budżet in one specific community — a subreddit (r/PolskaFinanse, r/budgeting…), Wykop, a Facebook group, a Telegram channel or group, Discord, Product Hunt, Show HN, Indie Hackers, dev.to — or asks "можно ли там запостить", "napisz post na…", "напиши пост в r/…". Checks that community's rules live, gives a Go/No-Go first, and drafts only if the post is welcome. NOT for our own Instagram/TikTok/LinkedIn feed posts (no per-community rules to check) and NOT for blog articles (blog-writer).
---

# Community post (AI Budżet × community-post-generator)

A thin wrapper. The **method** is the vendored upstream skill in `upstream/METHOD.md`
(marcosmodly/marketing-skill, MIT) — read it in full and follow its six steps and its
required output structure exactly. This file supplies only what it cannot know: our product,
our voice, where our past posts and targets are recorded, and what we changed.

## 1. Path mapping — read before following METHOD.md

METHOD.md is written for a plugin and refers to `${CLAUDE_PLUGIN_ROOT}`. Here:

| METHOD.md says | Use instead |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}/references/brand-voice.md` | `brand-voice.md` next to this file. It is configured; skip the onboarding questions in step 1. |
| `${CLAUDE_PLUGIN_ROOT}/references/community-research.md` | `upstream/references/community-research.md` |
| `${CLAUDE_PLUGIN_ROOT}/references/community-post-examples.md` | `upstream/references/community-post-examples.md` (read before the first draft in a session) |
| `${CLAUDE_PLUGIN_ROOT}/state/post-log.md` | `docs/marketing/community/post-log.md` |
| `publish-pipeline`, `publish_direct.py`, `content-repurposer`, `ad-copy-generator`, `docs/publishing.md` | **Not installed.** See section 4. |

## 2. Before step 3 (research): what we already know

1. **Our own record.** Read `docs/marketing/community/post-log.md` (outcomes of posts that went
   out) AND `docs/marketing/backlinks-tracker.csv` (the target list with a `Status` per
   community; its `Notes` often say "rules unverified" — that is exactly what step 3 must now
   verify, never carry forward as a fact).
2. **Existing drafts.** `docs/marketing/backlinks-outreach.md` (Reddit, Quora, press),
   `docs/marketing/copy/launch-posts.md` (Product Hunt + Reddit, English),
   `docs/marketing/product-hunt-launch.md`, `docs/marketing/reposts/` (dev.to/Medium canonical
   reposts). Reuse an angle only if it fits the rules researched this run; never post the same
   text in two communities (METHOD.md's batch rule).
3. **Product Hunt is spent.** The tracker says the PH page is live and the launch is used up —
   only a Discussions post, or a relaunch for a major release, and say so in step 2.
4. **Facts come from the wiki.** Every claim about a feature comes from its page in
   `docs/wiki/features/` (and `user_docs/pl/` for the app's own Polish wording). Prices come
   from `docs/wiki/features/subscription-pricing.md`, never from memory.

## 3. Our additions to the method

**Language.** Draft in the **community's own language** — Polish for Polish communities
(r/PolskaFinanse, r/Polska, Wykop, Polish Facebook groups), English for r/budgeting,
Show HN, Indie Hackers, dev.to. Polish copy must have correct diacritics (`Budżet`, `złoty`,
`dziś`). Talk to the user in the language they wrote in.

**Platforms METHOD.md does not cover** — treat them with its closest analogue, and say which:

- **Facebook groups** (the main place Polish personal-finance talk happens). Upstream calls
  Facebook a broadcast platform; a *group* is not — admins set per-group rules. Treat a group
  like a **private Telegram group**: Source Confidence `User-Supplied` unless the group is
  public and its rules are visible in its "About" section, which the user must paste (Facebook
  is not fetchable). Ask whether the user is a member and whether the group has a weekly
  promo thread or bans links in posts (common: link only in the first comment, or not at all).
- **Wykop** — publicly researchable, treat like Reddit: fetch `wykop.pl` regulamin and the
  tag/mikroblog norms, note that self-promotion is policed by the community (minusy, zakopanie)
  as much as by moderators. Disclosure as the maker is mandatory in our drafts.

**Disclosure is mandatory everywhere**, regardless of whether the community requires it: the
author is the maker of AI Budżet ("robię tę aplikację", "I'm the solo maker"). Never write as a
neutral user recommending an app, never draft a "which app do you use?" post meant to be
answered by us from a second account, never suggest sock-puppet votes or comments.

**Truth rules** (same as `.claude/skills/ad-film/SKILL.md` §3, applied to text):
- Only what the app actually does, per the wiki. No invented user counts, ratings, reviews,
  awards or "saves you X zł".
- Platforms: **Android (Google Play) and the browser (`app.ai-budget.pl`)**. There is **no iOS
  app** — never say iPhone/App Store; an iPhone user can only use the web app.
- Respect feature pages' copy constraints (receipt price check never says "overcharged";
  deposits are "already paid", never refundable).
- Amounts in Polish copy as `77 zł`.

## 4. What we removed: no sending from here

METHOD.md's step 5 "Next Step" offers programmatic sending (`publish-pipeline`,
`publish_direct.py`). **Not installed and not wanted** — the user always posts by hand. In
"Next Step" say only: paste it manually from the right account, then tell me when it is live.

When the user says a post is live:
1. Add a row to `docs/marketing/community/post-log.md` (format in its header).
2. If the community is in `docs/marketing/backlinks-tracker.csv`, set its `Status` to `live`,
   `Date submitted` and `Live URL`.
3. A day or two later, offer to fill in Score/Comments/Removed from what the user pastes.
   Never guess a number.

## 5. Where things live

| What | Where | Git |
|---|---|---|
| The method (do not edit) | `.claude/skills/community-post/upstream/` | tracked |
| Our voice, banned words | `.claude/skills/community-post/brand-voice.md` | tracked |
| Post outcomes | `docs/marketing/community/post-log.md` | tracked (`git add -f` — `docs/marketing/` is gitignored) |
| Target list | `docs/marketing/backlinks-tracker.csv` | tracked |
| Finished drafts | `docs/marketing/community/drafts/<YYYY-MM-DD>-<community>.md` | local only, do not add |

**Updating the method:** re-fetch `skills/community-post-generator/SKILL.md` and its two
references from the upstream repo, replace the files in `upstream/` (keep the provenance
comment, bump the commit), and re-check section 1's mapping against any new paths it names.
