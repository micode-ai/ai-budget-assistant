---
agent: aba-mobile-engineer
title: 'Add finish-aba-task skill invocation to workflow closure'
status: proposed
conflict: false
created_at: 2026-05-11
---

## What's wrong

The agent's "Workflow" section ends at step 5 (verify i18n completeness). It has no instruction to invoke the `finish-aba-task` skill, which is a mandatory project-wide closure step (CLAUDE.md: "finish any task by creating ABA-{N} GitHub issue and updating CLAUDE.md + user_docs/"). Without this guard-rail in the agent file, the mobile engineer agent will consistently skip issue creation and doc updates.

## Proposed change

- Add a step 6 to the "Workflow" section:
  ```
  6. Run the `finish-aba-task` skill to create the ABA-{N} GitHub issue and
     update CLAUDE.md + user_docs/ before stopping or committing a PR.
  ```
- Add `finish-aba-task` to the "What you DO NOT do" section as a negative: "Skip the finish-aba-task skill — it is mandatory for every completed task."
- Optionally cross-reference that the skill handles English-only artifacts (GitHub issues/PRs must be in English per project convention).

## Rationale

The `finish-aba-task` skill was introduced as a required step for all ABA agents. The mobile engineer agent file predates or missed this addition. Every task completed via this agent currently leaves no GitHub issue and no docs update, making the project history incomplete.
