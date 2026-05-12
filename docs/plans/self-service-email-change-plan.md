---
status: done
---

# Plan: Self-service email address change

**Feature:** `self-service-email-change`  
**Orchestration run:** `5f29a84a-1e8d-4a1a-9dcb-064cb787de4b`  
**Started:** 2026-05-11

---

## Checklist

### Phase 1 — Schema & API

- [x] Update product idea frontmatter to `building`
- [x] Add Prisma fields (`emailChangePending`, `emailChangeCode`, `emailChangeExpiresAt`) to User model
- [x] Create Prisma migration `add_email_change_fields`
- [x] Add `ChangeEmailRequestDto` and `ChangeEmailConfirmDto` to `apps/api/src/modules/auth/dto/index.ts`
- [ ] Add `updateEmailChange()` to `apps/api/src/modules/users/users.service.ts`
- [ ] Add `requestEmailChange()` and `confirmEmailChange()` to `apps/api/src/modules/auth/auth.service.ts`
- [ ] Add two POST endpoints to `apps/api/src/modules/auth/auth.controller.ts`

### Phase 2 — Mobile

- [ ] Add `changeEmailRequest()` and `changeEmailConfirm()` to `apps/mobile/src/services/api.ts`
- [ ] Create `apps/mobile/app/settings/change-email.tsx` (multi-step screen)
- [ ] Add "Change email" row and navigation to `apps/mobile/app/settings/profile.tsx`
- [ ] Add i18n keys to all 8 locale files

### Phase 3 — Docs & Finish

- [ ] Update `user_docs/en/11-settings.md` (remove "not supported" note, document flow)
- [ ] Update CLAUDE.md auth module description
- [ ] Write contracts doc at `docs/contracts/change-email.md`
- [ ] Create GitHub issue ABA-N

---

## Design decisions

| Question | Decision | Rationale |
|---|---|---|
| Session invalidation | Issue new tokens on success; client replaces both. Other sessions expire naturally (7d/30d). | No DB-level blacklist exists; adding `tokenVersion` migration exceeds feature scope. |
| Stripe | Not updated | Separate concern; subscription billing uses stored card, not email notification. |
| Telegram | Not re-linked | `telegramLink` field is per-user, not per-email. |
| Duplicate email | Return 409 Conflict | Standard behaviour for account uniqueness. |
| Code expiry | 30 minutes | Same as password reset. |
| Rate limit | 3 request / 5 verify per email per 15 min | Mirrors the existing `resetRequestAttempts` / `resetVerifyAttempts` pattern. |
| Pending email persistence | AsyncStorage key `pendingEmailChange` (`{newEmail, expiresAt}`) | Survives app background/kill; cleared on confirm or cancel. |

---

## Endpoints

```
POST /auth/change-email/request   (JWT required)
  body: { newEmail, currentPassword }
  → 200 { message }

POST /auth/change-email/confirm   (JWT required)
  body: { code }
  → 200 { message, accessToken, refreshToken }
```

The requesting user's identity comes from the JWT (`req.user.sub`), not from the body.

---

## Screen flow

```
profile.tsx  →  [Change email row]
    ↓
change-email.tsx  Step 1: enter new email + current password
    ↓  (POST /auth/change-email/request)
Step 2: enter 6-digit code sent to new address
    ↓  (POST /auth/change-email/confirm)
Success → update authStore.user.email → replace tokens → navigate back to profile
```

Persisted state in AsyncStorage survives app close; on mount, if `pendingEmailChange` exists and is not expired, app starts at Step 2 with a "Resend" option.
