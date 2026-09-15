# Play Install Referrer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute Android installs so the 91.7% of signups currently reading "Direct / unknown" resolve to a real source.

**Architecture:** A legacy Old-Arch Kotlin module reads the Play Install Referrer and resolves it to JS. The string it returns is already a query string, so it feeds the existing `parseAcquisition` with no new parsing. The result is cached in MMKV, which keeps `getAcquisition()` synchronous and leaves `auth.api.ts` untouched. Users who registered before this shipped are backfilled through one new PATCH whose write is guarded by an `acquisitionSource IS NULL` filter.

**Tech Stack:** Kotlin (`com.android.installreferrer:installreferrer:2.2`), React Native legacy bridge, `react-native-mmkv`, NestJS + Prisma, Python 3 (static site generators), Jest.

**Spec:** `docs/superpowers/specs/2026-09-15-play-install-referrer-design.md`

## Global Constraints

- **No TurboModule spec, no codegen.** Fabric codegen exceeds the Windows MAX_PATH limit in this repo. The native module is a `ReactContextBaseJavaModule` registered by hand in `MainApplication.kt`'s `getPackages()`.
- **The native promise always resolves, never rejects.** `null` means "not available" — the normal answer on iOS, on a sideloaded build, and on a device without Play Services.
- **`getAcquisition()` stays synchronous** and `auth.api.ts` is not edited in any task.
- **First touch wins.** No task may overwrite an existing acquisition value, client-side or server-side.
- **Fire-and-forget failures use `console.warn`, never `console.error`** (ABA-157). A red LogBox overlay for a failed analytics write is a bug.
- **`loc` vocabulary is the GA4 tracker's `loc()` vocabulary**: `nav`, `hero`, `band`, `pricing_card`, `blog_cta`, `from_blog`, `footer`, `cta`, `body`. If it drifts, the click and the signup report into different buckets.
- **`src` values in use:** `landing`, `blog`, `help`, `referral`. `build_help.py` must keep passing `src="help"`.
- **The raw referrer column is never grouped, indexed, or shown in the admin UI.** It is read by SQL.
- Migrations are authored **DB-free** (`prisma migrate diff`); this repo runs migrations against prod via the deploy migrator and has no local DB.
- Mobile tests: `cd apps/mobile && npx jest <path>`. API tests: `cd apps/api && npx jest <path>`.

---

### Task 1: Carry the raw referrer string to the server

The raw string must ride with the four existing columns on the registration path. The backfill endpoint in Task 2 cannot carry it: a new registration already sets `acquisitionSource`, so Task 2's `acquisitionSource IS NULL` guard would correctly refuse the later PATCH and the raw string would never be stored for the users whose data is freshest.

**Files:**
- Modify: `apps/api/prisma/schema.prisma:272-277`
- Create: `apps/api/prisma/migrations/20260915120000_add_user_acquisition_referrer_raw/migration.sql`
- Modify: `apps/api/src/modules/auth/dto/index.ts:15-39`
- Modify: `apps/api/src/modules/auth/auth.service.ts:86-89` and `:254-257`
- Test: `apps/api/src/modules/auth/dto/acquisition.dto.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `AcquisitionDto.referrerRaw?: string` (optional, max 200 chars, permissive charset) and the Prisma field `User.acquisitionReferrerRaw: string | null`. Tasks 2 and 4 both depend on this field name exactly.

- [ ] **Step 1: Write the failing DTO validation test**

Create `apps/api/src/modules/auth/dto/acquisition.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcquisitionDto } from './index';

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(AcquisitionDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('AcquisitionDto.referrerRaw', () => {
  it('accepts a real Play referrer string, which the 20-char SAFE charset would reject', async () => {
    // Contains `=`, `&` and a dot — none of them allowed in src/loc/lang/plan.
    await expect(
      errorsFor({ referrerRaw: 'utm_source=google-play&utm_medium=organic&gclid=a.b_c' }),
    ).resolves.toEqual([]);
  });

  it('accepts the field being absent — most callers have no referrer', async () => {
    await expect(errorsFor({ src: 'blog' })).resolves.toEqual([]);
  });

  it('rejects a string over 200 characters rather than storing an unbounded blob', async () => {
    await expect(errorsFor({ referrerRaw: 'a'.repeat(201) })).resolves.toEqual(['referrerRaw']);
  });

  it('still holds the four label columns to the strict charset', async () => {
    await expect(errorsFor({ src: 'has space' })).resolves.toEqual(['src']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/auth/dto/acquisition.dto.spec.ts`
Expected: FAIL — the first test passes vacuously (unknown properties are ignored), the third FAILS because `referrerRaw` has no `@MaxLength` yet and produces no error.

- [ ] **Step 3: Add the DTO field**

In `apps/api/src/modules/auth/dto/index.ts`, inside `AcquisitionDto`, after the `plan` field:

```ts
  /**
   * The raw Play Install Referrer string, stored as evidence rather than as a label.
   *
   * Deliberately NOT held to the 20-character `[A-Za-z0-9_-]` charset the four
   * fields above use: that guard exists to keep a hostile value out of a column the
   * admin groups by, and applying it here would discard exactly the unparseable
   * referrers this field exists to preserve. Bounded by length instead.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referrerRaw?: string;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/modules/auth/dto/acquisition.dto.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the Prisma field**

In `apps/api/prisma/schema.prisma`, beside the existing acquisition columns (line 272-275):

```prisma
  acquisitionReferrerRaw String? @map("acquisition_referrer_raw")
```

Leave the `@@index([acquisitionSource])` untouched — this column is never grouped.

- [ ] **Step 6: Write the migration by hand**

`prisma migrate diff --from-migrations` needs a shadow database, and there is none here — this repo runs migrations against prod via the deploy migrator. For a single additive column the SQL is written directly, which is what the ABA-346 migration did for the same reason.

Create `apps/api/prisma/migrations/20260915120000_add_user_acquisition_referrer_raw/migration.sql`:

```sql
-- Play Install Referrer evidence (ABA-553). Additive, nullable, no backfill:
-- an install referrer is delivered once to the device and cannot be recovered
-- for users who registered before this shipped, so NULL is the honest value.
ALTER TABLE "users" ADD COLUMN "acquisition_referrer_raw" TEXT;
```

Then run `cd apps/api && npx prisma validate && npx prisma generate`.
Expected: schema valid, client regenerated with the new field.

- [ ] **Step 7: Persist it on both registration paths**

In `apps/api/src/modules/auth/auth.service.ts`, add the fifth line to **both** blocks (line 86-89, the email register; and line 254-257, the Google path). Both, or a Google signup silently stores no evidence:

```ts
      acquisitionReferrerRaw: dto.acquisition?.referrerRaw,
```

- [ ] **Step 8: Verify the whole API suite still passes**

Run: `cd apps/api && npx jest src/modules/auth`
Expected: PASS, no regressions in `auth.service.spec.ts` / `auth.controller.spec.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/auth
git commit -m "ABA-553 Store the raw Play install referrer alongside the acquisition labels"
```

---

### Task 2: Backfill endpoint

**Files:**
- Modify: `apps/api/src/modules/users/users.controller.ts` (add route after `updatePushToken`, ~line 140)
- Modify: `apps/api/src/modules/users/users.service.ts` (add method after `updatePushToken`, ~line 131)
- Test: `apps/api/src/modules/users/users.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `AcquisitionDto` including `referrerRaw` (Task 1).
- Produces: `UsersService.updateAcquisition(userId: string, dto: AcquisitionDto): Promise<void>` and the route `PATCH /users/me/acquisition` returning 204. Task 5 calls this route.

- [ ] **Step 1: Write the failing service test**

Append to `apps/api/src/modules/users/users.service.spec.ts` (reuse the file's existing prisma mock and `service` setup):

```ts
describe('updateAcquisition', () => {
  it('writes only when acquisitionSource is still null, so first touch cannot be overwritten', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await service.updateAcquisition('user-1', {
      src: 'google-play',
      loc: 'organic',
      referrerRaw: 'utm_source=google-play&utm_medium=organic',
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', acquisitionSource: null },
      data: {
        acquisitionSource: 'google-play',
        acquisitionLocation: 'organic',
        acquisitionLanguage: undefined,
        acquisitionPlan: undefined,
        acquisitionReferrerRaw: 'utm_source=google-play&utm_medium=organic',
      },
    });
  });

  it('resolves without throwing when the guard matched nothing', async () => {
    // An already-attributed user. The client has nothing to do with this
    // information, so it must not surface as an error.
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateAcquisition('user-1', { src: 'blog' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/users/users.service.spec.ts -t updateAcquisition`
Expected: FAIL with "service.updateAcquisition is not a function"

- [ ] **Step 3: Implement the service method**

In `apps/api/src/modules/users/users.service.ts`:

```ts
  /**
   * Late attribution for a user who registered before install-referrer capture shipped.
   *
   * The `acquisitionSource: null` filter is doing real work: it makes first-touch
   * STRUCTURAL rather than a read-then-write that two concurrent calls could race,
   * and it means an already-attributed user can never be relabelled by a later claim.
   * A no-op write is a success — whether this call won is not something the caller
   * can act on, so nothing is returned.
   */
  async updateAcquisition(userId: string, dto: AcquisitionDto): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, acquisitionSource: null },
      data: {
        acquisitionSource: dto.src,
        acquisitionLocation: dto.loc,
        acquisitionLanguage: dto.lang,
        acquisitionPlan: dto.plan,
        acquisitionReferrerRaw: dto.referrerRaw,
      },
    });
  }
```

Import `AcquisitionDto` from `../auth/dto`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/modules/users/users.service.spec.ts -t updateAcquisition`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the route**

In `apps/api/src/modules/users/users.controller.ts`, after `updatePushToken`:

```ts
  @Patch('me/acquisition')
  @HttpCode(204)
  async updateAcquisition(@Req() req: AuthenticatedRequest, @Body() body: AcquisitionDto) {
    await this.usersService.updateAcquisition(req.user.id, body);
  }
```

Add `HttpCode` to the `@nestjs/common` import if absent, and import `AcquisitionDto` from `../auth/dto`. The class-level `JwtAuthGuard` already covers this route — the user id comes from the token, never the body.

- [ ] **Step 6: Run the users suite**

Run: `cd apps/api && npx jest src/modules/users`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/users
git commit -m "ABA-553 Add PATCH /users/me/acquisition for late install attribution"
```

---

### Task 3: Native Install Referrer module

There is no test for this task. CI has no device, and a sideloaded or debug build returns no referrer, so the round trip can only be exercised by a real Play install — the same production-only verification restore-credentials has. The deliverable is a build that compiles and a module JS can call.

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/installreferrer/InstallReferrerModule.kt`
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/installreferrer/InstallReferrerPackage.kt`
- Modify: `apps/mobile/android/app/build.gradle` (dependencies block)
- Modify: `apps/mobile/android/app/src/main/java/com/budget/assistant/MainApplication.kt` (getPackages)

**Interfaces:**
- Consumes: nothing.
- Produces: native module named `InstallReferrerModule` with one method `getInstallReferrer(promise)` resolving `string | null`. Task 4 consumes it via `NativeModules.InstallReferrerModule`.

- [ ] **Step 1: Add the dependency**

In `apps/mobile/android/app/build.gradle`, inside `dependencies`, beside the existing credentials lines:

```gradle
    // Play Install Referrer (ABA-553). Reads the referrer of the original install so a
    // signup can be traced to the link or the Play search that produced it.
    implementation("com.android.installreferrer:installreferrer:2.2")
```

- [ ] **Step 2: Write the module**

Create `InstallReferrerModule.kt`:

```kotlin
package com.budget.assistant.installreferrer

import android.os.RemoteException
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bridge over the Play Install Referrer API.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same reason as NotificationCaptureModule and
 * RestoreCredentialModule).
 *
 * The promise ALWAYS resolves and never rejects. `null` means "no referrer
 * available", which is the ordinary outcome on a sideloaded build, on a device
 * without Play Services, and on any install that did not come from Play. A
 * rejection here would turn an expected absence into an error the JS side has to
 * special-case, and attribution must never be able to break anything.
 */
class InstallReferrerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "InstallReferrerModule"

    @ReactMethod
    fun getInstallReferrer(promise: Promise) {
        // The listener can fire twice — a disconnect can arrive alongside or after
        // the setup callback — and settling a Promise twice is a hard error in RN.
        val settled = AtomicBoolean(false)
        val client = InstallReferrerClient.newBuilder(reactContext).build()

        fun finish(value: String?, client: InstallReferrerClient?) {
            if (!settled.compareAndSet(false, true)) return
            try {
                client?.endConnection()
            } catch (_: Throwable) {
                // Closing a connection that never opened is not a failure worth reporting.
            }
            promise.resolve(value)
        }

        try {
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                        // FEATURE_NOT_SUPPORTED, SERVICE_UNAVAILABLE, DEVELOPER_ERROR.
                        finish(null, client)
                        return
                    }
                    val referrer = try {
                        client.installReferrer.installReferrer
                    } catch (_: RemoteException) {
                        null
                    } catch (_: Throwable) {
                        null
                    }
                    finish(referrer, client)
                }

                override fun onInstallReferrerServiceDisconnected() {
                    // Only reached if the service drops before the setup callback ran;
                    // the settled flag makes a late arrival a no-op.
                    finish(null, client)
                }
            })
        } catch (_: Throwable) {
            // A synchronous failure must not race an already-scheduled callback into
            // double-settling the promise — the settled flag covers that too.
            finish(null, client)
        }
    }
}
```

- [ ] **Step 3: Write the package**

Create `InstallReferrerPackage.kt`:

```kotlin
package com.budget.assistant.installreferrer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes InstallReferrerModule to the JS bridge.
 * Registered manually in MainApplication.kt:getPackages() — no autolink,
 * no TurboModule spec, no codegen (CLAUDE.md build constraint).
 */
class InstallReferrerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(InstallReferrerModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

- [ ] **Step 4: Register it**

In `MainApplication.kt`, add the import beside the other two module imports and extend `getPackages()`:

```kotlin
              add(NotificationCapturePackage())
              add(RestoreCredentialPackage())
              add(InstallReferrerPackage())
```

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/mobile/android && ./gradlew :app:compileReleaseKotlin`
Expected: BUILD SUCCESSFUL. A failure here is a real failure — this is the only automated signal this task has.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/android
git commit -m "ABA-553 Add the Play Install Referrer native module"
```

---

### Task 4: Read the referrer into the existing acquisition pipeline

**Files:**
- Create: `apps/mobile/src/stores/acquisitionStore.ts`
- Modify: `apps/mobile/src/services/attribution.native.ts`
- Test: `apps/mobile/src/services/__tests__/attribution.test.ts` (extend)
- Test: `apps/mobile/src/stores/__tests__/acquisitionStore.test.ts` (create)

**Interfaces:**
- Consumes: native module `InstallReferrerModule.getInstallReferrer()` (Task 3); `parseAcquisition` from `attribution.types`.
- Produces: `captureAcquisition(): void` and `getAcquisition(): Acquisition | undefined` on native (signatures unchanged), plus `acquisitionFlag.hasPushed()` / `markPushed()` consumed by Task 5.

- [ ] **Step 1: Write the failing parser tests for real referrer shapes**

Append to `apps/mobile/src/services/__tests__/attribution.test.ts`:

```ts
describe('parseAcquisition on Play Install Referrer strings', () => {
  it('reads an organic Play install, the shape Play supplies with no tagging from us', () => {
    expect(parseAcquisition('utm_source=google-play&utm_medium=organic')).toEqual({
      src: 'google-play',
      loc: 'organic',
    });
  });

  it('prefers our own tags over the utm half of the same string', () => {
    // play_url emits both; ours carry the language, which fromUtm cannot.
    expect(
      parseAcquisition('src=blog&loc=footer&lang=pl&utm_source=blog&utm_medium=footer'),
    ).toEqual({ src: 'blog', loc: 'footer', lang: 'pl' });
  });

  it('returns undefined for a gclid-only referrer, leaving the labels empty', () => {
    // The raw string is stored separately, so the case stays diagnosable.
    expect(parseAcquisition('gclid=EAIaIQobChMI')).toBeUndefined();
  });

  it('accepts a referrer string with no leading question mark', () => {
    // Play hands over a bare query string; URLSearchParams tolerates both.
    expect(parseAcquisition('src=landing&loc=hero')).toEqual({ src: 'landing', loc: 'hero' });
  });
});
```

- [ ] **Step 2: Run to verify they pass already**

Run: `cd apps/mobile && npx jest src/services/__tests__/attribution.test.ts`
Expected: PASS — all four. `parseAcquisition` already handles these shapes; these tests pin that it keeps doing so, since the whole design rests on it. If any fails, stop and fix `parseAcquisition` before continuing.

- [ ] **Step 3: Write the failing store test**

Create `apps/mobile/src/stores/__tests__/acquisitionStore.test.ts`:

```ts
import { resolvePushed, resolveStored, truncateReferrer } from '../acquisitionStore';

describe('resolveStored', () => {
  it('returns undefined when nothing was ever stored', () => {
    expect(resolveStored(() => undefined)).toBeUndefined();
  });

  it('re-validates on read, dropping a hand-edited value', () => {
    expect(resolveStored(() => JSON.stringify({ src: 'has space' }))).toBeUndefined();
  });

  it('keeps a valid record', () => {
    expect(resolveStored(() => JSON.stringify({ src: 'blog', lang: 'pl' }))).toEqual({
      src: 'blog',
      lang: 'pl',
    });
  });

  it('survives corrupt JSON rather than throwing into the entry point', () => {
    expect(resolveStored(() => '{not json')).toBeUndefined();
  });
});

describe('resolvePushed', () => {
  it('defaults to not-pushed, so a truncated value retries rather than losing the backfill', () => {
    expect(resolvePushed(() => undefined)).toBe(false);
    expect(resolvePushed(() => 'yes')).toBe(false);
    expect(resolvePushed(() => 'true')).toBe(true);
  });
});

describe('truncateReferrer', () => {
  it('bounds the raw string to what the API accepts', () => {
    expect(truncateReferrer('a'.repeat(250))).toHaveLength(200);
  });

  it('leaves a normal referrer untouched', () => {
    const s = 'utm_source=google-play&utm_medium=organic';
    expect(truncateReferrer(s)).toBe(s);
  });

  it('treats an empty referrer as nothing to store', () => {
    expect(truncateReferrer('')).toBeUndefined();
    expect(truncateReferrer(null)).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/stores/__tests__/acquisitionStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the store**

Create `apps/mobile/src/stores/acquisitionStore.ts`:

```ts
import { MMKV } from 'react-native-mmkv';
import { ACQUISITION_KEYS, type Acquisition } from '@/services/attribution.types';

const mmkv = new MMKV({ id: 'acquisition' });

const VALUE_KEY = 'acquisition';
const RAW_KEY = 'acquisitionRaw';
const READ_KEY = 'acquisitionRead';
const PUSHED_KEY = 'acquisitionPushed';

/** The API's own bound. Longer than this is truncated, never dropped: a clipped
 *  referrer still identifies a source, an absent one identifies nothing. */
export const MAX_RAW_LENGTH = 200;

const SAFE = /^[A-Za-z0-9_-]{1,20}$/;

/** Pure so the defaults can be tested without mocking MMKV (firstRunStore's shape). */
export function resolveStored(read: (key: string) => string | undefined): Acquisition | undefined {
  try {
    const raw = read(VALUE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Acquisition;
    const clean: Acquisition = {};
    let found = false;
    for (const k of ACQUISITION_KEYS) {
      const v = parsed?.[k];
      if (typeof v === 'string' && SAFE.test(v)) {
        clean[k] = v;
        found = true;
      }
    }
    return found ? clean : undefined;
  } catch {
    return undefined;
  }
}

/** Strict `=== 'true'`, so an absent or corrupt value resolves to "not yet" and the
 *  work retries. The safe direction: a repeated no-op PATCH costs nothing, a
 *  permanently skipped one loses the attribution for good. */
export function resolvePushed(read: (key: string) => string | undefined): boolean {
  return read(PUSHED_KEY) === 'true';
}

/** Same default and same reason as `resolvePushed`: a transient SERVICE_UNAVAILABLE
 *  must be retried on the next launch, not recorded as "this install has no referrer". */
export function resolveRead(read: (key: string) => string | undefined): boolean {
  return read(READ_KEY) === 'true';
}

export function truncateReferrer(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.slice(0, MAX_RAW_LENGTH);
}

export const acquisitionFlag = {
  stored: (): Acquisition | undefined => resolveStored((k) => mmkv.getString(k)),
  storedRaw: (): string | undefined => mmkv.getString(RAW_KEY),
  hasRead: (): boolean => resolveRead((k) => mmkv.getString(k)),
  hasPushed: (): boolean => resolvePushed((k) => mmkv.getString(k)),
  markPushed: (): void => mmkv.set(PUSHED_KEY, 'true'),
  /** First touch wins: an existing record is never replaced. */
  save: (value: Acquisition | undefined, raw: string | undefined): void => {
    if (!mmkv.getString(VALUE_KEY) && value) mmkv.set(VALUE_KEY, JSON.stringify(value));
    if (!mmkv.getString(RAW_KEY) && raw) mmkv.set(RAW_KEY, raw);
    mmkv.set(READ_KEY, 'true');
  },
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/mobile && npx jest src/stores/__tests__/acquisitionStore.test.ts`
Expected: PASS (8 tests). If MMKV throws at import, add the per-file mock this repo already uses: `jest.mock('react-native-mmkv', () => ({ MMKV: class { getString() { return undefined; } set() {} } }));`

- [ ] **Step 7: Wire the native implementation**

Replace the two acquisition functions in `apps/mobile/src/services/attribution.native.ts` (leave the two referral-code no-ops exactly as they are — a referral code still reaches a native signup only by the user typing it):

```ts
import { NativeModules, Platform } from 'react-native';
import { parseAcquisition, type Acquisition } from './attribution.types';
import { acquisitionFlag, truncateReferrer } from '@/stores/acquisitionStore';

export type { Acquisition } from './attribution.types';

/**
 * Read the Play Install Referrer once per install and park it in MMKV.
 *
 * Stays `(): void` so the entry point's call site is unchanged, and so
 * `getAcquisition()` below can stay synchronous — it is called inside the request
 * body in `auth.api.ts`, and making it async would ripple into the auth surface for
 * a field that is optional by design. The read is fire-and-forget: by the time a
 * user reaches the register screen the value is there, and if it is not, the field
 * is simply omitted, exactly as before this existed.
 *
 * `hasRead()` guards the native call, not the value — Play's referrer never changes
 * for an install, so one SUCCESSFUL read is final. A failed read leaves the flag
 * unset so the next launch tries again.
 */
export function captureAcquisition(): void {
  if (Platform.OS !== 'android') return;
  if (acquisitionFlag.hasRead()) return;
  const native = NativeModules.InstallReferrerModule as
    | { getInstallReferrer: () => Promise<string | null> }
    | undefined;
  if (!native) return;
  native
    .getInstallReferrer()
    .then((referrer) => {
      const raw = truncateReferrer(referrer);
      // An empty referrer is still a successful read: store the flag, not a value,
      // so we stop asking Play on every launch.
      acquisitionFlag.save(raw ? parseAcquisition(raw) : undefined, raw);
    })
    .catch((e) => {
      // The native side resolves rather than rejects, so this is defensive only.
      console.warn('[Attribution] install referrer read failed:', e);
    });
}

export function getAcquisition(): Acquisition | undefined {
  const stored = acquisitionFlag.stored();
  const raw = acquisitionFlag.storedRaw();
  if (!stored && !raw) return undefined;
  // `referrerRaw` rides with the labels rather than in its own call: the backfill
  // endpoint's first-touch guard would refuse a later PATCH for a user whose
  // registration already set a source, and the raw string would be lost for them.
  return { ...(stored ?? {}), ...(raw ? { referrerRaw: raw } : {}) };
}
```

- [ ] **Step 8: Widen the Acquisition type**

In `apps/mobile/src/services/attribution.types.ts`, add to the `Acquisition` interface:

```ts
  /** The raw Play referrer, carried as evidence. NOT in `ACQUISITION_KEYS` — the
   *  SAFE-charset loops must never touch it, or the unparseable values it exists to
   *  preserve would be the first thing dropped. */
  referrerRaw?: string;
```

Leave `ACQUISITION_KEYS` unchanged.

- [ ] **Step 9: Run the mobile service and store suites**

Run: `cd apps/mobile && npx jest src/services/__tests__/attribution.test.ts src/stores/__tests__/acquisitionStore.test.ts`
Expected: PASS. Then `npx tsc --noEmit` to confirm the widened type breaks nothing.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src
git commit -m "ABA-553 Read the Play install referrer into the acquisition pipeline"
```

---

### Task 5: Backfill already-registered users

**Files:**
- Modify: `apps/mobile/src/services/users.api.ts` (add method)
- Modify: `apps/mobile/src/hooks/useAuthenticatedBootstrap.ts:44-48`
- Test: `apps/mobile/src/hooks/__tests__/useAuthenticatedBootstrap.test.ts` (extend)

**Interfaces:**
- Consumes: `acquisitionFlag.hasPushed()` / `markPushed()` and `getAcquisition()` (Task 4); `PATCH /users/me/acquisition` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/hooks/__tests__/useAuthenticatedBootstrap.test.ts`. The file already mocks `@/services/api`; add these two mocks at the top beside the existing ones, and add `updateAcquisition: jest.fn()` to the existing `api` mock object:

```ts
jest.mock('@/stores/acquisitionStore', () => ({
  acquisitionFlag: { hasPushed: jest.fn(), markPushed: jest.fn() },
}));
jest.mock('@/services/attribution', () => ({ getAcquisition: jest.fn() }));

import { acquisitionFlag } from '@/stores/acquisitionStore';
import { getAcquisition } from '@/services/attribution';
```

Then the cases:

```ts
describe('acquisition backfill', () => {
  beforeEach(() => {
    (api.updateAcquisition as jest.Mock).mockResolvedValue(undefined);
  });

  it('sends the stored acquisition once, for a user who registered before capture existed', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue({ src: 'google-play', loc: 'organic' });

    runDelayedAuthenticatedBootstrap();

    expect(api.updateAcquisition).toHaveBeenCalledWith({ src: 'google-play', loc: 'organic' });
  });

  it('does not send twice', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(true);
    runDelayedAuthenticatedBootstrap();
    expect(api.updateAcquisition).not.toHaveBeenCalled();
  });

  it('sends nothing when there is no referrer to report', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue(undefined);
    runDelayedAuthenticatedBootstrap();
    expect(api.updateAcquisition).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/useAuthenticatedBootstrap.test.ts`
Expected: FAIL — `api.updateAcquisition is not a function`.

- [ ] **Step 3: Add the API client method**

In `apps/mobile/src/services/users.api.ts`, beside `updateProfile`:

```ts
  async updateAcquisition(acquisition: Acquisition): Promise<void> {
    await this.request('/users/me/acquisition', { method: 'PATCH', body: JSON.stringify(acquisition) });
  },
```

Match the file's existing method shape and import `Acquisition` from `./attribution.types`.

- [ ] **Step 4: Call it from the bootstrap**

In `runDelayedAuthenticatedBootstrap`, after the restore-credential block:

```ts
  // Late attribution for users who registered before install-referrer capture shipped.
  // A new registration already carries this in its own request body, so for everyone
  // else this is a single no-op PATCH the server refuses via its first-touch guard.
  if (!acquisitionFlag.hasPushed()) {
    const acquisition = getAcquisition();
    if (acquisition) {
      api
        .updateAcquisition(acquisition)
        .then(() => acquisitionFlag.markPushed())
        .catch((e) => console.warn('[Attribution] acquisition backfill failed:', e));
    }
  }
```

The flag is marked only on success: a 204 means the server considered the claim, whoever won.

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/useAuthenticatedBootstrap.test.ts`
Expected: PASS (3 new tests plus the existing ones).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "ABA-553 Backfill acquisition for users who registered before capture shipped"
```

---

### Task 6: Tag the Play links in the static generators

**Files:**
- Modify: `docs/marketing/seo/build_blog.py` (add `play_url` beside `app_url` at :560; use it in `foot` at :604 and `cta_block` at :614)
- Modify: `docs/marketing/landing/build_landing.py` (add `play_url` beside `app_url` at :323; use it at :1149 and :1380 and in the nine contact strings at :575-610)
- Test: `docs/marketing/seo/test_play_url.py` (create)

**Interfaces:**
- Consumes: the existing `PLAY` constant and `bcp47(lang)`.
- Produces: `play_url(loc, lang, src="blog")` in `build_blog.py`, imported by `build_help.py` as `bb.play_url`.

- [ ] **Step 1: Write the failing test**

Create `docs/marketing/seo/test_play_url.py`:

```python
import sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import build_blog as bb


def params(url):
    ref = urllib.parse.parse_qs(urllib.parse.urlparse(url.replace("&amp;", "&")).query)["referrer"][0]
    return dict(urllib.parse.parse_qsl(ref))


def test_carries_both_schemes():
    p = params(bb.play_url("footer", "pl"))
    assert p["src"] == "blog" and p["loc"] == "footer" and p["lang"] == "pl"
    assert p["utm_source"] == "blog" and p["utm_medium"] == "footer"


def test_help_generator_is_not_filed_as_blog():
    assert params(bb.play_url("cta", "en", "help"))["src"] == "help"


def test_uses_bcp47_so_ukrainian_is_not_two_names_in_one_column():
    assert params(bb.play_url("cta", "ua"))["lang"] == "uk"


def test_starts_with_the_bare_play_url_so_the_ga4_store_click_check_still_matches():
    # build_landing's tracker does indexOf(PLAY) === 0.
    assert bb.play_url("cta", "en").startswith(bb.PLAY)


def test_separator_is_html_escaped_because_this_lands_in_an_attribute():
    assert "&amp;referrer=" in bb.play_url("cta", "en")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd docs/marketing/seo && python -m pytest test_play_url.py -q`
Expected: FAIL — `module 'build_blog' has no attribute 'play_url'`

- [ ] **Step 3: Add `play_url` to `build_blog.py`**

Directly below `app_url` (after line 570):

```python
def play_url(loc, lang, src="blog"):
    """Link to the Play listing, tagged so an INSTALL can be traced back the way a web
    signup already is. Two schemes on purpose: our own src/loc/lang is what
    parseAcquisition prefers and is the only one carrying the language, while the utm
    pair is what Play Console's own acquisition reports read. A referrer is written
    once, at install, and can never be re-tagged afterwards, so emitting both now is
    cheaper than discovering later that the breakdown we want was never recorded.

    The bare PLAY prefix must stay first: build_landing's GA4 tracker detects a store
    click with indexOf(PLAY) === 0. And `&amp;`, not `&`, for the same reason as
    app_url — this lands inside an HTML attribute."""
    ref = urllib.parse.urlencode({
        "src": src, "loc": loc, "lang": bcp47(lang),
        "utm_source": src, "utm_medium": loc,
    })
    return f"{PLAY}&amp;referrer={urllib.parse.quote(ref, safe='')}"
```

Add `import urllib.parse` at the top of the file if absent.

- [ ] **Step 4: Run to verify it passes**

Run: `cd docs/marketing/seo && python -m pytest test_play_url.py -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Use it in the blog chrome**

In `build_blog.py`, replace `href="{PLAY}"` with the tagged call in exactly two places:
- `foot(...)` line 604: `<a href="{play_url("footer", lang, src)}">Google Play</a>`
- `cta_block(...)` line 614: `<a class="btn s" href="{play_url("cta", lang, src)}">{t["btnPlay"]}</a>`

**Leave `SAMEAS` (line 166-172) alone.** That list feeds Organization JSON-LD; a tracking parameter in structured data is wrong and would be reported as a different entity URL. `build_help.py` needs no edit — it already passes `src="help"` into `foot` and `cta_block`.

- [ ] **Step 6: Mirror it in the landing generator**

Add the same `play_url` to `build_landing.py` below its own `app_url` (line 331), with `src="landing"` as the default, and use it at:
- line 1149 (footer Google Play link) → `play_url("footer", lang)`
- line 1380 (hero secondary CTA) → `play_url("hero", lang)`
- the nine contact/legal strings at lines 575-610 → `play_url("body", lang)`

**Leave lines 1245, 1286 (`downloadUrl` / `sameAs` in JSON-LD) and 1089/1129 (the tracker's `__PLAY__` constant) as the bare `PLAY`.** The tracker compares with `indexOf(PLAY) === 0`, so it must hold the prefix, not a tagged URL.

- [ ] **Step 7: Regenerate all three sites and verify**

```bash
cd /d/Work/micode/ai-budget-assistant
python docs/marketing/seo/build_blog.py
python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
grep -o 'play.google.com[^"]*referrer[^"]*' docs/marketing/seo/site/blog/pl/jak-podzielic-rachunek/index.html
```

Expected: the Play links now carry `&amp;referrer=src%3Dblog...`. The landing build MUST use those env vars — the env-less default produces a `noindex` preview that would overwrite the production site.

- [ ] **Step 8: Commit**

```bash
git add -f docs/marketing/seo docs/marketing/landing docs/marketing/help
git commit -m "ABA-553 Tag Play Store links so an install can be attributed"
```

Note the `-f`: `docs/marketing` is gitignored, and a generated page that is not force-added silently 404s in production.

---

### Task 7: Documentation and compliance

**Files:**
- Modify: `CLAUDE.md` (the ABA-436 acquisition paragraph under **Mobile**)
- Modify: `docs/marketing/landing/legal/en/privacy.html` and `docs/marketing/landing/legal/pl/privacy.html` (section 2.5)
- Modify: on branch `gh-pages`, `en/privacy.html` and `pl/privacy.html` (section 2.5)

- [ ] **Step 1: Extend the CLAUDE.md acquisition entry**

Append to the ABA-436 paragraph: that Android installs are now attributed via the Play Install Referrer (ABA-553); that `play_url` tags Play links with both schemes while `SAMEAS`/`downloadUrl`/the tracker constant stay bare; that `acquisitionReferrerRaw` exists, is never grouped and has no admin UI; and that the backfill PATCH writes only when `acquisitionSource IS NULL`.

- [ ] **Step 2: Update BOTH privacy policies**

Add this paragraph to section 2.5 in all **four** files — `docs/marketing/landing/legal/{en,pl}/privacy.html` and, on branch `gh-pages`, `{en,pl}/privacy.html`. The wording must be identical between the two copies of each language, or the published policy and the accepted policy say different things.

English:

```html
<p><strong>Install source (Android).</strong> When you install the app from Google
Play, we read the Play Install Referrer: a short text string recording which link or
store listing led to the installation. We store it with your account so we can tell
which of our pages actually help people find us. It contains no device identifier, no
advertising identifier and no personal data, we do not use it for advertising, and we
do not share it with third parties.</p>
```

Polish:

```html
<p><strong>Źródło instalacji (Android).</strong> Gdy instalujesz aplikację z Google
Play, odczytujemy Play Install Referrer: krótki ciąg tekstowy wskazujący, który link
lub która pozycja w sklepie doprowadziła do instalacji. Zapisujemy go przy Twoim
koncie, aby wiedzieć, które z naszych stron faktycznie pomagają użytkownikom nas
znaleźć. Nie zawiera on identyfikatora urządzenia, identyfikatora reklamowego ani
danych osobowych, nie używamy go do celów reklamowych i nie udostępniamy go podmiotom
trzecim.</p>
```

**Both copies are mandatory.** The `gh-pages` copy is the one the registration checkbox links (`apps/mobile/src/constants/legal.ts`); the marketing copy is the one the site publishes. Updating only one leaves a user accepting a policy that contradicts the published one — the exact gap ABA-497 had to close.

- [ ] **Step 3: Re-read the Play Data Safety declaration**

Open Play Console → App content → Data safety and confirm the declared categories still cover "app activity / other actions". This is a read-and-confirm step; change it only if the current declaration does not cover install-source data.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md && git add -f docs/marketing/landing/legal
git commit -m "ABA-553 Document install-referrer attribution and update both privacy policies"
```

---

## After the plan

Verification is **production-only** and deliberately so: no device in CI, and a sideloaded build returns no referrer. After the next store release, the signal is the admin `/acquisition` page showing values other than "Direct / unknown" — most likely `google-play` / `organic` in the majority, which would mean ASO, not links, is carrying the product today.

If `acquisitionSource` stays null for the existing 44 after release, Play is not returning the original install's referrer post-update and the backfill half of this work delivered nothing. New installs would still be attributed correctly.
