# Restore Credentials — Stage 1 (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the API a WebAuthn implementation that can register an Android
restore credential for a signed-in user and, on a new device, trade an assertion
for a normal JWT session — so the app can satisfy Google Play's April 2027
zero-tap sign-in requirement.

**Architecture:** A new `modules/restore-credentials/` NestJS module wrapping
`@simplewebauthn/server`. Two controllers — one JWT-guarded (registration), one
public and throttled (authentication) — so no route can inherit the wrong guard.
Challenges live in Redis via the existing `CacheService` and are deleted on use.
Credentials live in a new `user_restore_credentials` table, several rows per
user. Token issuance is delegated to `AuthService` so the restore login returns
byte-identical session JSON to `/auth/login` and `/auth/google`.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, Redis (`CacheService`),
`@simplewebauthn/server` 13.3.3, Jest.

**Spec:** `docs/superpowers/specs/2026-08-30-restore-credentials-design.md`

## Global Constraints

- **Never `import`/`require` `@budget/shared-utils` at runtime inside
  `apps/api/src`.** The API has no build step for workspace packages and prod
  Node ESM crash-loops on `ERR_UNSUPPORTED_DIR_IMPORT`. `import type` is fine.
  `scripts/check-no-shared-utils-runtime-import.sh` fails the deploy otherwise.
- **Migrations are authored DB-free.** There is no local database. Write the SQL
  by hand under `prisma/migrations/<timestamp>_<name>/migration.sql`; never run
  `prisma migrate dev`. Migrations run against prod via the deploy `migrator`.
- **`rpID` is `ai-budget.pl`.** Not `www.`, not `app.` — it is the apex, and it
  must match the domain hosting `assetlinks.json`.
- **Attestation is `'none'`.** Trust comes from the origin ↔ assetlinks binding.
- **`signCount` of 0 is valid** and must never be rejected.
- Prisma columns use `@map("snake_case")`; models map via `@@map`.
- Service methods take `(userId, …)`; this module is **user-scoped, not
  account-scoped** — do not add `AccountContextGuard` anywhere in it.
- Node ≥ 20 (`node:20-alpine`), TypeScript `"module": "commonjs"`.

---

### Task 1: Trust-chain config and the fingerprint encoding helper

The same SHA-256 fingerprint is needed in two encodings — colon-separated
uppercase hex in `assetlinks.json`, base64url of the same 32 raw bytes in the
WebAuthn origin. This task isolates that conversion behind a tested function so
the mistake cannot be made silently later.

**Files:**
- Create: `apps/api/src/modules/restore-credentials/restore-credential.config.ts`
- Test: `apps/api/src/modules/restore-credentials/restore-credential.config.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fingerprintHexToApkKeyHash(fingerprint: string): string`
  - `apkKeyHashOrigin(fingerprint: string): string`
  - `resolveRestoreCredentialConfig(env: NodeJS.ProcessEnv): RestoreCredentialConfig`
  - `interface RestoreCredentialConfig { rpId: string; rpName: string; expectedOrigins: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  fingerprintHexToApkKeyHash,
  apkKeyHashOrigin,
  resolveRestoreCredentialConfig,
} from './restore-credential.config';

// A real Play/debug fingerprint is 32 bytes printed as colon-separated hex.
const FINGERPRINT =
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:' +
  'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
const FLAT = FINGERPRINT.replace(/:/g, '');

describe('fingerprintHexToApkKeyHash', () => {
  // Asserted by round-trip rather than against a copied constant: the property
  // that matters is "the same 32 bytes, re-encoded", and a hand-copied base64
  // string would only prove someone pasted it correctly once.
  it('re-encodes the same bytes as unpadded base64url', () => {
    const hash = fingerprintHexToApkKeyHash(FINGERPRINT);
    expect(Buffer.from(hash, 'base64url').toString('hex').toUpperCase()).toBe(FLAT);
  });

  it('produces url-safe output with no padding', () => {
    const hash = fingerprintHexToApkKeyHash(FINGERPRINT);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('accepts lowercase and already-flat input', () => {
    expect(fingerprintHexToApkKeyHash(FLAT.toLowerCase())).toBe(
      fingerprintHexToApkKeyHash(FINGERPRINT),
    );
  });

  it('rejects anything that is not a 32-byte hex fingerprint', () => {
    expect(() => fingerprintHexToApkKeyHash('AB:CD')).toThrow(/SHA-256/);
    expect(() => fingerprintHexToApkKeyHash(`${FLAT}00`)).toThrow(/SHA-256/);
    expect(() => fingerprintHexToApkKeyHash(FLAT.replace('A', 'Z'))).toThrow(/SHA-256/);
  });
});

describe('apkKeyHashOrigin', () => {
  it('prefixes the android origin scheme', () => {
    expect(apkKeyHashOrigin(FINGERPRINT)).toBe(
      `android:apk-key-hash:${fingerprintHexToApkKeyHash(FINGERPRINT)}`,
    );
  });
});

describe('resolveRestoreCredentialConfig', () => {
  it('defaults the rp id to the apex domain', () => {
    const cfg = resolveRestoreCredentialConfig({
      RESTORE_CREDENTIAL_CERT_FINGERPRINTS: FINGERPRINT,
    } as NodeJS.ProcessEnv);
    expect(cfg.rpId).toBe('ai-budget.pl');
  });

  it('turns every configured fingerprint into an expected origin', () => {
    const second = FLAT.replace(/^AB/, 'CD');
    const cfg = resolveRestoreCredentialConfig({
      RESTORE_CREDENTIAL_CERT_FINGERPRINTS: ` ${FINGERPRINT} , ${second} `,
    } as NodeJS.ProcessEnv);
    expect(cfg.expectedOrigins).toEqual([
      apkKeyHashOrigin(FINGERPRINT),
      apkKeyHashOrigin(second),
    ]);
  });

  // Failing closed matters: an empty origin list would make verification
  // accept nothing, but a silently-empty one looks like a crypto bug for a day.
  it('throws when no fingerprint is configured', () => {
    expect(() => resolveRestoreCredentialConfig({} as NodeJS.ProcessEnv)).toThrow(
      /RESTORE_CREDENTIAL_CERT_FINGERPRINTS/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/restore-credentials/restore-credential.config.spec.ts`
Expected: FAIL — `Cannot find module './restore-credential.config'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface RestoreCredentialConfig {
  rpId: string;
  rpName: string;
  expectedOrigins: string[];
}

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * `assetlinks.json` prints a signing certificate's SHA-256 as colon-separated
 * uppercase hex; the WebAuthn `origin` an Android app reports is base64url of
 * those same 32 raw bytes. Same bytes, two encodings — converting them by hand
 * is the single most likely way to lose a day to "the signature does not
 * verify", so it happens here and nowhere else.
 */
export function fingerprintHexToApkKeyHash(fingerprint: string): string {
  const hex = fingerprint.replace(/:/g, '').trim();
  if (!SHA256_HEX.test(hex)) {
    throw new Error(
      `Expected a 32-byte SHA-256 certificate fingerprint, got "${fingerprint}"`,
    );
  }
  return Buffer.from(hex, 'hex').toString('base64url');
}

export function apkKeyHashOrigin(fingerprint: string): string {
  return `android:apk-key-hash:${fingerprintHexToApkKeyHash(fingerprint)}`;
}

export function resolveRestoreCredentialConfig(
  env: NodeJS.ProcessEnv,
): RestoreCredentialConfig {
  const raw = (env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS || '').trim();
  if (!raw) {
    throw new Error(
      'RESTORE_CREDENTIAL_CERT_FINGERPRINTS is not set; restore credentials ' +
        'cannot verify any Android origin without it',
    );
  }
  const expectedOrigins = raw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map(apkKeyHashOrigin);

  return {
    rpId: env.RESTORE_CREDENTIAL_RP_ID || 'ai-budget.pl',
    rpName: env.RESTORE_CREDENTIAL_RP_NAME || 'AI Budget Assistant',
    expectedOrigins,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/restore-credentials/restore-credential.config.spec.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Document the two env vars**

Append to `.env.example`, keeping the file's existing comment style:

```bash
# Restore Credentials (Android zero-tap sign-in, ABA). Comma-separated SHA-256
# fingerprints of every signing certificate allowed to present a restore
# credential — the Play App Signing certificate and, for local builds, the
# repository debug keystore. The same fingerprints must appear in
# docs/ops/assetlinks.json. Unset = the feature refuses to start its ceremonies.
RESTORE_CREDENTIAL_CERT_FINGERPRINTS=
RESTORE_CREDENTIAL_RP_ID=ai-budget.pl
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/restore-credentials/ .env.example
git commit -m "ABA-464 Add restore-credential trust-chain config and fingerprint encoding"
```

---

### Task 2: Prisma model and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add model; add one relation line to `User`)
- Create: `apps/api/prisma/migrations/20260830120000_add_user_restore_credentials/migration.sql`

**Interfaces:**
- Produces: Prisma model `RestoreCredential`, accessible as
  `prisma.restoreCredential`, with fields
  `{ id, userId, credentialId, publicKey: Buffer, counter, transports: string[], createdAt, lastUsedAt }`.

- [ ] **Step 1: Add the model to the schema**

Append near the other auth-adjacent models in `apps/api/prisma/schema.prisma`:

```prisma
/// An Android Restore Credential (a WebAuthn public-key credential managed by
/// the system restore service). Several rows per user on purpose: a unique on
/// userId would let a second device's registration overwrite the first, and a
/// restore from the older backup would then fail against a public key we no
/// longer hold. Nothing here is secret — a public key and a credential id are
/// safe at rest — so no encryption tier applies.
model RestoreCredential {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  credentialId String    @unique @map("credential_id")
  publicKey    Bytes     @map("public_key")
  counter      Int       @default(0)
  transports   String[]  @default([])
  createdAt    DateTime  @default(now()) @map("created_at")
  lastUsedAt   DateTime? @map("last_used_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("user_restore_credentials")
}
```

- [ ] **Step 2: Add the relation to `User`**

In `model User`, directly after the existing line:

```prisma
  paymentMethods        UserPaymentMethod[]
```

add:

```prisma
  restoreCredentials    RestoreCredential[]
```

- [ ] **Step 3: Write the migration SQL by hand**

Create `apps/api/prisma/migrations/20260830120000_add_user_restore_credentials/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "user_restore_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "user_restore_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_restore_credentials_credential_id_key" ON "user_restore_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "user_restore_credentials_user_id_idx" ON "user_restore_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "user_restore_credentials" ADD CONSTRAINT "user_restore_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify the schema parses and the client regenerates**

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and a successful
generate. Do **not** run `prisma migrate dev` — there is no local database.

- [ ] **Step 5: Verify the SQL matches the schema**

Run: `cd apps/api && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`
Expected: exit code 0 (no drift). If no shadow database is available, skip this
step and instead re-read the SQL against the model field by field — column
names, the `BYTEA` type, the unique on `credential_id`, and the cascade.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "ABA-464 Add user_restore_credentials table"
```

---

### Task 3: Make session issuance reusable in `AuthService`

The restore login must return exactly what `/auth/login` and `/auth/google`
return. `generateTokens` is private and the response object is assembled inline
inside `googleLogin`, so without this task the next task would copy it — and a
copy is how two login routes start returning different user blocks.

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `apps/api/src/modules/auth/auth.service.spec.ts` (extend)

**Interfaces:**
- Produces: `AuthService.buildAuthResponse(user: User, overrideDefaultAccountId?: string)`
  → `{ accessToken: string; refreshToken: string; user: {...}; accounts: Account[] }`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/auth/auth.service.spec.ts`, following the mocking
style already used in that file:

```typescript
describe('buildAuthResponse', () => {
  it('returns tokens, the user block and the account list', async () => {
    const user = makeUser({ id: 'u1', email: 'a@b.c', isVerified: true });
    accountsService.findAllForUser.mockResolvedValue([{ id: 'acc1' }]);

    const res = await service.buildAuthResponse(user as any);

    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.refreshToken).toEqual(expect.any(String));
    expect(res.user.id).toBe('u1');
    expect(res.user.isVerified).toBe(true);
    expect(res.accounts).toEqual([{ id: 'acc1' }]);
  });

  it('prefers an explicit default account id over the stored one', async () => {
    const user = makeUser({ id: 'u1', defaultAccountId: null });
    accountsService.findAllForUser.mockResolvedValue([]);

    const res = await service.buildAuthResponse(user as any, 'fresh-acc');

    expect(res.user.defaultAccountId).toBe('fresh-acc');
  });
});
```

If `makeUser` does not already exist in that spec, build the object inline from
whatever shape the neighbouring `googleLogin` tests use — do not invent fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts -t buildAuthResponse`
Expected: FAIL — `service.buildAuthResponse is not a function`.

- [ ] **Step 3: Extract the method**

Add to `AuthService`:

```typescript
  /**
   * The single place a signed-in session is assembled. `googleLogin` and the
   * restore-credential login both return this, so the two cannot drift into
   * reporting different user blocks for the same account.
   */
  async buildAuthResponse(user: User, overrideDefaultAccountId?: string) {
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
        defaultAccountId: user.defaultAccountId || overrideDefaultAccountId,
        isVerified: user.isVerified,
        themeMode: user.themeMode,
        accentColor: user.accentColor,
        paymentMethod: user.paymentMethod,
        paymentHandle: user.paymentHandle,
      },
      accounts,
    };
  }
```

Then replace the tail of `googleLogin` (from `const tokens = await this.generateTokens(...)`
through its `return { ... };`) with:

```typescript
    return this.buildAuthResponse(user, createdAccountId);
```

Note: `googleLogin` previously hardcoded `isVerified: true`. Every path through
it sets or requires `user.isVerified === true`, so reading it off the user is
equivalent — Step 4 proves that rather than assuming it.

- [ ] **Step 4: Run the whole auth suite to verify nothing changed**

Run: `cd apps/api && npx jest src/modules/auth`
Expected: PASS, including every pre-existing `googleLogin` test untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/
git commit -m "ABA-464 Extract reusable session assembly in AuthService"
```

---

### Task 4: Registration ceremony

**Files:**
- Create: `apps/api/src/modules/restore-credentials/restore-credentials.service.ts`
- Test: `apps/api/src/modules/restore-credentials/restore-credentials.service.spec.ts`

**Interfaces:**
- Consumes: `resolveRestoreCredentialConfig` (Task 1); `prisma.restoreCredential` (Task 2).
- Produces:
  - `RestoreCredentialsService.getRegistrationOptions(userId: string, email: string): Promise<PublicKeyCredentialCreationOptionsJSON>`
  - `RestoreCredentialsService.verifyRegistration(userId: string, response: RegistrationResponseJSON): Promise<{ ok: true }>`
  - `RestoreCredentialsService.deleteForUser(userId: string): Promise<void>`
  - Redis keys: `restorecred:reg:{userId}`, TTL `CHALLENGE_TTL_SEC = 300`

- [ ] **Step 1: Install the dependency**

Run: `cd apps/api && npm install @simplewebauthn/server@13.3.3`
Verify it resolved under CommonJS: `node -e "console.log(typeof require('@simplewebauthn/server').generateRegistrationOptions)"`
Expected: `function`.

- [ ] **Step 2: Write the failing test**

```typescript
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { UnauthorizedException } from '@nestjs/common';

// The library's own signature verification is its concern and is well tested
// upstream; what we own is the challenge lifecycle and what we persist.
describe('RestoreCredentialsService — registration', () => {
  it('caches the issued challenge under the user key', async () => {
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-1' });

    await service.getRegistrationOptions('u1', 'a@b.c');

    expect(cache.set).toHaveBeenCalledWith('restorecred:reg:u1', 'chal-1', 300);
  });

  it('stores the credential when verification succeeds', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
      },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(prisma.restoreCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        credentialId: 'cred-1',
        counter: 0,
      }),
    });
    expect(cache.del).toHaveBeenCalledWith('restorecred:reg:u1');
  });

  it('rejects when no challenge was issued', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('rejects and stores nothing when the library says unverified', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({ verified: false });

    await expect(service.verifyRegistration('u1', {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.restoreCredential.create).not.toHaveBeenCalled();
  });

  it('passes both the rp id and every expected origin to the verifier', async () => {
    (cache.get as jest.Mock).mockResolvedValue('chal-1');
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: 'c', publicKey: new Uint8Array(), counter: 0 } },
    });

    await service.verifyRegistration('u1', {} as any);

    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'chal-1',
        expectedRPID: 'ai-budget.pl',
        expectedOrigin: expect.arrayContaining([expect.stringContaining('android:apk-key-hash:')]),
      }),
    );
  });
});
```

Build the testing module with `PrismaService`, `CacheService` and `AuthService`
provided as `jest.fn()`-backed doubles, matching the style of
`apps/api/src/modules/*/**.service.spec.ts` already in the repo. Set
`process.env.RESTORE_CREDENTIAL_CERT_FINGERPRINTS` to the Task 1 test
fingerprint in `beforeEach`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/restore-credentials/restore-credentials.service.spec.ts`
Expected: FAIL — module not found / `service.getRegistrationOptions is not a function`.

- [ ] **Step 4: Implement the registration half**

```typescript
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthService } from '../auth/auth.service';
import {
  resolveRestoreCredentialConfig,
  type RestoreCredentialConfig,
} from './restore-credential.config';

const CHALLENGE_TTL_SEC = 300;
const regKey = (userId: string) => `restorecred:reg:${userId}`;

@Injectable()
export class RestoreCredentialsService {
  private readonly logger = new Logger(RestoreCredentialsService.name);
  private readonly config: RestoreCredentialConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly auth: AuthService,
  ) {
    this.config = resolveRestoreCredentialConfig(process.env);
  }

  async getRegistrationOptions(userId: string, email: string) {
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: Buffer.from(userId, 'utf8'),
      userName: email,
      // Trust comes from the origin <-> assetlinks binding, not from the
      // provenance of a system-managed authenticator.
      attestationType: 'none',
      // There is no human present during a restore, so demanding user
      // verification would make the credential unusable for its only purpose.
      authenticatorSelection: { residentKey: 'required', userVerification: 'discouraged' },
      supportedAlgorithmIDs: [-7, -257],
    });

    await this.cache.set(regKey(userId), options.challenge, CHALLENGE_TTL_SEC);
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON) {
    const expectedChallenge = await this.cache.get<string>(regKey(userId));
    if (!expectedChallenge) {
      throw new UnauthorizedException('No pending restore-credential registration');
    }

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.config.expectedOrigins,
      expectedRPID: this.config.rpId,
      requireUserVerification: false,
    });

    if (!result.verified || !result.registrationInfo) {
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const { credential } = result.registrationInfo;
    await this.prisma.restoreCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
      },
    });

    await this.cache.del(regKey(userId));
    return { ok: true as const };
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.prisma.restoreCredential.deleteMany({ where: { userId } });
  }
}
```

If `result.registrationInfo.credential` type-errors, the installed major nests
these fields differently — check
`apps/api/node_modules/@simplewebauthn/server/esm/index.d.ts` for the
`VerifiedRegistrationResponse` shape and adjust the destructuring only.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/restore-credentials/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/restore-credentials/ apps/api/package.json package-lock.json
git commit -m "ABA-464 Add restore-credential registration ceremony"
```

---

### Task 5: Authentication ceremony

**Files:**
- Modify: `apps/api/src/modules/restore-credentials/restore-credentials.service.ts`
- Test: `apps/api/src/modules/restore-credentials/restore-credentials.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `AuthService.buildAuthResponse` (Task 3).
- Produces:
  - `getAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON>`
  - `verifyAuthentication(response: AuthenticationResponseJSON)` → the same
    object `AuthService.buildAuthResponse` returns
  - Redis key: `restorecred:auth:{challenge}`

- [ ] **Step 1: Write the failing test**

```typescript
describe('RestoreCredentialsService — authentication', () => {
  const assertion = (challenge: string) => ({
    id: 'cred-1',
    response: {
      clientDataJSON: Buffer.from(JSON.stringify({ challenge })).toString('base64url'),
    },
  }) as any;

  beforeEach(() => {
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1',
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', isActive: true });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    });
  });

  it('caches the issued challenge keyed by the challenge itself', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'chal-9' });

    await service.getAuthenticationOptions();

    expect(cache.set).toHaveBeenCalledWith('restorecred:auth:chal-9', '1', 300);
  });

  it('returns a full session for the credential owner', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const res = await service.verifyAuthentication(assertion('chal-9'));

    expect(auth.buildAuthResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
    );
    expect(res.accessToken).toBe('a');
  });

  // The challenge is consumed before verification, so a replay cannot race a
  // slow signature check.
  it('consumes the challenge so the same assertion cannot be replayed', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({});

    await service.verifyAuthentication(assertion('chal-9'));

    expect(cache.del).toHaveBeenCalledWith('restorecred:auth:chal-9');
  });

  it('rejects an assertion whose challenge was never issued', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);

    await expect(service.verifyAuthentication(assertion('forged'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A system-managed restore key may legitimately always report 0. Demanding a
  // strictly increasing counter would lock out every user on every device.
  it('accepts a sign count of zero', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    auth.buildAuthResponse.mockResolvedValue({});

    await expect(service.verifyAuthentication(assertion('chal-9'))).resolves.toBeDefined();
  });

  it('rejects a counter that goes backwards from a non-zero value', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue({
      id: 'row1', userId: 'u1', credentialId: 'cred-1',
      publicKey: Buffer.from([1]), counter: 5, transports: [],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown credential without a 500', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    prisma.restoreCredential.findUnique.mockResolvedValue(null);

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a deactivated account', async () => {
    (cache.get as jest.Mock).mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', isActive: false });

    await expect(service.verifyAuthentication(assertion('chal-9'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.buildAuthResponse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/restore-credentials/ -t authentication`
Expected: FAIL — `service.getAuthenticationOptions is not a function`.

- [ ] **Step 3: Implement the authentication half**

Add to `RestoreCredentialsService` (and extend the imports with
`generateAuthenticationOptions`, `verifyAuthenticationResponse`, and the types
`AuthenticationResponseJSON` and `AuthenticatorTransportFuture`):

```typescript
const authKey = (challenge: string) => `restorecred:auth:${challenge}`;

  async getAuthenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      // Empty on purpose: the caller has no session yet, so we cannot know
      // which credentials to allow. The credential id in the assertion tells us.
      allowCredentials: [],
      userVerification: 'discouraged',
    });

    await this.cache.set(authKey(options.challenge), '1', CHALLENGE_TTL_SEC);
    return options;
  }

  async verifyAuthentication(response: AuthenticationResponseJSON) {
    const challenge = this.readChallenge(response);
    const issued = await this.cache.get<string>(authKey(challenge));
    if (!issued) {
      throw new UnauthorizedException('Unknown or expired restore challenge');
    }
    // Consume before verifying so a replay cannot race a slow signature check.
    await this.cache.del(authKey(challenge));

    const stored = await this.prisma.restoreCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!stored) {
      throw new UnauthorizedException('Unknown restore credential');
    }

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.config.expectedOrigins,
      expectedRPID: this.config.rpId,
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!result.verified) {
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const newCounter = result.authenticationInfo.newCounter;
    // A system-managed restore key may always report 0; only a genuine
    // regression from a previously non-zero counter is evidence of cloning.
    if (stored.counter > 0 && newCounter > 0 && newCounter <= stored.counter) {
      this.logger.warn(
        `Restore credential ${stored.id} replayed a counter (${newCounter} <= ${stored.counter})`,
      );
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Unknown restore credential');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.restoreCredential.update({
      where: { id: stored.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    return this.auth.buildAuthResponse(user);
  }

  /**
   * The assertion carries its own challenge inside clientDataJSON. Reading it
   * is not trusting it: it is only a lookup key, and an assertion whose
   * challenge we never issued (or already consumed) finds nothing in Redis.
   */
  private readChallenge(response: AuthenticationResponseJSON): string {
    try {
      const json = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8');
      const challenge = JSON.parse(json).challenge;
      if (typeof challenge !== 'string' || !challenge) throw new Error('missing challenge');
      return challenge;
    } catch {
      throw new UnauthorizedException('Malformed restore assertion');
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/restore-credentials/`
Expected: PASS, all registration and authentication cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/restore-credentials/
git commit -m "ABA-464 Add restore-credential authentication ceremony"
```

---

### Task 6: Controllers, DTOs and module wiring

**Files:**
- Create: `apps/api/src/modules/restore-credentials/dto/index.ts`
- Create: `apps/api/src/modules/restore-credentials/restore-credential-registration.controller.ts`
- Create: `apps/api/src/modules/restore-credentials/restore-credential-auth.controller.ts`
- Create: `apps/api/src/modules/restore-credentials/restore-credentials.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/restore-credentials/restore-credential-auth.controller.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: routes `GET /auth/restore/register/options`, `POST /auth/restore/register`,
  `DELETE /auth/restore` (all JWT-guarded); `GET /auth/restore/options`,
  `POST /auth/restore` (both public, throttled).

- [ ] **Step 1: Write the failing guard test**

The single most damaging thing to get wrong here is guard placement, so it is
pinned by reflection rather than by reading the file.

```typescript
import { RestoreCredentialAuthController } from './restore-credential-auth.controller';
import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('restore-credential controller guards', () => {
  it('leaves the authentication controller public', () => {
    const guards = Reflect.getMetadata('__guards__', RestoreCredentialAuthController) || [];
    expect(guards).not.toContain(JwtAuthGuard);
  });

  it('guards the registration controller with JWT', () => {
    const guards = Reflect.getMetadata('__guards__', RestoreCredentialRegistrationController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });
});
```

Adjust the guard-import path to match the repo (`grep -rn "JwtAuthGuard" apps/api/src/modules/auth`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/restore-credentials/restore-credential-auth.controller.spec.ts`
Expected: FAIL — controllers not found.

- [ ] **Step 3: Write the DTOs**

`dto/index.ts` — local `class-validator` classes, following the repo convention
of not validating against a bare shared-types interface:

```typescript
import { IsObject, IsNotEmpty } from 'class-validator';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

export class VerifyRestoreRegistrationDto {
  @IsObject()
  @IsNotEmpty()
  response!: RegistrationResponseJSON;
}

export class VerifyRestoreAuthenticationDto {
  @IsObject()
  @IsNotEmpty()
  response!: AuthenticationResponseJSON;
}
```

- [ ] **Step 4: Write the two controllers**

`restore-credential-registration.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';
import { RestoreCredentialsService } from './restore-credentials.service';
import { VerifyRestoreRegistrationDto } from './dto';

@Controller('auth/restore')
@UseGuards(JwtAuthGuard)
export class RestoreCredentialRegistrationController {
  constructor(private readonly service: RestoreCredentialsService) {}

  @Get('register/options')
  getOptions(@Req() req: AuthenticatedRequest) {
    return this.service.getRegistrationOptions(req.user.id, req.user.email);
  }

  @Post('register')
  register(@Req() req: AuthenticatedRequest, @Body() dto: VerifyRestoreRegistrationDto) {
    return this.service.verifyRegistration(req.user.id, dto.response);
  }

  @Delete()
  remove(@Req() req: AuthenticatedRequest) {
    return this.service.deleteForUser(req.user.id);
  }
}
```

`restore-credential-auth.controller.ts` — **no class-level guard, by design**:

```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RestoreCredentialsService } from './restore-credentials.service';
import { VerifyRestoreAuthenticationDto } from './dto';

/**
 * Deliberately a separate controller from the registration one: this ceremony
 * cannot be authenticated — the caller is a freshly restored device with no
 * token — so keeping it apart means a public route can never inherit a guard
 * and, far worse, a guarded route can never quietly lose one.
 */
@Controller('auth/restore')
export class RestoreCredentialAuthController {
  constructor(private readonly service: RestoreCredentialsService) {}

  @Get('options')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getOptions() {
    return this.service.getAuthenticationOptions();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: VerifyRestoreAuthenticationDto) {
    return this.service.verifyAuthentication(dto.response);
  }
}
```

Check `AuthenticatedRequest`'s actual user field before writing (`grep -n "AuthenticatedRequest" -A6 apps/api/src/common/types/index.ts`) — use `req.user.id`/`req.user.email` only if that is what it declares.

- [ ] **Step 5: Write the module and register it**

`restore-credentials.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RestoreCredentialsService } from './restore-credentials.service';
import { RestoreCredentialAuthController } from './restore-credential-auth.controller';
import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';

@Module({
  imports: [AuthModule],
  controllers: [RestoreCredentialRegistrationController, RestoreCredentialAuthController],
  providers: [RestoreCredentialsService],
  exports: [RestoreCredentialsService],
})
export class RestoreCredentialsModule {}
```

Add `RestoreCredentialsModule` to the `imports` array in
`apps/api/src/app.module.ts`, beside the other feature modules.

- [ ] **Step 6: Run the tests and boot the app**

Run: `cd apps/api && npx jest src/modules/restore-credentials/ && npx tsc --noEmit`
Expected: PASS and a clean typecheck.

Then confirm the routes register and the guards landed where intended:
Run: `cd apps/api && RESTORE_CREDENTIAL_CERT_FINGERPRINTS=$(printf 'AB%.0s' {1..32}) npm run start:dev`
Expected: startup log lines mapping `{/api/v1/auth/restore/register/options, GET}`,
`{/api/v1/auth/restore/register, POST}`, `{/api/v1/auth/restore, DELETE}`,
`{/api/v1/auth/restore/options, GET}` and `{/api/v1/auth/restore, POST}`. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/restore-credentials/ apps/api/src/app.module.ts
git commit -m "ABA-464 Expose restore-credential ceremonies over HTTP"
```

---

### Task 7: Publish `assetlinks.json` on the apex

Without this file Credential Manager will refuse to mint a credential for
`rp.id = ai-budget.pl` and stage 2 fails with an opaque client-side error.

**Files:**
- Create: `docs/ops/assetlinks.json`
- Modify: `.github/workflows/web-deploy.yml:60-70` (the "Assemble apex tree" step)
- Create: `docs/ops/restore-credentials-rollout.md`

**Interfaces:**
- Produces: `https://ai-budget.pl/.well-known/assetlinks.json`, served as
  `application/json`.

Note on placement: `docs/marketing/*` is gitignored with narrow negations for
`seo/` and `landing/` only, so a file added under `docs/marketing/well-known/`
would silently never be committed and the deploy would fail its own existence
check. `docs/ops/` is not ignored and is where the other runbooks live.

- [ ] **Step 1: Get the two fingerprints**

Debug: `cd apps/mobile/android && ./gradlew signingReport` — take the `SHA-256`
line under `Variant: debug` (Gradle brings its own JDK; `keytool` is not on
PATH on this workstation).

Release: Play Console → the app → Test and release → Setup → App signing →
"App signing key certificate" → SHA-256. **This must be the app signing key,
not the upload key** — Play re-signs the AAB, so the upload key's fingerprint is
not what ends up on the device.

- [ ] **Step 2: Write `docs/ops/assetlinks.json`**

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.budget.assistant",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_PLAY_APP_SIGNING_SHA256",
        "REPLACE_WITH_DEBUG_KEYSTORE_SHA256"
      ]
    }
  }
]
```

Both entries must be the colon-separated uppercase hex form. The same two
fingerprints go into `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` in
`.env.production`, comma-separated, and the API converts them to base64url
origins itself (Task 1).

- [ ] **Step 3: Wire it into the apex tree**

In `.github/workflows/web-deploy.yml`, inside the "Assemble apex tree" step,
after the `cp -r docs/marketing/help/site/help apex/help` line, add:

```bash
          mkdir -p apex/.well-known
          cp docs/ops/assetlinks.json apex/.well-known/assetlinks.json
```

and add to the existing block of `test -f` guards:

```bash
          test -f apex/.well-known/assetlinks.json || { echo "::error::assetlinks.json missing"; exit 1; }
```

- [ ] **Step 4: Commit**

```bash
git add docs/ops/assetlinks.json .github/workflows/web-deploy.yml
git commit -m "ABA-464 Publish assetlinks.json for Android restore credentials"
```

- [ ] **Step 5: Verify it is actually reachable after deploy**

Once the workflow has run:

```bash
curl -sS -D- -o/dev/null https://ai-budget.pl/.well-known/assetlinks.json
curl -sS https://ai-budget.pl/.well-known/assetlinks.json | head
```

Expected: `200` with `Content-Type: application/json`, and the JSON body.

A `403` or `404` here means nginx is refusing dotfile paths — several stock
configs carry a `location ~ /\. { deny all; }` rule. Check
`/opt/ai-budget-web/default.conf` on the VPS and, if such a rule exists, add an
exception for `/.well-known/` **above** it. Do not skip this check: everything
in stage 2 depends on this URL resolving, and the failure it causes surfaces as
an unrelated-looking client error.

- [ ] **Step 6: Write the rollout note**

Create `docs/ops/restore-credentials-rollout.md` covering: the two env vars and
where their values come from, the fact that both must be set before the module
can start, the curl check above, the nginx dotfile caveat, and that rotating the
Play App Signing key means updating both `assetlinks.json` and
`RESTORE_CREDENTIAL_CERT_FINGERPRINTS` together — a mismatch between them
silently breaks sign-in on new devices only, which is the hardest kind of
breakage to notice. Follow the shape of `docs/ops/receipt-split-rollout.md`.

- [ ] **Step 7: Commit**

```bash
git add docs/ops/restore-credentials-rollout.md
git commit -m "ABA-464 Add restore-credentials rollout runbook"
```

---

### Task 8: Close out the stage

- [ ] **Step 1: Run the full API suite**

Run: `cd apps/api && npx jest && npx tsc --noEmit && npm run lint`
Expected: all green. Investigate any failure rather than re-running.

- [ ] **Step 2: Verify the deploy guard still passes**

Run: `bash scripts/check-no-shared-utils-runtime-import.sh`
Expected: exit 0.

- [ ] **Step 3: Update `CLAUDE.md`**

Add one bullet in the API section describing the module: the two controllers and
why they are split, the Redis challenge keys and their single-use consumption,
the several-rows-per-user decision, the `signCount: 0` rule, the two encodings of
the fingerprint, and that `assetlinks.json` ships via `web-deploy.yml`. Keep the
terse pattern-reference style of the surrounding entries.

- [ ] **Step 4: Create the issue**

Follow the `finish-aba-task` skill: `gh issue list --limit 200 --state all` to
find the highest existing `ABA-N` in the titles, add 1, and open an English
issue with Problem / Implementation / Out of scope sections. This plan's commit
messages assume **ABA-464**; if the number has moved on, reword them before
pushing.

- [ ] **Step 5: Note what is not proven**

State plainly in the issue that stage 1 is proven correct but not proven
sufficient — no restore credential has ever been created or consumed by a real
device, and it cannot be until stage 2 plus a real device-to-device transfer or
cloud-backup restore.

---

## Self-review notes

- **Spec coverage.** Data → Task 2. API surface (all five routes) → Task 6.
  Trust chain and both encodings → Tasks 1 and 7. Ceremonies → Tasks 4 and 5.
  Every edge case listed in the spec has a named test in Task 4 or 5, except
  the two that are not server behaviour (E2EE passphrase re-entry, biometric
  absence) and one that needs no code (multi-profile). `attestation: 'none'`
  → Task 4 Step 4. Redis challenge TTL and single use → Tasks 4 and 5.
- **User docs.** None. Stage 1 ships no user-visible behaviour; the feature
  becomes visible only in stage 2, and `user_docs` should be written then.
- **Deliberate deviation from the spec.** The spec's testing section originally
  proposed using `@simplewebauthn/server`'s own vectors; they are not exported
  from the npm package, so the library is mocked and only our orchestration is
  tested. The spec has been updated to say so.
