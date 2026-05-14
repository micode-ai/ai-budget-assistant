---
id: self-service-email-change
title: Self-service email address change in Settings
status: shipped
priority: P2
created_at: 2026-05-11
jira_ticket:
orchestration_run: 8b9d51ba-3a2c-476e-92d0-63d8bad85a56
github_issue: https://github.com/micode-ai/ai-budget-assistant/issues/95
---

# Self-service email address change in Settings

## User story
As a registered user, I want to change my email address directly in the app, so that I don't have to contact support and wait for a manual update.

## Value hypothesis
The current user docs explicitly state "Email changes are not supported in the app currently. Contact support for assistance." (`user_docs/en/11-settings.md:188`). Every time a user hits this wall it creates a support ticket and erodes trust. A self-service flow eliminates the ticket, reduces friction for users who signed up with a work email but now want a personal one, and is table-stakes UX for any account-based app.

## Sketch
- Add "Change email" row to `app/settings/profile.tsx`.
- Flow: enter new email → app sends verification code to the *new* address (`POST /auth/change-email/request`) → user enters the 6-digit code (reuse the existing reset-password code pattern from `modules/auth/`) → on success, update `user.email` in DB and update the JWT.
- Require current password confirmation before sending the code (prevents unauthorized email hijacking).
- Show the new pending email with a "Resend code" option if the user closes the app mid-flow (persist pending email in AsyncStorage).
- Invalidate all other active sessions on completion.

## Open questions
- Should changing email require re-verification on all linked services (Telegram bot link, etc.)?
- Does Stripe customer record need updating if the user has an active subscription?
- Edge case: what if the new email is already registered to another account?

## Cost estimate
2 days: new API endpoint pair + mobile screen + i18n strings across 8 locales.
