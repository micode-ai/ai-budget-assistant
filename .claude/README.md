# Claude Code Configuration

Project-scoped agents and skills for the AI Budget Assistant. Everything in this directory is committed to git so the team shares the same automation.

## Skills

Workflows for routine multi-step tasks. Invoke with `/<skill-name>` or rely on auto-trigger via the description field.

| Skill | When to use |
|---|---|
| [`finish-aba-task`](skills/finish-aba-task/SKILL.md) | **Required final step of every coding task.** Creates `ABA-{N}` GitHub issue and updates CLAUDE.md + user_docs. |
| [`i18n-add-strings`](skills/i18n-add-strings/SKILL.md) | Adding, renaming, or removing i18n keys across all 8 locale files. |
| [`add-help-section`](skills/add-help-section/SKILL.md) | Adding or editing a section in the in-app help system (3 places + regenerate). |
| [`bootstrap-api-module`](skills/bootstrap-api-module/SKILL.md) | Creating a new NestJS module with the project's canonical structure. |

## Agents

Subagents for delegated work via the `Agent` tool. Two flavors:

### Role agents (implementers — own a specific area)

| Agent | Owns | Model |
|---|---|---|
| [`aba-db-engineer`](agents/aba-db-engineer.md) | `apps/api/prisma/`, `apps/mobile/src/db/schema/`, entities in `packages/shared-types` | sonnet |
| [`aba-backend-engineer`](agents/aba-backend-engineer.md) | `apps/api/src/` (NestJS modules, services, controllers) | sonnet |
| [`aba-mobile-engineer`](agents/aba-mobile-engineer.md) | `apps/mobile/` (screens, stores, repositories, i18n) | sonnet |

### Design agents (planners — read-only / docs-only)

| Agent | Output | Model |
|---|---|---|
| [`aba-architect`](agents/aba-architect.md) | Cross-cutting design docs in `docs/superpowers/specs/` — data model, API surface, mobile flow, dependency order, risks | opus |
| [`aba-designer`](agents/aba-designer.md) | UI/UX specs in `docs/design/` — wireframes, screen flows, component breakdowns, accessibility | sonnet |

### Utility agents

| Agent | When to use |
|---|---|
| [`aba-code-reviewer`](agents/aba-code-reviewer.md) | Review a branch or PR against project-specific patterns. Outputs a structured report. |
| [`aba-pattern-finder`](agents/aba-pattern-finder.md) | Locate canonical examples of a pattern in the repo. Returns file:line citations. |

### Typical workflow for a cross-cutting feature

1. `aba-architect` writes a design doc (data model, API surface, mobile flow, build order).
2. `aba-designer` writes a UI spec for the affected screens (if user-facing).
3. `aba-db-engineer` lands schema changes (shared-types entities → Prisma migration → SQLite schema).
4. `aba-backend-engineer` implements the API (in parallel with mobile SQLite work).
5. `aba-mobile-engineer` implements the mobile side (stores, screens, i18n×8).
6. `aba-code-reviewer` reviews the resulting branch.
7. The lead invokes the `finish-aba-task` skill to create the `ABA-{N}` issue and update CLAUDE.md / user_docs.

## Other files in this directory

- `teams.md` — pre-written prompts for spinning up multi-agent teams (older multi-agent workflow; the skills above replace most of its day-to-day uses).
- `settings.json` / `settings.local.json` — Claude Code settings.

## Adding new skills/agents

- **Skills** live at `.claude/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`).
- **Agents** live at `.claude/agents/<name>.md` with YAML frontmatter (`name`, `description`, `tools`, `model`).
- Add a row to the appropriate table above.
- The `description` field is what Claude reads to decide when to auto-invoke — be specific about triggers.
