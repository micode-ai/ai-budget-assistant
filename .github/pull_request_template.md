<!--
Subject line and issue: ABA-<N> <summary>, no colon after the number, in English.
See CONTRIBUTING.md.
-->

Closes ABA-

## What and why

<!-- What changes, and what problem it solves. If it is a fix, name the failure mode:
what went wrong, for whom, and how it went unnoticed. -->

## How it was verified

<!-- The commands you actually ran and what they printed. "Should work" is not
verification. -->

```
```

## Checklist

- [ ] `npx tsc --noEmit` passes in every app I touched
- [ ] `npx jest` passes; new behaviour has a test that failed before the fix
- [ ] `npm run lint` introduces no new errors
- [ ] `CLAUDE.md` updated, and `user_docs/` too if user-visible behaviour changed
- [ ] No debug leftovers (`console.log`, commented-out code, a skipped test)

Delete any line below that does not apply.

- [ ] **Account scoping** — every new query filters by `accountId`
- [ ] **Guards** — new write endpoints carry `ViewerBlockGuard`; new routes declare static paths before `:id`
- [ ] **Client ids** — a resolved server primary key is used in the following `where`, not the raw route param
- [ ] **Idempotent create** — unique key pre-checked, `P2002` caught outside any `$transaction`
- [ ] **i18n** — new keys exist in all 9 locale files, in each language's real orthography
- [ ] **Help** — `user_docs/` in 9 languages, section registered in all three places, `npm run generate:help` re-run
- [ ] **Migration** — re-runnable, non-destructive, does not resurrect soft-deleted rows
- [ ] **Money** — amounts of different currencies are never summed; display currency comes from the caller
- [ ] **Mobile** — writes go to SQLite first; an expected offline push failure logs `console.warn`, not `console.error`
- [ ] **Shared code** — the API imports no runtime value from `@budget/shared-utils`; a duplicated pair is documented on both sides
- [ ] **Generated files** — regenerated from source, not hand-edited

## Anything reviewers should push back on

<!-- Assumptions you made, a decision you are unsure about, or scope you deliberately
left out. Say it here rather than letting a reviewer discover it. -->
