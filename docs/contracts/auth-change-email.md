---
status: deprecated
---

# Contract: Auth — Change Email

**Module:** `apps/api/src/modules/auth/`  
**Feature:** Self-service email address change

---

## Endpoints

### POST /auth/change-email/request

**Auth:** JWT required (`JwtAuthGuard`)  
**Rate limit:** 3 requests / 15 min per userId (in-memory, mirrors `resetRequestAttempts`)

**Request body:**
```json
{ "newEmail": "new@example.com", "currentPassword": "Secret123" }
```

**Success response (200):**
```json
{ "message": "Verification code sent to new@example.com" }
```

**Error responses:**
- `400` — current password invalid
- `409` — new email already registered to another account
- `429` — too many attempts

**Side effects:**
- Sets `emailChangePending = newEmail`, `emailChangeCode = bcrypt(6-digit)`, `emailChangeExpiresAt = now+30min` on the user row
- Sends 6-digit code to `newEmail` via MailService

---

### POST /auth/change-email/confirm

**Auth:** JWT required (`JwtAuthGuard`)  
**Rate limit:** 5 attempts / 15 min per userId (in-memory)

**Request body:**
```json
{ "code": "123456" }
```

**Success response (200):**
```json
{
  "message": "Email changed successfully",
  "accessToken": "...",
  "refreshToken": "..."
}
```

**Error responses:**
- `400` — no pending change, or invalid/expired code
- `429` — too many attempts

**Side effects:**
- Sets `user.email = emailChangePending`
- Clears `emailChangePending`, `emailChangeCode`, `emailChangeExpiresAt`
- Issues new JWT pair with updated email in payload

---

## Mobile screen flow

```
profile.tsx
  └─► /settings/change-email
        Step 1: { newEmail, currentPassword }
          └─► POST /auth/change-email/request
                ↓ persist { newEmail, expiresAt } to AsyncStorage key "pendingEmailChange"
        Step 2: { code }
          └─► POST /auth/change-email/confirm
                ↓ update authStore.user.email
                ↓ replace tokens in authStore
                ↓ clear AsyncStorage "pendingEmailChange"
                ↓ navigate back, show success
```

On cold-start: if AsyncStorage `pendingEmailChange` is set and not expired → skip to Step 2.

---

## Invariants

- `newEmail` must not equal current `user.email`
- `newEmail` must not already exist in the `users` table (enforced at request time, not confirm time)
- Code expires in 30 minutes (matching password-reset TTL)
- Password check uses `bcrypt.compare` against `user.passwordHash`
