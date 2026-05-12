---
id: deprecated-legal-urls-export
title: Deprecated LEGAL_URLS constant is dead code in legal.ts
status: open
priority: P3
module: apps/mobile
created_at: 2026-05-11
---

# Deprecated LEGAL_URLS constant is dead code in legal.ts

## What's wrong

`apps/mobile/src/constants/legal.ts` exports both `getLegalUrls(language)` (the correct localised helper) and `LEGAL_URLS` (a hardcoded English-only object marked `@deprecated` at line 18). A codebase-wide grep shows `LEGAL_URLS` is not imported anywhere outside of `legal.ts` itself, meaning the deprecated export has been dead code since `getLegalUrls` was introduced.

## Why it matters

Low impact today, but the deprecated export creates a trap: any new screen or onboarding flow that reaches for a conveniently named constant risks importing `LEGAL_URLS` instead of `getLegalUrls`, serving English-only legal URLs regardless of the user's language setting. Privacy policy pages in the wrong language are a compliance concern in GDPR-covered locales (PL, DE, FR, ES).

## Proposed fix

- Delete the `LEGAL_URLS` export and its JSDoc comment from `apps/mobile/src/constants/legal.ts`.
- Run `grep -r "LEGAL_URLS"` to confirm no import sites were missed.
- No migration or API change needed — this is a one-file deletion.

## Files involved

- `apps/mobile/src/constants/legal.ts`
