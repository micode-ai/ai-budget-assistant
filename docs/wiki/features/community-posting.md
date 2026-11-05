# Community posting

## What this is
How we write promotional posts for communities with their own rules (subreddits, Wykop,
Facebook groups, Telegram, Discord, Product Hunt, Show HN, Indie Hackers, dev.to): research the
community's current rules first, decide Go/No-Go, and only then draft. A post that breaks a
community's rules is removed no matter how good it is, and repeated attempts get the account
banned.

## Entry points
- `.claude/skills/community-post/SKILL.md` — the project wrapper: path mapping, our additions,
  what was removed.
- `.claude/skills/community-post/upstream/METHOD.md` — the method, vendored verbatim from
  marcosmodly/marketing-skill (`community-post-generator`, MIT), with its two references.
- `.claude/skills/community-post/brand-voice.md` — voice and banned phrases (PL + EN).
- `docs/marketing/backlinks-tracker.csv` — the list of target communities with a status each.
- `docs/marketing/community/post-log.md` — outcomes of posts that went out.
- Earlier drafts: `docs/marketing/backlinks-outreach.md`, `docs/marketing/copy/launch-posts.md`,
  `docs/marketing/product-hunt-launch.md`, `docs/marketing/reposts/`.

## Key concepts
- **Source Confidence** labels every rules claim: `Primary` (the community's own page, fetched
  this run), `Secondary (official)`, `Secondary (third-party)`, `Mixed`, or `User-Supplied`
  (Discord, Slack, private Telegram, and Facebook groups — rules the user pasted, never
  independently verified). A non-`Primary` Go carries its tier into the verdict line.
- **Facebook groups and Wykop** are our additions; the upstream method treats Facebook as a
  broadcast platform. A group is mapped onto the private-Telegram path, Wykop onto the Reddit path.
- The tracker is the plan, the post log is the outcome; the skill updates both when a post goes live.

## Invariants
- No draft before a live rules check in the same run, and none for a No-Go — a removed post costs
  more than an unwritten one.
- The author always discloses being the maker. No posts written as a neutral user, no second
  accounts, no vote requests (Hacker News bans for it).
- Facts come from `docs/wiki/features/`; no invented figures, and no iOS — the app is Android and
  the web only.
- Posting is manual. Upstream's programmatic sending (`publish_direct.py`, `publish-pipeline`) is
  deliberately not vendored.
- `upstream/` is not edited; project rules go in the wrapper, so the method can be re-vendored
  from a newer upstream commit by replacing files.

## Known gaps
- Only `community-post-generator` was adopted from the plugin. `ad-copy-generator`,
  `competitor-research` and `email-sequence` were judged useful but not adapted yet; the rest of
  the plugin overlaps with `blog-writer`, `seo-specialist`, `ad-film` and the reel pipeline.
- `.claude/` and `docs/marketing/` are gitignored; the skill and the post log are force-added.

## History
- [ABA-715](https://github.com/micode-ai/ai-budget-assistant/issues/752) — skill added, upstream
  pinned to commit 28456ea (2026-10-31).
