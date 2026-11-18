---
id: accounts-service-mixes-crud-and-invitations
title: 'accounts.service.ts mixes account CRUD with invitation and membership management'
status: closed
priority: P3
module: 'apps/api'
created_at: 2026-09-08
orchestration_run: 9991a00d-ecc8-400d-bd15-e01f9e886a2e
---

# accounts.service.ts mixes account CRUD with invitation and membership management

## What's wrong

`apps/api/src/modules/accounts/accounts.service.ts` is 651 lines covering three distinct concerns in one class: (1) account CRUD — `create`, `findAllForUser`, `findOne`, `update`, `remove`, `validateAccess`, `createDefaultAccount`, `archiveTrip`; (2) invitations — `createInvitation`, `getInvitations`, `getMyInvitations`, `cancelInvitation`, `acceptInvitation`, `respondToInvitation`, `declineInvitation` (7 of the file's ~20 public methods); and (3) membership management — `getMembers`, `updateMemberRole`, `removeMember`, `leaveAccount`, `updatePaymentInfo`.

## Why it matters

The invitation flow alone (ABA-309's search-based invites, plus the original email/code/link paths) has its own IDOR-sensitive logic (`respondToInvitation` verifies the invitation is addressed to the responder before anything else, per `CLAUDE.md`'s account-invitation notes) and its own set of edge cases (expiry checks, `invitedUserId` vs `invitedEmail` matching) that are unrelated to plain account CRUD or to role/member management. All three concerns currently share one file, so a reviewer changing `updateMemberRole` has to scroll past the entire invitation-response security logic (and vice versa), and a future accounts feature is likely to land as another method appended to this same class rather than a focused sibling — the same regrowth risk already documented for `expenses.service.ts` and `chat.service.ts` before their splits.

## Proposed fix

- Extract the 7 invitation methods (`createInvitation`, `getInvitations`, `getMyInvitations`, `cancelInvitation`, `acceptInvitation`, `respondToInvitation`, `declineInvitation`) into a new `AccountInvitationsService`.
- Extract the 5 membership methods (`getMembers`, `updateMemberRole`, `removeMember`, `leaveAccount`, `updatePaymentInfo`) into a new `AccountMembersService`.
- Leave `AccountsService` owning only CRUD + `validateAccess` (which both new services will need to inject, since invitation/membership actions gate on account access).
- Update `AccountsController` to inject all three services directly for their respective routes, following the "controller injects each focused service directly" precedent from the `admin.service.ts`/`chat.service.ts` splits.
- Split `accounts.service.spec.ts` 1:1 with the new services.

## Files involved

- `apps/api/src/modules/accounts/accounts.service.ts`
- `apps/api/src/modules/accounts/accounts.service.spec.ts`
- `apps/api/src/modules/accounts/accounts.controller.ts`
