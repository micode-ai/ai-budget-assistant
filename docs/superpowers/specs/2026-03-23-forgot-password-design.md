# Forgot Password / Reset Password Flow

**Issue:** [#65](https://github.com/micode-ai/ai-budget-assistant/issues/65)
**Date:** 2026-03-23

## Overview

Users cannot recover their account if they forget their password. This spec adds a 6-digit email code flow for password reset.

## User Flow

1. User taps "Forgot password?" on login screen
2. Enters email on forgot-password screen → `POST /auth/forgot-password`
3. API generates 6-digit code, stores bcrypt hash in DB, sends code via email
4. User enters code + new password on reset-password screen → `POST /auth/reset-password`
5. API validates code, updates password, user returns to login with success message

## Backend

### Database Changes

New fields on `User` model in `apps/api/prisma/schema.prisma`:

```prisma
passwordResetCode      String?   @map("password_reset_code")
passwordResetExpiresAt DateTime? @map("password_reset_expires_at")
```

Migration: `npx prisma migrate dev --name add_password_reset_fields`

### Shared Types & Validation

In `packages/shared-types/src/dto/index.ts`:
- `ForgotPasswordDto` — `{ email: string }`
- `ResetPasswordDto` — `{ email: string, code: string, newPassword: string }`

In `packages/shared-utils/src/validation/index.ts`:
- `ForgotPasswordSchema` — Zod schema (reuse existing email validation)
- `ResetPasswordSchema` — Zod schema (reuse existing password regex)

### API DTOs

In `apps/api/src/modules/auth/dto/index.ts` — class-validator DTOs matching the shared types above. Password validation reuses existing regex: 8+ chars, 1 uppercase, 1 lowercase, 1 digit.

### New Endpoints

Both endpoints are public (no auth guard).

#### `POST /auth/forgot-password`

Input: `{ email }`

Logic:
1. Look up user by email
2. If not found or inactive — return 200 anyway (security: don't reveal email existence)
3. Rate limit check: max 3 requests per email per 15 minutes (in-memory Map with timestamps)
4. Generate random 6-digit code (crypto.randomInt)
5. Hash code with bcrypt (12 rounds, same as passwords)
6. Save hash + expiry (now + 30 min) to user record
7. Send email via MailService with code in large font
8. Return `{ message: "If this email is registered, a reset code has been sent" }`

#### `POST /auth/reset-password`

Input: `{ email, code, newPassword }`

Logic:
1. Look up user by email
2. If not found, inactive, no reset code, or expired — return 400 "Invalid or expired code"
3. Rate limit check: max 5 verification attempts per email per 15 minutes (prevents brute-forcing 6-digit code)
4. Compare `code` against stored bcrypt hash
5. If mismatch — return 400 "Invalid or expired code"
6. Hash new password with bcrypt (12 rounds)
7. Update user: set `passwordHash`, clear `passwordResetCode` and `passwordResetExpiresAt`
8. Return `{ message: "Password reset successfully" }`

### Rate Limiting

Simple in-memory approach in AuthService:

```typescript
private resetRequestAttempts = new Map<string, number[]>();  // forgot-password
private resetVerifyAttempts = new Map<string, number[]>();    // reset-password
```

- `forgot-password`: max 3 requests per email per 15 minutes
- `reset-password`: max 5 verification attempts per email per 15 minutes
- On each request, filter out entries older than 15 minutes before checking count
- Cleanup: entries are purged on access (lazy eviction), no background timer needed
- No Redis needed — acceptable to reset on server restart
- Throw 429 Too Many Requests when limit exceeded

### Module Wiring

Add `MailModule` to `AuthModule` imports so `MailService` can be injected into `AuthService`.

### Email Template

Subject: "Your password reset code — AI Budget"

Sent via existing `MailService.sendMail()`. Simple HTML:
- App name header
- "Your password reset code:" text
- Code in large monospace font (letter-spacing for readability)
- "This code expires in 30 minutes" note
- "If you didn't request this, ignore this email" footer

## Frontend

### New Screens

#### `app/(auth)/forgot-password.tsx`

- Email input field
- "Send Code" button → calls `authStore.forgotPassword(email)`
- On success: navigate to reset-password screen, passing email
- On error: show error message
- "Back to login" link
- Matches existing auth screen styling (same container, colors, spacing)

#### `app/(auth)/reset-password.tsx`

- Receives email as route param
- 6-digit code input field (`keyboardType="number-pad"`, `maxLength={6}`)
- "Resend code" link (calls forgot-password API again, respects rate limiting)
- New password field (with eye toggle)
- Confirm password field (with eye toggle)
- Client-side validation: password match, password strength (same rules as register)
- "Reset Password" button → calls `authStore.resetPassword(email, code, newPassword)`
- On success: navigate to login, show success toast/message
- On error: show error message
- "Back to login" link

### Changes to Existing Files

#### `app/(auth)/_layout.tsx`
- Add `<Stack.Screen name="forgot-password" />` and `<Stack.Screen name="reset-password" />` entries

#### `app/(auth)/login.tsx`
- Add "Forgot password?" link below password field, navigates to forgot-password screen

#### `apps/mobile/src/stores/authStore.ts`
- `forgotPassword(email: string)` — calls API, handles loading/error state
- `resetPassword(email: string, code: string, newPassword: string)` — calls API, handles loading/error state

#### `apps/mobile/src/services/api.ts`
- `forgotPassword(email: string)` → `POST /auth/forgot-password`
- `resetPassword(email: string, code: string, newPassword: string)` → `POST /auth/reset-password`

### i18n Keys

Add to all 8 locale files (`en`, `ru`, `ua`, `be`, `de`, `es`, `fr`, `pl`):

```
auth.forgotPassword — "Forgot password?"
auth.resetPassword — "Reset Password"
auth.sendCode — "Send Code"
auth.newPassword — "New Password"
auth.confirmNewPassword — "Confirm New Password"
auth.codeSent — "If this email is registered, a reset code has been sent"
auth.passwordResetSuccess — "Password reset successfully. Please log in."
auth.backToLogin — "Back to Login"
errors.invalidResetCode — "Invalid or expired code"
errors.tooManyResetAttempts — "Too many attempts. Please try again later."
errors.resetFailed — "Password reset failed. Please try again."
auth.resendCode — "Resend code"
```

### Error Handling

API returns `{ message: string }` on both success and error. Frontend maps error messages to i18n keys:
- 400 with `"Invalid or expired code"` → `errors.invalidResetCode`
- 429 → `errors.tooManyResetAttempts`
- Other errors → `errors.resetFailed`

Success responses are detected by 2xx status (message content not parsed by frontend).

## Security Considerations

- Reset code stored as bcrypt hash (not plaintext)
- Generic response on forgot-password (no email enumeration)
- `isActive` check on both endpoints (inactive users cannot reset)
- 30-minute expiry limits attack window
- Rate limiting on both endpoints: 3 requests/15min (forgot) + 5 attempts/15min (reset)
- Code is 6 digits = 1M combinations, combined with rate limiting this is secure
- Password validation enforced both client-side and server-side

## Out of Scope

- Invalidating existing sessions after password reset
- "Password changed" confirmation email notification
- Account lockout after N failed code attempts
- CAPTCHA on forgot-password form
