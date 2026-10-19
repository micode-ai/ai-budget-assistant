# Claude Code mods

*Hub: [index](../index.md) — working on the repo, not a product feature*

## What this is
Four Claude Code mods (function hooks, early-access API) that enforce, in code, rules this repo and
the other MiCode projects used to keep only in prose: production health in view while working,
no destructive commands on the shared VPS, read-only production SQL with a person's consent, and the
wiki ritual at commit time. They are shared by every project, so they live outside this repo.

## Entry points
- Repository: `micode-ai/claude-mods` (private), checked out at `D:\Work\micode\claude-mods`
- Loaded in every session by `CLAUDE_CODE_PLUGIN_DIRS` in the user's `~/.claude/settings.json`
- Per mod: `<mod>/hooks/register.ts(x)` (the hooks), a pure-logic file beside it, `<mod>/tests/`
- What to watch or query: `prod-radar/hooks/config.ts`, `prod-query/hooks/config.ts`

## Key concepts
**prod-radar** polls each health endpoint every 90 s into the status line and shows a band and a
notification on a state change; reads VPS disk with `df` over SSH every 15 min; after a `git push`
that pushed something it follows that branch's GitHub Actions runs and reports each result.

**vps-guard** refuses, with a reason that says what to do instead: volume prune/rm, image prune -a,
system prune -a/--volumes, compose down -v; a force push to a protected branch or with no explicit
branch; a push while the upstream is ahead; a commit or `gh issue/pr` text that is not English, has
a colon after the issue key, or carries an attribution line.

**prod-query** registers `prod_query(database, sql, purpose)` for the model. One statement inside
`BEGIN TRANSACTION READ ONLY`, always rolled back, with statement and lock timeouts and a LIMIT the
database enforces; the person approves every call; e-mails and `+` phone numbers are masked.

**finish-task** inspects each successful commit: code changed but no wiki page, no `log.md` line,
or no issue key (where the repo uses keys) → a band for the person and context for the model.

## Invariants
**prod-query keeps a person in every call.** No "always allow", and the deny-list stays: the
container role is a superuser, so `READ ONLY` alone does not stop psql's `\!`, `COPY ... PROGRAM` or
`pg_read_file`. The auto-mode classifier refused to let the agent write this tool until the person
approved it explicitly — that decision is the person's, by design.

**vps-guard is a seatbelt, not a security boundary.** It matches command text, so it has false
positives: a script that only quotes a forbidden Docker command as data is refused (it happened
while writing the article). Put such a script in a file rather than weakening a rule.

**Observers never block.** prod-radar's and finish-task's `tool.call` hooks end in
`.catch(next)`; only vps-guard's `.catch` refuses, because a guard that crashed must not pass what
it was meant to check.

**The radar watches health endpoints, not home pages** — a CDN or static nginx page stays green
while the API behind it is down.

## Known gaps
- The radar runs only while a session is open; it does not replace `uptime-check.yml`.
- Settings changes and secret scans are gated: the agent could not edit `~/.claude/settings.json`
  until asked directly, and the plugin secret scan could not run under the organization's checks,
  so the first push to the repo was made by the person.
- Nothing measures the mods yet; the article promises numbers after a month.

## History
[ABA-684](https://github.com/micode-ai/ai-budget-assistant/issues/714) · write-up MI-104,
https://mi-code.pl/blog/claude-code-mods-for-every-project/
