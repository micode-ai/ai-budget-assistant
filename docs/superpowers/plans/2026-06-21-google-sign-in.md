# Google Sign-In / Sign-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" sign-in and sign-up alongside the existing email/password auth, on mobile (iOS/Android) and web, reusing the existing JWT session model.

**Architecture:** The client obtains a Google **ID token** via `expo-auth-session` (no native module) and posts it to a new `POST /auth/google`. The backend verifies the token with `google-auth-library`, finds-or-creates the user (auto-linking by verified email), and returns the same `{ accessToken, refreshToken, user, accounts }` shape as `/auth/login`.

**Tech Stack:** NestJS 10 + Prisma 5 (API), `google-auth-library`; Expo 54 + React Native + Zustand (client), `expo-auth-session` + `expo-crypto`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-google-sign-in-design.md`.
- Platforms: mobile (iOS/Android) + web only. **Admin is out of scope.**
- Account linking: **auto-link by `email_verified` Google email**.
- New Google users created with: name+email from Google, `language` from the client's UI locale, `currencyCode` default `USD`, `isVerified = true`, **no password**.
- ID token is verified **server-side only**; never trust client claims. Require `payload.email_verified === true`.
- Client OAuth library is `expo-auth-session` — **do NOT add `@react-native-google-signin` or any new native module** (Windows MAX_PATH / prebuild risk per CLAUDE.md).
- i18n: any new key must be added to **all 9 locale files** (`en, de, es, fr, pl, ru, ua, be, nl`).
- `@budget/shared-*` are type-only for the API — never import runtime values from them in `apps/api`.
- GitHub artifacts (issues/PRs/commits) are written in **English**.
- New env var: `GOOGLE_OAUTH_CLIENT_IDS` (comma-separated accepted audiences). Client env: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.

## File Structure

**API**
- `apps/api/prisma/schema.prisma` — add `googleId`, make `passwordHash` nullable (Task 1).
- `apps/api/src/modules/auth/google-token-verifier.ts` — NEW: wraps `google-auth-library` (Task 3).
- `apps/api/src/modules/auth/dto/index.ts` — add `GoogleAuthDto` (Task 4).
- `apps/api/src/modules/users/users.service.ts` — extend `create`, add `findByGoogleId`, allow `googleId`/`isVerified` in update (Task 5).
- `apps/api/src/modules/auth/auth.service.ts` — add `googleLogin()`, null-password guard in `login()` (Task 6).
- `apps/api/src/modules/auth/auth.service.spec.ts` — tests for `googleLogin` (Task 6).
- `apps/api/src/modules/auth/auth.controller.ts` — add `POST /auth/google` (Task 7).
- `apps/api/src/modules/auth/auth.module.ts` — register `GoogleTokenVerifier` (Task 7).
- `.env.example` — document new env vars (Task 7).

**Shared types**
- `packages/shared-types/src/entities/user.ts` — add optional `googleId?` (Task 2).

**Mobile**
- `apps/mobile/src/services/auth.api.ts` — add `loginWithGoogle()` (Task 8).
- `apps/mobile/src/stores/authStore.ts` — add `googleLogin()` action (Task 9).
- `apps/mobile/src/features/auth/useGoogleAuth.ts` — NEW hook (Task 10).
- `apps/mobile/app/(auth)/login.tsx` + `register.tsx` — add Google button (Task 11).
- `apps/mobile/src/i18n/locales/*.ts` — 5 new keys × 9 locales (Task 12).
- `apps/mobile/.env.example` (or root `.env.example`) — client env vars (Task 11).

---

## Task 1: DB schema — googleId + nullable passwordHash

**Files:**
- Modify: `apps/api/prisma/schema.prisma:82-113` (User model)

**Interfaces:**
- Produces: `User.googleId String?` (unique), `User.passwordHash String?` (now nullable) on the Prisma client.

- [ ] **Step 1: Edit the User model**

In `apps/api/prisma/schema.prisma`, change the `passwordHash` line and add `googleId` right after it:

```prisma
  email            String    @unique
  passwordHash     String?   @map("password_hash")
  googleId         String?   @unique @map("google_id")
  name             String
```

(Only `passwordHash` gains a `?`; `googleId` is the new line.)

- [ ] **Step 2: Hand-write the migration (local DB is offline)**

The local Postgres at `127.0.0.1:5433` is not running and `prisma migrate dev` cannot diff, so create the migration file by hand. It will be applied by `prisma migrate deploy` on deploy (or locally once Postgres is up). The SQL below is byte-for-byte what `migrate dev` would generate for this schema change.

Create `apps/api/prisma/migrations/20260621000000_add_google_auth/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
```

- [ ] **Step 3: Regenerate the Prisma client (no DB needed)**

Run from `apps/api/`:
```bash
npx prisma generate
```
Expected: "Generated Prisma Client" with no errors. (`generate` reads only `schema.prisma`; it does not touch the database.)

- [ ] **Step 4: Verify the API still type-checks**

Run from repo root:
```bash
npx turbo run typecheck --filter=@budget/api
```
Expected: PASS (existing code that reads `user.passwordHash` still compiles — `bcrypt.compare` accepts `string`, and the guard in Task 6 handles null; if typecheck flags a null issue before Task 6, that is expected and resolved there — note it and proceed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(auth): add googleId and make passwordHash nullable"
```

---

## Task 2: Shared type — optional googleId on User

**Files:**
- Modify: `packages/shared-types/src/entities/user.ts`

**Interfaces:**
- Produces: `User.googleId?: string` available to client/admin bundles.

- [ ] **Step 1: Add the field**

Open `packages/shared-types/src/entities/user.ts` and add `googleId?: string;` to the `User` interface (place it after `email`):

```typescript
export interface User {
  id: string;
  email: string;
  googleId?: string;
  name: string;
  // ...rest unchanged
}
```

- [ ] **Step 2: Typecheck shared-types**

Run from repo root:
```bash
npx turbo run typecheck --filter=@budget/shared-types
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/entities/user.ts
git commit -m "feat(types): add optional googleId to User entity"
```

---

## Task 3: GoogleTokenVerifier service

**Files:**
- Create: `apps/api/src/modules/auth/google-token-verifier.ts`
- Modify: `apps/api/package.json` (add `google-auth-library`)

**Interfaces:**
- Produces: `class GoogleTokenVerifier { verify(idToken: string): Promise<TokenPayload> }` — injectable; throws `ServiceUnavailableException` when unconfigured, `UnauthorizedException` on invalid token.

- [ ] **Step 1: Install the dependency**

Run from `apps/api/`:
```bash
npm install google-auth-library
```
Expected: `google-auth-library` added to `apps/api/package.json` dependencies; root lockfile updated.

- [ ] **Step 2: Create the verifier**

Create `apps/api/src/modules/auth/google-token-verifier.ts`:

```typescript
import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(private readonly configService: ConfigService) {
    this.audiences = (this.configService.get<string>('GOOGLE_OAUTH_CLIENT_IDS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async verify(idToken: string): Promise<TokenPayload> {
    if (this.audiences.length === 0) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return payload;
  }
}
```

- [ ] **Step 3: Typecheck**

Run from repo root:
```bash
npx turbo run typecheck --filter=@budget/api
```
Expected: PASS (the file compiles; it is wired into the module in Task 7).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/auth/google-token-verifier.ts
git commit -m "feat(auth): add GoogleTokenVerifier wrapping google-auth-library"
```

---

## Task 4: GoogleAuthDto

**Files:**
- Modify: `apps/api/src/modules/auth/dto/index.ts`

**Interfaces:**
- Produces: `GoogleAuthDto { idToken: string; language?: string; currencyCode?: string; referralCode?: string }`.

- [ ] **Step 1: Add the DTO**

Append to `apps/api/src/modules/auth/dto/index.ts`:

```typescript
export class GoogleAuthDto {
  @IsString()
  @MinLength(1)
  idToken: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,10}$/, { message: 'Invalid referral code format' })
  referralCode?: string;
}
```

(`IsString`, `MinLength`, `IsOptional`, `Matches` are already imported at the top of the file.)

- [ ] **Step 2: Typecheck**

```bash
npx turbo run typecheck --filter=@budget/api
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/dto/index.ts
git commit -m "feat(auth): add GoogleAuthDto"
```

---

## Task 5: UsersService — googleId support

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts:4-50`

**Interfaces:**
- Consumes: Prisma `User` with `googleId`, nullable `passwordHash` (Task 1).
- Produces:
  - `CreateUserData` gains `passwordHash?`, `googleId?`, `isVerified?` (and existing `language?`).
  - `UsersService.create(data)` writes `language`, `googleId`, `isVerified`, nullable `passwordHash`.
  - `UsersService.findByGoogleId(googleId: string)` → user or null.
  - `UsersService.update(id, Partial<CreateUserData>)` accepts `googleId`/`isVerified`.

- [ ] **Step 1: Widen CreateUserData and create()**

Replace the `CreateUserData` interface and the `create` method in `apps/api/src/modules/users/users.service.ts`:

```typescript
interface CreateUserData {
  email: string;
  passwordHash?: string;
  name: string;
  currencyCode?: string;
  timezone?: string;
  language?: string;
  googleId?: string;
  isVerified?: boolean;
  emailVerificationCode?: string;
  emailVerificationExpiresAt?: Date;
}
```

```typescript
  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        name: data.name,
        currencyCode: data.currencyCode || 'USD',
        timezone: data.timezone || 'UTC',
        language: data.language || 'en',
        googleId: data.googleId,
        isVerified: data.isVerified ?? false,
        emailVerificationCode: data.emailVerificationCode,
        emailVerificationExpiresAt: data.emailVerificationExpiresAt,
      },
    });
  }
```

- [ ] **Step 2: Add findByGoogleId()**

Add right after `findByEmail`:

```typescript
  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx turbo run typecheck --filter=@budget/api
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(users): support googleId in create/find/update"
```

---

## Task 6: AuthService.googleLogin + login guard (TDD)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `apps/api/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `GoogleTokenVerifier.verify` (Task 3), `UsersService.findByGoogleId`/`create`/`update` (Task 5), `GoogleAuthDto` (Task 4).
- Produces: `AuthService.googleLogin(dto: GoogleAuthDto)` → `{ accessToken, refreshToken, user, accounts }`. `AuthService` constructor gains a 9th param `googleVerifier: GoogleTokenVerifier`. `login()` throws `UnauthorizedException('Use Google sign-in for this account')` when `passwordHash` is null.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/modules/auth/auth.service.spec.ts`, extend `makeService()` to construct the verifier mock and pass it as the new last constructor arg. Replace the `makeService` return + constructor call:

```typescript
  const googleVerifier: any = {
    verify: jest.fn(),
  };

  const service = new AuthService(
    usersService,
    accountsService,
    telegramService,
    mailService,
    jwtService,
    configService,
    adminGateway,
    referralsService,
    googleVerifier,
  );

  return { service, usersService, accountsService, mailService, jwtService, googleVerifier };
```

Then append a new describe block at the end of the file:

```typescript
describe('AuthService — googleLogin', () => {
  const goodPayload = {
    sub: 'google-123',
    email: 'User@Example.com',
    email_verified: true,
    name: 'Google User',
  };

  it('rejects a token whose email is not verified', async () => {
    const { service, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue({ ...goodPayload, email_verified: false });

    await expect(service.googleLogin({ idToken: 'tok' })).rejects.toThrow(UnauthorizedException);
  });

  it('signs in an existing user matched by googleId', async () => {
    const { service, usersService, jwtService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue({
      id: 'u1', email: 'user@example.com', name: 'Google User',
      isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-1',
    });

    const result = await service.googleLogin({ idToken: 'tok' });

    expect(result.accessToken).toBeTruthy();
    expect(jwtService.signAsync).toHaveBeenCalled();
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('auto-links an existing password user matched by email', async () => {
    const { service, usersService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue({
      id: 'u2', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: true, currencyCode: 'USD',
    });
    usersService.update.mockResolvedValue({
      id: 'u2', email: 'user@example.com', name: 'Existing', isActive: true, isVerified: true, currencyCode: 'USD', defaultAccountId: 'acc-2',
    });

    const result = await service.googleLogin({ idToken: 'tok' });

    expect(usersService.update).toHaveBeenCalledWith('u2', expect.objectContaining({ googleId: 'google-123' }));
    expect(usersService.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe('u2');
  });

  it('creates a new verified user with defaults when no match exists', async () => {
    const { service, usersService, accountsService, googleVerifier } = makeService();
    googleVerifier.verify.mockResolvedValue(goodPayload);
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'u3', email: 'user@example.com', name: 'Google User', isActive: true, isVerified: true, currencyCode: 'USD',
    });
    accountsService.createDefaultAccount.mockResolvedValue({ id: 'acc-3' });

    const result = await service.googleLogin({ idToken: 'tok', language: 'pl' });

    expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      googleId: 'google-123',
      isVerified: true,
    }));
    expect(accountsService.createDefaultAccount).toHaveBeenCalled();
    expect(result.accessToken).toBeTruthy();
    expect(result.user.defaultAccountId).toBe('acc-3');
  });
});

describe('AuthService — login passwordless guard', () => {
  it('directs Google-only accounts to Google sign-in', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1', email: 'g@x.com', isActive: true, isVerified: true, passwordHash: null,
    });

    await expect(service.login({ email: 'g@x.com', password: 'pw' })).rejects.toThrow(
      'Use Google sign-in for this account',
    );
  });
});
```

(Note: `accountsService` is now returned from `makeService` — Step 1 added it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/api/`:
```bash
npx jest auth.service.spec.ts
```
Expected: FAIL — `service.googleLogin is not a function` and the login guard test fails.

- [ ] **Step 3: Add null-password guards (login + changeEmailRequest)**

`passwordHash` became nullable in Task 1, and it is read with `bcrypt.compare` in two places. Guard both so the API type-checks and behaves correctly for Google-only accounts.

(a) In `apps/api/src/modules/auth/auth.service.ts`, inside `login()` immediately after the `if (!user)` check (around line 133), add:

```typescript
    if (!user.passwordHash) {
      throw new UnauthorizedException('Use Google sign-in for this account');
    }
```

(b) In `changeEmailRequest()`, immediately after the `if (!user || !user.isActive)` check (around line 380) and before the `bcrypt.compare(dto.currentPassword, user.passwordHash)` line, add:

```typescript
    if (!user.passwordHash) {
      throw new BadRequestException('This account uses Google sign-in and has no password to verify');
    }
```

(`BadRequestException` is already imported in this file.)

- [ ] **Step 4: Inject the verifier and implement googleLogin()**

Add the import at the top of `auth.service.ts`:
```typescript
import { GoogleTokenVerifier } from './google-token-verifier';
import { GoogleAuthDto } from './dto';
```
(Extend the existing `./dto` import to include `GoogleAuthDto` if you prefer a single import line.)

Add the constructor parameter (after `referralsService`):
```typescript
    private readonly referralsService: ReferralsService,
    private readonly googleVerifier: GoogleTokenVerifier,
  ) {}
```

Add the method (place it after `login()`):

```typescript
  async googleLogin(dto: GoogleAuthDto) {
    const payload = await this.googleVerifier.verify(dto.idToken);

    if (!payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name || email.split('@')[0];

    // 1. Existing Google user
    let user = await this.usersService.findByGoogleId(googleId);

    // 2. Auto-link to an existing password account by verified email
    if (!user) {
      const byEmail = await this.usersService.findByEmail(email);
      if (byEmail) {
        user = await this.usersService.update(byEmail.id, {
          googleId,
          ...(byEmail.isVerified ? {} : { isVerified: true }),
        });
      }
    }

    // 3. Brand-new user — create with defaults
    let createdAccountId: string | undefined;
    if (!user) {
      user = await this.usersService.create({
        email,
        name,
        googleId,
        isVerified: true,
        currencyCode: dto.currencyCode,
        language: dto.language,
      });

      this.telegramService.notifyNewUser(user.name, user.email);
      this.adminGateway.emitNewUser({
        userId: user.id,
        name: user.name,
        email: user.email,
        createdAt: new Date().toISOString(),
      });

      if (dto.referralCode) {
        await this.referralsService.applyReferralCode(user.id, dto.referralCode);
      }

      const defaultAccount = await this.accountsService.createDefaultAccount(
        user.id,
        dto.currencyCode || 'USD',
        dto.language || 'en',
      );
      createdAccountId = defaultAccount.id;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    this.usersService.updateLastSync(user.id).catch(() => null);

    const tokens = await this.generateTokens(user.id, user.email);
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: user.defaultAccountId || createdAccountId,
        isVerified: true,
      },
      accounts,
    };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run from `apps/api/`:
```bash
npx jest auth.service.spec.ts
```
Expected: PASS (all existing + new tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): googleLogin with auto-link + login guard for passwordless accounts"
```

---

## Task 7: Controller endpoint + module wiring + env docs

**Files:**
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Test: `apps/api/src/modules/auth/auth.controller.spec.ts` (create)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `AuthService.googleLogin` (Task 6), `GoogleTokenVerifier` (Task 3), `GoogleAuthDto` (Task 4).
- Produces: `POST /auth/google` route returning the auth response.

- [ ] **Step 1: Write the failing controller test**

Create `apps/api/src/modules/auth/auth.controller.spec.ts`:

```typescript
import { AuthController } from './auth.controller';

describe('AuthController — google', () => {
  it('delegates POST /auth/google to AuthService.googleLogin', async () => {
    const authService: any = {
      googleLogin: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {}, accounts: [] }),
    };
    const controller = new AuthController(authService);

    const dto = { idToken: 'tok', language: 'en' } as any;
    const result = await controller.googleLogin(dto);

    expect(authService.googleLogin).toHaveBeenCalledWith(dto);
    expect(result.accessToken).toBe('a');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest auth.controller.spec.ts
```
Expected: FAIL — `controller.googleLogin is not a function`.

- [ ] **Step 3: Add the route**

In `apps/api/src/modules/auth/auth.controller.ts`, add `GoogleAuthDto` to the dto import, then add the handler after `login()`:

```typescript
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto);
  }
```

- [ ] **Step 4: Register the verifier in the module**

In `apps/api/src/modules/auth/auth.module.ts`, import and add `GoogleTokenVerifier` to `providers`:

```typescript
import { GoogleTokenVerifier } from './google-token-verifier';
// ...
  providers: [AuthService, JwtStrategy, GoogleTokenVerifier],
```

- [ ] **Step 5: Run the controller test + full auth suite**

```bash
npx jest auth.controller.spec.ts auth.service.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Verify the module boots (compile)**

```bash
npx turbo run build --filter=@budget/api
```
Expected: build succeeds (Nest DI resolves `GoogleTokenVerifier`).

- [ ] **Step 7: Document env vars**

In `.env.example`, under the auth/JWT section, add:

```bash
# Google Sign-In — comma-separated OAuth client IDs accepted as ID-token audiences (web,ios,android)
GOOGLE_OAUTH_CLIENT_IDS=
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.controller.spec.ts apps/api/src/modules/auth/auth.module.ts .env.example
git commit -m "feat(auth): POST /auth/google endpoint + wiring + env docs"
```

---

## Task 8: Mobile API client — loginWithGoogle

**Files:**
- Modify: `apps/mobile/src/services/auth.api.ts`

**Interfaces:**
- Produces: `api.loginWithGoogle(idToken, language?, currencyCode?, referralCode?)` → `{ accessToken, refreshToken, user, accounts }` (auto-spread into the `api` barrel via `...authApi`).

- [ ] **Step 1: Add the method**

In `apps/mobile/src/services/auth.api.ts`, add inside the `authApi` object (after `register`):

```typescript
  loginWithGoogle(idToken: string, language?: string, currencyCode?: string, referralCode?: string) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, language, currencyCode, referralCode }),
        skipAuth: true,
      },
    );
  },
```

- [ ] **Step 2: Typecheck mobile**

```bash
npx turbo run typecheck --filter=@budget/mobile
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/auth.api.ts
git commit -m "feat(mobile): add loginWithGoogle API client method"
```

---

## Task 9: authStore.googleLogin action

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts`

**Interfaces:**
- Consumes: `api.loginWithGoogle` (Task 8).
- Produces: `useAuthStore().googleLogin(idToken: string, language?: string)` — verified session; mirrors the success path of `login()`.

- [ ] **Step 1: Declare the action in the interface**

In the `AuthState` interface (around line 35), add after `register`:

```typescript
  googleLogin: (idToken: string, language?: string) => Promise<void>;
```

- [ ] **Step 2: Implement the action**

Add this implementation right after the `register` action (after its closing `},` near line 297). It intentionally mirrors the verified success path of `login()`:

```typescript
      googleLogin: async (idToken: string, language?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.loginWithGoogle(idToken, language);

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            name: response.user.name,
            currencyCode: (response.user.currencyCode || 'USD') as Currency,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            defaultAccountId: response.user.defaultAccountId,
            isVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));
          await secureStorage.setItem('biometricEnabled', 'true');

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            hasSavedSession: false,
          });

          if (response.accounts) {
            await useAccountStore.getState().initialize(
              response.accounts,
              response.user.defaultAccountId || '',
              user.id,
            );
          }

          try {
            const profile = await api.getProfile();
            if (profile.isAdmin || profile.aiResponseMode || profile.aiModel) {
              const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced' };
              set({ user: updatedUser });
              await secureStorage.setItem('user', JSON.stringify(updatedUser));
            }
          } catch { /* non-critical */ }

          await useExchangeRateStore.getState().loadRates();
          await Promise.allSettled([
            hydrateTransactions(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);

          set({ isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Google sign-in failed',
            isLoading: false,
          });
          throw error;
        }
      },
```

- [ ] **Step 3: Typecheck mobile**

```bash
npx turbo run typecheck --filter=@budget/mobile
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "feat(mobile): add googleLogin action to authStore"
```

---

## Task 10: useGoogleAuth hook

**Files:**
- Create: `apps/mobile/src/features/auth/useGoogleAuth.ts`
- Modify: `apps/mobile/package.json` (add `expo-auth-session`, `expo-crypto`)

**Interfaces:**
- Consumes: `useAuthStore().googleLogin` (Task 9).
- Produces: `useGoogleAuth()` → `{ signIn(language?: string): Promise<'success' | 'dismissed' | 'error'>, isReady: boolean }`.

- [ ] **Step 1: Install Expo deps**

Run from `apps/mobile/`:
```bash
npx expo install expo-auth-session expo-crypto
```
Expected: both added to `apps/mobile/package.json` at Expo-54-compatible versions. (`expo-web-browser` is already present.)

- [ ] **Step 2: Create the hook**

Create `apps/mobile/src/features/auth/useGoogleAuth.ts`:

```typescript
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuthStore } from '@/stores/authStore';

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInOutcome = 'success' | 'dismissed' | 'error';

export function useGoogleAuth() {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const signIn = async (language?: string): Promise<GoogleSignInOutcome> => {
    const result = await promptAsync();
    if (!result || result.type === 'dismiss' || result.type === 'cancel') {
      return 'dismissed';
    }
    if (result.type !== 'success') {
      return 'error';
    }
    const idToken = (result.params as Record<string, string> | undefined)?.id_token;
    if (!idToken) {
      return 'error';
    }
    await useAuthStore.getState().googleLogin(idToken, language);
    return 'success';
  };

  return { signIn, isReady: !!request };
}
```

- [ ] **Step 3: Typecheck mobile**

```bash
npx turbo run typecheck --filter=@budget/mobile
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json package-lock.json apps/mobile/src/features/auth/useGoogleAuth.ts
git commit -m "feat(mobile): add useGoogleAuth hook (expo-auth-session)"
```

---

## Task 11: Google button on login + register screens

**Files:**
- Modify: `apps/mobile/app/(auth)/login.tsx`
- Modify: `apps/mobile/app/(auth)/register.tsx`
- Modify: root `.env.example`

**Interfaces:**
- Consumes: `useGoogleAuth` (Task 10), i18n keys `auth.continueWithGoogle`, `auth.or`, `errors.googleSignInFailed`, `errors.googleEmailNotVerified`, `errors.usePasswordLogin` (Task 12 — add the English keys first if running this before Task 12, or run Task 12 first).

> **Order note:** run **Task 12 before this task** so the i18n keys exist; the steps below assume the keys resolve.

- [ ] **Step 1: Wire the hook into login.tsx**

In `apps/mobile/app/(auth)/login.tsx`:

(a) Add to `API_ERROR_MAP` (after the `'Session expired'` line):
```typescript
  'Use Google sign-in for this account': 'errors.usePasswordLogin',
  'Google account email is not verified': 'errors.googleEmailNotVerified',
```

(b) Add the import near the other imports:
```typescript
import { useGoogleAuth } from '@/features/auth/useGoogleAuth';
```

(c) Inside the component, after the existing `useBiometric` line:
```typescript
  const { i18n } = useTranslation();
  const { signIn: googleSignIn, isReady: googleReady } = useGoogleAuth();

  const handleGoogle = async () => {
    setError(null);
    try {
      const outcome = await googleSignIn(i18n.language);
      if (outcome === 'success') {
        router.replace('/(tabs)');
      } else if (outcome === 'error') {
        setError(t('errors.googleSignInFailed'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t, 'errors.googleSignInFailed'));
    }
  };
```
(`useTranslation()` is already called at the top — merge `i18n` into that existing destructure instead of calling it twice: change `const { t } = useTranslation();` to `const { t, i18n } = useTranslation();` and delete the duplicate line above.)

(d) Add the divider + button in the JSX, immediately after the main Sign In `</TouchableOpacity>` (the one wrapping `auth.signIn`, before the `{showBiometric && ...}` block):
```tsx
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogle}
            disabled={isLoading || !googleReady}
          >
            <Ionicons name="logo-google" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
          </TouchableOpacity>
```

(e) Add styles to `createStyles` (inside the returned object):
```typescript
  dividerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginVertical: theme.spacing[2],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  googleButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  googleButtonText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
```

- [ ] **Step 2: Wire the same button into register.tsx**

Apply the equivalent edits to `apps/mobile/app/(auth)/register.tsx`:
- import `useGoogleAuth` and `Ionicons` (Ionicons is likely already imported — verify);
- ensure `i18n` is available from `useTranslation()`;
- add the same `handleGoogle` (navigating to `/(tabs)` on success — Google users are verified, so no verify-email step);
- render the same divider + Google button below the primary "Sign Up" button and above the "already have an account?" footer;
- add the same `dividerRow`/`dividerLine`/`dividerText`/`googleButton`/`googleButtonText` styles to its `createStyles`.
- Add a short terms-acceptance line under the Google button (the password flow has a terms checkbox; Google sign-up uses implicit consent):
```tsx
          <Text style={styles.googleTerms}>{t('auth.googleTermsNote')}</Text>
```
```typescript
  googleTerms: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
```
(`auth.googleTermsNote` is added in Task 12. If `textStyles.caption` does not exist in the theme, use `theme.textStyles.bodySm`.)

- [ ] **Step 3: Document client env vars**

In the root `.env.example`, under the `EXPO_PUBLIC_*` section, add:
```bash
# Google Sign-In OAuth client IDs (per platform)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

- [ ] **Step 4: Typecheck + lint mobile**

```bash
npx turbo run typecheck --filter=@budget/mobile
npx turbo run lint --filter=@budget/mobile
```
Expected: PASS.

- [ ] **Step 5: Manual smoke test (web)**

With `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` set to a real web client ID, run `npm run dev:web`, open the login screen, click "Continue with Google", complete consent, and confirm you land on `/(tabs)`. (If client IDs are not yet provisioned, confirm the button renders and shows `errors.googleSignInFailed` on failure instead — full success requires the Google Cloud prerequisite.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/(auth)/login.tsx apps/mobile/app/(auth)/register.tsx .env.example
git commit -m "feat(mobile): Continue with Google button on login and register"
```

---

## Task 12: i18n keys (9 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Produces: `auth.continueWithGoogle`, `auth.or`, `auth.googleTermsNote`, `errors.googleSignInFailed`, `errors.googleEmailNotVerified`, `errors.usePasswordLogin` in every locale.

> Use the `i18n-add-strings` skill to keep the 9 files in sync. The `auth.*` keys go in the `auth` object; the `errors.*` keys go in the `errors` object.

- [ ] **Step 1: Add the three `auth.*` keys to each locale's `auth` object**

| key | en | de | es | fr | pl | ru | ua | be | nl |
|---|---|---|---|---|---|---|---|---|---|
| `continueWithGoogle` | Continue with Google | Mit Google fortfahren | Continuar con Google | Continuer avec Google | Kontynuuj z Google | Продолжить с Google | Продовжити з Google | Працягнуць з Google | Doorgaan met Google |
| `or` | or | oder | o | ou | lub | или | або | або | of |
| `googleTermsNote` | By continuing you accept our Terms and Privacy Policy | Mit der Fortsetzung akzeptieren Sie unsere AGB und Datenschutzrichtlinie | Al continuar, aceptas nuestros Términos y la Política de Privacidad | En continuant, vous acceptez nos Conditions et la Politique de confidentialité | Kontynuując, akceptujesz nasz Regulamin i Politykę prywatności | Продолжая, вы принимаете Условия и Политику конфиденциальности | Продовжуючи, ви приймаєте Умови та Політику конфіденційності | Працягваючы, вы прымаеце Умовы і Палітыку прыватнасці | Door door te gaan accepteer je onze Voorwaarden en het Privacybeleid |

- [ ] **Step 2: Add the three `errors.*` keys to each locale's `errors` object**

| key | en | de | es | fr | pl | ru | ua | be | nl |
|---|---|---|---|---|---|---|---|---|---|
| `googleSignInFailed` | Google sign-in failed. Please try again. | Google-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut. | Error al iniciar sesión con Google. Inténtalo de nuevo. | Échec de la connexion Google. Veuillez réessayer. | Logowanie przez Google nie powiodło się. Spróbuj ponownie. | Не удалось войти через Google. Попробуйте ещё раз. | Не вдалося увійти через Google. Спробуйте ще раз. | Не ўдалося ўвайсці праз Google. Паспрабуйце яшчэ раз. | Inloggen met Google is mislukt. Probeer het opnieuw. |
| `googleEmailNotVerified` | Your Google account email is not verified. | Die E-Mail-Adresse Ihres Google-Kontos ist nicht verifiziert. | El correo de tu cuenta de Google no está verificado. | L'adresse e-mail de votre compte Google n'est pas vérifiée. | Adres e-mail Twojego konta Google nie został zweryfikowany. | Электронная почта вашего аккаунта Google не подтверждена. | Електронна пошта вашого облікового запису Google не підтверджена. | Электронная пошта вашага ўліковага запісу Google не пацверджана. | Het e-mailadres van je Google-account is niet geverifieerd. |
| `usePasswordLogin` | This account uses Google sign-in. Tap "Continue with Google". | Dieses Konto verwendet die Google-Anmeldung. Tippen Sie auf „Mit Google fortfahren". | Esta cuenta usa el inicio de sesión con Google. Toca "Continuar con Google". | Ce compte utilise la connexion Google. Appuyez sur « Continuer avec Google ». | To konto korzysta z logowania Google. Naciśnij „Kontynuuj z Google". | Этот аккаунт использует вход через Google. Нажмите «Продолжить с Google». | Цей обліковий запис використовує вхід через Google. Натисніть «Продовжити з Google». | Гэты ўліковы запіс выкарыстоўвае ўваход праз Google. Націсніце «Працягнуць з Google». | Dit account gebruikt Google-aanmelding. Tik op "Doorgaan met Google". |

- [ ] **Step 3: Typecheck mobile**

```bash
npx turbo run typecheck --filter=@budget/mobile
```
Expected: PASS (all 9 locale files structurally identical — no TS shape errors).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(i18n): Google sign-in strings in all 9 locales"
```

---

## Task 13: Finalize — ABA issue + docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/<lang>/*` (if a relevant auth section exists)

- [ ] **Step 1: Run the finish-aba-task skill**

Use the `finish-aba-task` skill: create the next `ABA-{N}` GitHub issue (run `gh issue list --limit 1` first, add 1), titled in English, summarizing the Google sign-in feature; update the **API auth** bullet in `CLAUDE.md` to note `POST /auth/google`, `googleId`, nullable `passwordHash`, `GoogleTokenVerifier`, and `GOOGLE_OAUTH_CLIENT_IDS`; add the new env vars to the Environment Variables section.

- [ ] **Step 2: Full verification gate**

```bash
npx turbo run typecheck lint
cd apps/api && npx jest auth.service.spec.ts auth.controller.spec.ts
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md user_docs
git commit -m "docs: document Google sign-in (ABA-NNN)"
```

---

## Self-Review

- **Spec coverage:** platforms (Tasks 8–12 mobile+web) ✓; auto-link by verified email (Task 6) ✓; expo-auth-session, no native module (Task 10) ✓; new-user defaults incl. isVerified + language + USD (Tasks 5–6) ✓; server-side ID-token verification + email_verified (Tasks 3, 6) ✓; data model googleId + nullable passwordHash (Task 1) ✓; backend endpoint + DTO (Tasks 4, 7) ✓; google-auth-library + env (Tasks 3, 7) ✓; i18n 9 locales (Task 12) ✓; security (verifier audience/issuer, login guard) (Tasks 3, 6) ✓; tests (Tasks 6, 7) ✓; out-of-scope items not built ✓.
- **Type consistency:** `GoogleAuthDto`, `GoogleTokenVerifier.verify`, `findByGoogleId`, `googleLogin(dto)`, `api.loginWithGoogle(idToken, language?)`, `useGoogleAuth().signIn(language?)` names used consistently across producing and consuming tasks. The `AuthService` constructor's new 9th param `googleVerifier` matches the spec test in Task 6 Step 1.
- **Known tradeoff (documented):** the `login()` passwordless guard returns a distinct message ("Use Google sign-in for this account"), a minor account-existence signal accepted for UX per the auto-link decision.
- **Prerequisite (manual, blocks full end-to-end):** Google Cloud OAuth consent screen + Web/iOS/Android client IDs and redirect URIs (apex `app.ai-budget.pl` for web; app scheme `budget` / reverse client id for native). Set `GOOGLE_OAUTH_CLIENT_IDS` (API) and `EXPO_PUBLIC_GOOGLE_*` (client). Without these, the button renders but real sign-in fails.
