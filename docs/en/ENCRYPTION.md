# End-to-End Encryption (E2EE)

## Overview

End-to-End Encryption ensures that sensitive financial data (descriptions, notes, names) is encrypted on the user's device before being sent to the server. The server stores only encrypted blobs and cannot read the content. This protects user data even if the server database is compromised.

## User Guide

### Setting Up Encryption

1. Open **Settings** in the app
2. Scroll to the **Security** section
3. Tap **Enable Encryption**
4. Enter an **encryption passphrase** (minimum 8 characters)
   - This is separate from your login password
   - The server never sees this passphrase
5. Confirm the passphrase
6. **Save the Recovery Key** that appears on screen
   - Format: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`
   - Store it offline (write it down, save in a password manager)
   - This is the only way to recover your data if you forget the passphrase

### Unlocking Encryption

After app restart or session expiry, encryption is locked. To unlock:

1. Open **Settings** > **Security**
2. Tap **Unlock Encryption**
3. Enter your encryption passphrase
4. Encrypted data becomes readable again

### What Gets Encrypted

| Tier | Encrypted Fields | Server Features |
|------|-----------------|-----------------|
| **Tier 1** (default) | descriptions, notes, names, locations, receipts | Analytics, budgets, AI insights work normally |
| **Tier 2** (opt-in) | Everything in Tier 1 + amounts, prices, exchange rates | Server analytics unavailable; computed locally |

### Recovery

If you forget your passphrase:

1. Open **Settings** > **Security** > **Recover**
2. Enter your Recovery Key
3. Set a new passphrase
4. A new Recovery Key is generated (save it again)

### Resetting Encryption

If you lose both passphrase and recovery key:

1. Open **Settings** > **Security**
2. Tap **Reset Encryption** (red button)
3. Confirm the action
4. **Warning**: Previously encrypted data on the server becomes permanently unreadable
5. You can set up encryption again with a new passphrase

### Shared Accounts

When a shared account has encryption enabled:

- The account owner must **grant encryption keys** to each member
- New members can see metadata (amounts, dates, categories) but cannot read encrypted text fields until the owner grants access
- Key grant happens automatically when the owner opens the app and approves pending members

---

## Technical Documentation

### Cryptographic Primitives

| Purpose | Algorithm | Library | Platform |
|---------|-----------|---------|----------|
| Symmetric encryption | XSalsa20-Poly1305 (NaCl secretbox) | tweetnacl | All |
| Key derivation | PBKDF2-HMAC-SHA256, 100K iterations | Pure JS (custom) | All |
| SHA-256 hashing | SHA-256 | Pure JS (custom) | All |
| Key exchange (ECDH) | X25519 | tweetnacl | All |
| Digital signatures | Ed25519 | tweetnacl | All |
| Random bytes | `ExpoCrypto.getRandomBytes` / `crypto.getRandomValues` | expo-crypto / Web Crypto | Native / Web |

**Why pure JS SHA-256?** PBKDF2 with 100K iterations requires ~200K SHA-256 calls. Using `expo-crypto.digest()` would create 200K async native bridge crossings on React Native (Hermes), causing the app to hang. The pure JS implementation runs synchronously in the JS thread (~1-2 seconds).

**Why NaCl secretbox instead of AES-GCM?** React Native on Hermes does not have `crypto.subtle`. NaCl secretbox (XSalsa20-Poly1305) provides equivalent authenticated encryption via tweetnacl (pure JS, zero native deps).

### Key Hierarchy

```
User encryption passphrase (NOT the login password)
     | PBKDF2 (random salt, 100K iterations)
     v
Master Key (MK) -- 256-bit, never leaves device memory
     |
     |---> Wraps Account Key 1 (AK1) -- per-account symmetric key
     |       |---> Encrypts all data for Account 1
     |
     |---> Wraps Account Key 2 (AK2)
     |       |---> Encrypts all data for Account 2
     |
     |---> Wraps Identity Key Pair (X25519 + Ed25519)
             |---> Private keys for receiving AK from shared account owner
             |---> Public keys published to the server
```

### Key Storage

| Platform | Storage | Security |
|----------|---------|----------|
| iOS | Keychain via expo-secure-store | Hardware-backed |
| Android | EncryptedSharedPreferences via expo-secure-store | Hardware-backed |
| Web | localStorage + PBKDF2 from passphrase | Passphrase required each session |

Account keys are cached locally in SQLite (`encryption_keys` table), wrapped with the Master Key. They are only usable after unlocking with the passphrase.

### Encrypted Data Format

Each entity carries an `encryptedPayload` column (TEXT) containing a JSON blob:

```json
{
  "v": 1,
  "kv": 1,
  "fields": {
    "description": { "iv": "base64...", "ct": "base64...", "tag": "base64..." },
    "notes": { "iv": "base64...", "ct": "base64...", "tag": "base64..." }
  }
}
```

- `v` -- encryption format version
- `kv` -- account key version (for key rotation)
- Each field has its own random 24-byte nonce (`iv`), ciphertext (`ct`), and 16-byte Poly1305 tag (`tag`)
- Original plaintext columns are set to `NULL` (text) or `0` (numeric) when encrypted

### Encrypted Fields by Entity

| Entity | Tier 1 (text fields) | Tier 2 (additionally) |
|--------|---------------------|----------------------|
| Expense | description, notes, locationName, receiptUrl | amount, discountAmount |
| ExpenseItem | description | unitPrice, totalPrice |
| Income | description, notes | amount |
| Budget | name | amount |
| Category | name | -- |
| Tag | name | -- |
| Project | name, description | budget |
| CurrencyExchange | notes | fromAmount, toAmount, exchangeRate |
| ExpenseCategorySplit | notes | amount, percentage |
| WalletBalance | -- | initialAmount |

Configuration: `packages/shared-utils/src/constants/index.ts` -> `ENCRYPTION_FIELDS`

### Architecture

#### Files

**Mobile (client-side encryption/decryption)**

| File | Purpose |
|------|---------|
| `src/services/crypto.native.ts` | Crypto primitives for iOS/Android (Hermes) |
| `src/services/crypto.web.ts` | Crypto primitives for web (crypto.subtle + fallback) |
| `src/services/crypto.ts` | Barrel re-export (Metro resolves `.native.ts` on mobile) |
| `src/services/encryptionMiddleware.ts` | `encryptForSync()` / `decryptFromSync()` -- field-level encrypt/decrypt |
| `src/services/encryptionHelper.ts` | `maybeEncrypt()` / `maybeDecrypt()` -- tier-aware wrappers for stores |
| `src/stores/encryptionStore.ts` | Zustand store: setup, unlock, lock, enable, grant, rotate, recover, reset |
| `src/db/encryptionRepository.ts` | SQLite CRUD for local account key cache |
| `src/db/schema/index.ts` | `encryption_keys` table definition (Drizzle) |
| `src/db/client.native.ts` | `CREATE TABLE IF NOT EXISTS encryption_keys` in `initializeDatabase()` |

**Server (key management, passthrough)**

| File | Purpose |
|------|---------|
| `modules/encryption/encryption.module.ts` | NestJS module |
| `modules/encryption/encryption.controller.ts` | REST endpoints |
| `modules/encryption/encryption.service.ts` | Business logic: setup, profile, enable, grant, rotate, recover, reset |
| `modules/encryption/dto/index.ts` | Validation DTOs |

**Shared**

| File | Purpose |
|------|---------|
| `packages/shared-types/src/dto/index.ts` | TypeScript interfaces for encryption DTOs |
| `packages/shared-utils/src/constants/index.ts` | `ENCRYPTION_CONFIG`, `ENCRYPTION_FIELDS` |

#### Database Schema

**PostgreSQL (server)**

```prisma
model UserEncryptionProfile {
  id                         String   @id @default(uuid())
  userId                     String   @unique
  pbkdf2Salt                 String   // Base64-encoded 32-byte salt
  publicKeyX25519            String   // Base64-encoded public key
  publicKeyEd25519           String   // Base64-encoded public key
  wrappedPrivateKeyX25519    String   // Private key encrypted with MK
  wrappedPrivateKeyEd25519   String   // Private key encrypted with MK
  recoveryKeyHash            String?  // bcrypt hash of recovery key
  wrappedMasterKeyByRecovery String?  // MK encrypted with recovery key
  keyVersion                 Int      @default(1)
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt
}

model AccountEncryptionKey {
  id                String   @id @default(uuid())
  accountId         String
  userId            String
  wrappedAccountKey String   // AK encrypted with MK or ECDH shared secret
  wrappedBy         String   // userId of the person who wrapped
  wrappingMethod    String   // 'master_key' | 'ecdh'
  keyVersion        Int      @default(1)
  @@unique([accountId, userId])
}

// Added to Account model:
// encryptionEnabled  Boolean @default(false)
// encryptionTier     Int     @default(0)   // 0=off, 1=text, 2=full
// keyRotationNeeded  Boolean @default(false)

// Added to all syncable models (Expense, Income, Budget, Category, Tag, Project, etc.):
// encryptedPayload      String?
// encryptionKeyVersion  Int?
```

**SQLite (mobile, local cache)**

```sql
CREATE TABLE IF NOT EXISTS encryption_keys (
  account_id  TEXT PRIMARY KEY,
  account_key TEXT NOT NULL,    -- AK wrapped with MK (Base64)
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL
);
```

### API Endpoints

All endpoints require `Authorization: Bearer <jwt>` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/encryption/setup` | POST | Create/update encryption profile (salt, public keys, wrapped private keys) |
| `/encryption/profile` | GET | Fetch encryption profile (for login from new device) |
| `/encryption/profile` | DELETE | Reset encryption profile (deletes all encryption data) |
| `/encryption/account/:id/enable` | POST | Enable E2EE for account (tier + wrapped AK). Requires `owner` role |
| `/encryption/account/:id/key` | GET | Fetch wrapped AK for current user |
| `/encryption/account/:id/status` | GET | Get account encryption status (tier, keyVersion, rotationNeeded) |
| `/encryption/account/:id/grant-key` | POST | Grant AK to new member (ECDH-wrapped). Requires `owner` role |
| `/encryption/account/:id/pending-grants` | GET | List members awaiting key grant |
| `/encryption/account/:id/rotate-key` | POST | Key rotation (new wrapped keys for all members). Requires `owner` role |
| `/encryption/account/:id/member-keys` | GET | Get all members' public X25519 keys |
| `/encryption/recovery/setup` | POST | Set up recovery key (server stores bcrypt hash + wrapped MK) |
| `/encryption/recovery/recover` | POST | Recover access with recovery key |

### Data Flows

#### Setup Flow

```
Client                                    Server
  |                                         |
  |  1. Generate salt, derive MK            |
  |  2. Generate X25519 + Ed25519 keys      |
  |  3. Wrap private keys with MK           |
  |  4. Generate recovery key               |
  |  5. Wrap MK with recovery key           |
  |                                         |
  |  POST /encryption/setup  ------------->  |  Store profile (upsert)
  |  POST /encryption/recovery/setup ---->  |  Store bcrypt(recoveryKey) + wrappedMK
  |                                         |
  |  6. Generate Account Key (AK)           |
  |  7. Wrap AK with MK                     |
  |                                         |
  |  POST /encryption/account/:id/enable -> |  Store wrappedAK, set tier
  |                                         |
  |  8. Cache wrapped AK in SQLite          |
  |  9. Store AK in memory                  |
  |                                         |
```

#### Encrypt-on-Sync Flow

```
addExpense() --> maybeEncrypt('expense', data, accountId)
  |
  |--> Check isUnlocked? --> no --> return plain data
  |--> Check getAccountKey(accountId)? --> null --> return plain data
  |--> Check getAccountEncryptionTier(accountId)? --> 0 --> return plain data
  |
  |--> encryptForSync('expense', data, accountKey, tier, keyVersion)
  |      |--> For each field in ENCRYPTION_FIELDS.expense.tier1:
  |      |      |--> encryptField(value, accountKey) --> {iv, ct, tag}
  |      |      |--> Set plainPayload[field] = null
  |      |--> Return { plainPayload, encryptedPayload: JSON string }
  |
  |--> api.createExpense({ ...plainPayload, encryptedPayload })
```

#### Key Distribution for Shared Accounts

```
Owner                           Server                      New Member
  |                               |                            |
  |  1. Get member's public key   |                            |
  |  GET /member-keys ----------> |                            |
  |  <--- publicKeyX25519 ------  |                            |
  |                               |                            |
  |  2. ECDH shared secret        |                            |
  |  owner_x25519_private +       |                            |
  |  member_x25519_public         |                            |
  |  --> sharedSecret             |                            |
  |                               |                            |
  |  3. Wrap AK with shared       |                            |
  |  secret                       |                            |
  |  POST /grant-key -----------> |  Store wrapped AK          |
  |                               |                            |
  |                               |  4. Member fetches key     |
  |                               |  <---- GET /key ---------- |
  |                               |  ---- wrappedAK ---------> |
  |                               |                            |
  |                               |  5. Reverse ECDH           |
  |                               |  member_x25519_private +   |
  |                               |  owner_x25519_public       |
  |                               |  --> same sharedSecret     |
  |                               |  --> unwrap AK             |
```

### Impact on Server-Side Features

| Feature | Tier 0 (off) | Tier 1 (text) | Tier 2 (full) |
|---------|-------------|---------------|---------------|
| Analytics (amounts, charts) | Full | Full | Unavailable (`encryptionRestricted: true`) |
| Budget alerts | Full | Full | Unavailable |
| AI Chat | Full | Partial (amounts only, no descriptions) | Unavailable |
| AI Insights | Full | Partial (notice in prompt: "focus on amounts") | Unavailable |
| AI Story | Full | Partial (descriptions replaced with "Expense") | Unavailable |
| Project suggestion | Full | Unavailable (returns null) | Unavailable |
| Tag suggestion (AI) | Full | Degraded (empty descriptions) | Unavailable |
| Categorization (AI) | Full | Degraded (filters null descriptions) | Unavailable |
| OCR / Voice input | Full | Full (processed before encryption) | Full |
| Sync | Full | Full (passthrough of encryptedPayload) | Full |

### Key Rotation

Triggered when a member is removed from a shared account or key compromise is suspected.

1. Owner generates new AK
2. Wraps new AK for each remaining member via ECDH
3. Uploads all wrapped keys to server
4. Server increments `keyVersion`, clears `keyRotationNeeded` flag
5. Re-encryption of existing data with new AK is a future background process

### Recovery Mechanism

1. During setup, a 256-bit recovery key is generated (displayed as `XXXX-XXXX-...`)
2. `AES-wrap(recovery_key, MK) --> wrapped_MK` stored on server
3. `bcrypt(recovery_key)` stored on server for verification
4. Recovery flow: user enters recovery key --> server verifies via bcrypt --> returns `wrapped_MK` --> client unwraps MK --> user sets new passphrase --> re-wraps everything

### Security Properties

**What the server never sees:**
- Encryption passphrase
- Master Key (MK) in plaintext
- Account Keys (AK) in plaintext
- Decrypted field values (descriptions, notes, names, amounts in Tier 2)
- Recovery key in plaintext (only bcrypt hash)

**What the server stores:**
- PBKDF2 salt (needed for key derivation on new devices)
- Public keys (X25519, Ed25519)
- Wrapped (encrypted) private keys
- Wrapped (encrypted) account keys
- Encrypted payload blobs
- bcrypt hash of recovery key + MK wrapped with recovery key

### Configuration

`packages/shared-utils/src/constants/index.ts`:

```typescript
export const ENCRYPTION_CONFIG = {
  pbkdf2Iterations: 100000,      // OWASP recommends 600K+; 100K is a mobile compromise
  aesKeyLengthBits: 256,         // NaCl secretbox key length
  ivLengthBytes: 12,             // Not used (NaCl uses 24-byte nonce internally)
  saltLengthBytes: 32,           // PBKDF2 salt
  encryptionFormatVersion: 1,    // For future format migrations
  recoveryKeyLengthBytes: 32,    // 256-bit recovery key
  migrationBatchSize: 50,        // For future background data re-encryption
} as const;
```

### Dependencies

- `tweetnacl` (v1.0.3) -- NaCl crypto: secretbox, box (X25519), sign (Ed25519)
- `tweetnacl-util` (v0.15.1) -- Base64/UTF-8 encoding helpers
- `expo-crypto` -- Random bytes on native (Hermes lacks `crypto.getRandomValues`)
- `expo-secure-store` -- Keychain/Keystore access for storing `e2ee_setup` flag
- `bcrypt` (server only) -- Hashing recovery keys

### Testing

Test file: `apps/mobile/src/services/__tests__/crypto.test.ts`

- SHA-256 correctness: verified against known test vectors (empty string, "abc")
- PBKDF2 cross-verification: pure JS output matches `crypto.subtle.deriveBits`
- NaCl secretbox: encrypt/decrypt round-trip
- Key wrapping: wrap/unwrap round-trip
- Encryption middleware: field-level encrypt/decrypt for all entity types
- 26 tests total (19 crypto + 7 middleware)
