# Restore Credentials — Stage 2 (Android Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an Android device that was restored from a backup sign itself in, by talking to Credential Manager from a native module and trading the resulting assertion for a session through the endpoints stage 1 already deployed.

**Architecture:** A legacy (Old-Arch) Kotlin `ReactContextBaseJavaModule` over `androidx.credentials`, exposed through a platform-split JS bridge, driven by two pure orchestration functions that the auth store calls — one after sign-in and on launch, one in the no-session branch of `initialize()`.

**Tech Stack:** Kotlin, `androidx.credentials` 1.6.0 (stable), React Native 0.81 Old-Arch bridge, Zustand, MMKV, Jest.

**Spec:** `docs/superpowers/specs/2026-08-31-restore-credentials-client-design.md`

## Global Constraints

- Work from `D:\Work\micode\ai-budget-assistant`. The app is `apps/mobile`.
- **No TurboModule, no codegen spec.** Fabric codegen exceeds the Windows MAX_PATH limit on this machine. Follow `NotificationCaptureModule.kt` / `NotificationCapturePackage.kt` exactly: legacy `ReactContextBaseJavaModule`, registered by hand in `MainApplication.kt.getPackages()`.
- **`androidx.credentials:credentials:1.6.0` and `credentials-play-services-auth:1.6.0`.** Stable. Do not use `1.7.0-alpha03` from Google's sample.
- **Use the callback (`*Async`) Credential Manager APIs, not the suspend functions.** The suspend variants would drag `kotlinx.coroutines` into a legacy bridge module and make it own a coroutine scope with an Activity lifecycle — an avoidable class of bug for no benefit, since a `Promise` is already a callback.
- **Nothing in this stage may throw into a call site.** Every flow is fire-and-forget or returns `null`. Log with `console.warn`, never `console.error` (ABA-157: a fire-and-forget failure is expected, not exceptional).
- **The restore attempt is bounded at 5000 ms** in one named constant.
- Run mobile tests from `apps/mobile` with `npx jest <path>`.
- i18n: this stage adds **no user-visible strings**. If you find yourself writing one, stop and report it — the feature is silent by design.

---

### Task 1: The Kotlin module

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/restorecredentials/RestoreCredentialModule.kt`
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/restorecredentials/RestoreCredentialPackage.kt`
- Modify: `apps/mobile/android/app/build.gradle` (dependencies block)
- Modify: `apps/mobile/android/app/src/main/java/com/budget/assistant/MainApplication.kt`

**Interfaces:**
- Produces a native module named `RestoreCredentialModule` with three `@ReactMethod`s:
  - `createCredential(requestJson: String, promise: Promise)` → resolves the registration response JSON string
  - `getCredential(requestJson: String, promise: Promise)` → resolves the assertion response JSON string
  - `clearCredential(promise: Promise)` → resolves `true`

- [ ] **Step 1: Add the dependencies**

In `apps/mobile/android/app/build.gradle`, inside the existing `dependencies { ... }` block, after the `com.facebook.react:react-android` line:

```gradle
    // Restore Credentials (ABA stage 2). Stable 1.6.0 — restore credentials need
    // >= 1.5.0, so the 1.7.0-alpha that Google's sample pins is unnecessary.
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
```

- [ ] **Step 2: Write the package class**

`RestoreCredentialPackage.kt` — a direct mirror of `NotificationCapturePackage.kt`:

```kotlin
package com.budget.assistant.restorecredentials

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes RestoreCredentialModule to the JS bridge.
 * Registered manually in MainApplication.kt:getPackages() — no autolink,
 * no TurboModule spec, no codegen (CLAUDE.md build constraint).
 */
class RestoreCredentialPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(RestoreCredentialModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

- [ ] **Step 3: Write the module**

`RestoreCredentialModule.kt`. Import paths for the `androidx.credentials` classes are the one thing here most likely to be wrong — **verify each against the resolved AAR before assuming**, the same way stage 1 verified the `@simplewebauthn/server` result shape. If a class is not where this code says, find it (`./gradlew :app:dependencies` to confirm the version resolved, then check the artifact) and adjust only the import.

```kotlin
package com.budget.assistant.restorecredentials

import android.os.CancellationSignal
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreateRestoreCredentialRequest
import androidx.credentials.CreateRestoreCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetRestoreCredentialOption
import androidx.credentials.RestoreCredential
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executor

/**
 * Bridge over androidx.credentials for Android Restore Credentials.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same reason as NotificationCaptureModule).
 *
 * Uses the callback (*Async) Credential Manager APIs rather than the suspend
 * ones: a Promise is already a callback, and the suspend variants would make
 * this module own a coroutine scope tied to an Activity lifecycle for no gain.
 */
class RestoreCredentialModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RestoreCredentialModule"

    private val executor: Executor = Executor { command -> command.run() }

    private fun credentialManager(): CredentialManager =
        CredentialManager.create(reactContext)

    @ReactMethod
    fun createCredential(requestJson: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("no_activity", "No current activity")
            return
        }
        createWith(requestJson, cloudBackup = true, promise = promise, allowRetry = true)
    }

    private fun createWith(
        requestJson: String,
        cloudBackup: Boolean,
        promise: Promise,
        allowRetry: Boolean,
    ) {
        val activity = currentActivity ?: run {
            promise.reject("no_activity", "No current activity")
            return
        }
        val request = CreateRestoreCredentialRequest(requestJson, isCloudBackupEnabled = cloudBackup)
        credentialManager().createCredentialAsync(
            activity,
            request,
            CancellationSignal(),
            executor,
            object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                override fun onResult(result: CreateCredentialResponse) {
                    val json = (result as? CreateRestoreCredentialResponse)?.responseJson
                    if (json == null) {
                        promise.reject("unexpected_response", "Not a restore credential response")
                    } else {
                        promise.resolve(json)
                    }
                }

                override fun onError(e: CreateCredentialException) {
                    // A device with no screen lock or no Google backup cannot hold a
                    // cloud-backed restore key. Retrying locally still produces a key
                    // that survives a device-to-device cable transfer, so this is worth
                    // one retry rather than leaving those users with nothing.
                    if (allowRetry && isE2eeUnavailable(e)) {
                        createWith(requestJson, cloudBackup = false, promise = promise, allowRetry = false)
                    } else {
                        promise.reject(e.type ?: "create_failed", e.errorMessage?.toString() ?: e.message)
                    }
                }
            },
        )
    }

    private fun isE2eeUnavailable(e: CreateCredentialException): Boolean =
        e::class.java.simpleName == "E2eeUnavailableException"

    @ReactMethod
    fun getCredential(requestJson: String, promise: Promise) {
        val activity = currentActivity ?: run {
            promise.reject("no_activity", "No current activity")
            return
        }
        val request = GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson)))
        credentialManager().getCredentialAsync(
            activity,
            request,
            CancellationSignal(),
            executor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val credential = result.credential as? RestoreCredential
                    if (credential == null) {
                        promise.reject("unexpected_credential", "Not a restore credential")
                    } else {
                        promise.resolve(credential.authenticationResponseJson)
                    }
                }

                override fun onError(e: GetCredentialException) {
                    // "No credential available" is the ordinary case on a device that
                    // was never restored. The JS layer treats every rejection the same.
                    promise.reject(e.type ?: "get_failed", e.errorMessage?.toString() ?: e.message)
                }
            },
        )
    }

    @ReactMethod
    fun clearCredential(promise: Promise) {
        credentialManager().clearCredentialStateAsync(
            ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL),
            CancellationSignal(),
            executor,
            object : CredentialManagerCallback<Void?, ClearCredentialException> {
                override fun onResult(result: Void?) {
                    promise.resolve(true)
                }

                override fun onError(e: ClearCredentialException) {
                    promise.reject(e.type ?: "clear_failed", e.errorMessage?.toString() ?: e.message)
                }
            },
        )
    }
}
```

Note `isE2eeUnavailable` compares the class's simple name rather than importing `E2eeUnavailableException`. That is deliberate and worth keeping unless you confirm the import path: the exception moved packages between androidx versions, and a wrong import is a compile error while a name comparison degrades to "no retry" — the safe direction. If you do confirm the correct import, replace it with a real `is` check and say so in your report.

- [ ] **Step 4: Register the package**

In `MainApplication.kt`, add the import and extend the existing manual-registration block:

```kotlin
              add(NotificationCapturePackage())
              add(RestoreCredentialPackage())
```

- [ ] **Step 5: Prove it compiles**

Run: `cd apps/mobile/android && ./gradlew :app:compileDebugKotlin`
Expected: `BUILD SUCCESSFUL`. This is the only verification available for the native half — there is no device. Paste the real tail of the output in your report, including the version line if Gradle reports a resolved `androidx.credentials` version.

If a class or member does not exist, fix the reference — do not comment out the call or cast it away.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/android/
git commit -m "ABA-465 Add Android restore-credential native module"
```

---

### Task 2: The JS bridge

**Files:**
- Create: `apps/mobile/src/services/restoreCredentials/index.ts`
- Create: `apps/mobile/src/services/restoreCredentials/index.android.ts`
- Create: `apps/mobile/src/services/restoreCredentials/index.ios.ts`
- Create: `apps/mobile/src/services/restoreCredentials/index.web.ts`
- Test: `apps/mobile/src/services/restoreCredentials/__tests__/stubs.test.ts`

**Interfaces:**
- Consumes: the native module from Task 1.
- Produces: `createRestoreCredential(requestJson: string): Promise<string | null>`, `getRestoreCredential(requestJson: string): Promise<string | null>`, `clearRestoreCredential(): Promise<void>`. **All three resolve rather than reject** — `null` means "not available", which on iOS, web, and any Android device without a credential is the normal answer.

- [ ] **Step 1: Write the failing test**

```typescript
import {
  createRestoreCredential,
  getRestoreCredential,
  clearRestoreCredential,
} from '../index.ios';

// The stubs exist so call sites need no platform branching. If one of them
// ever rejects instead of resolving, an unhandled rejection surfaces during
// app boot on iOS — the one platform where this feature does nothing at all.
describe('restoreCredentials stubs', () => {
  it('resolve null rather than rejecting', async () => {
    await expect(createRestoreCredential('{}')).resolves.toBeNull();
    await expect(getRestoreCredential('{}')).resolves.toBeNull();
    await expect(clearRestoreCredential()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/services/restoreCredentials/`
Expected: FAIL — `Cannot find module '../index.ios'`.

- [ ] **Step 3: Write the stub (`index.ios.ts`), then copy it to `index.web.ts`**

```typescript
/**
 * Restore Credentials are Android-only. These stubs exist so call sites need
 * no platform branching: `null` is the same answer a real Android device with
 * no stored credential gives, which is the overwhelmingly common case anyway.
 */
export async function createRestoreCredential(_requestJson: string): Promise<string | null> {
  return null;
}

export async function getRestoreCredential(_requestJson: string): Promise<string | null> {
  return null;
}

export async function clearRestoreCredential(): Promise<void> {
  // Nothing to clear.
}
```

`index.web.ts` is the same file with the same contents.

- [ ] **Step 4: Write the base `index.ts`**

Mirrors `src/services/notificationCapture/index.ts` — read it first and match its comment:

```typescript
/**
 * Base module resolution for `@/services/restoreCredentials`.
 *
 * Metro picks the platform file at bundle time: `index.android.ts` (real native
 * module), `index.ios.ts` / `index.web.ts` (no-op stubs). TypeScript (`tsc`) does
 * NOT understand platform extensions, so it needs this base `index.ts` to resolve
 * the module. The base re-exports the no-op stub: identical type surface to every
 * platform variant, and a safe fallback on any other target.
 */
export * from './index.ios';
```

- [ ] **Step 5: Write `index.android.ts`**

```typescript
/**
 * Android implementation of the RestoreCredential bridge.
 * Wraps the legacy (Old-Arch) NativeModule registered by RestoreCredentialPackage.
 * No TurboModule spec — avoids Windows MAX_PATH / Fabric codegen (CLAUDE.md constraint).
 *
 * Every function resolves. A rejection from the native side means "no credential
 * available" far more often than it means "something broke", and the caller
 * cannot act on the difference, so it is flattened to null here.
 */
import { NativeModules } from 'react-native';

const { RestoreCredentialModule } = NativeModules;

if (!RestoreCredentialModule && __DEV__) {
  console.warn(
    '[RestoreCredentials] NativeModule "RestoreCredentialModule" not found. ' +
      'Ensure RestoreCredentialPackage is registered in MainApplication.kt and the ' +
      'app was rebuilt (not just Metro-restarted).',
  );
}

export async function createRestoreCredential(requestJson: string): Promise<string | null> {
  if (!RestoreCredentialModule) return null;
  try {
    return await RestoreCredentialModule.createCredential(requestJson);
  } catch (e) {
    console.warn('[RestoreCredentials] create failed:', e);
    return null;
  }
}

export async function getRestoreCredential(requestJson: string): Promise<string | null> {
  if (!RestoreCredentialModule) return null;
  try {
    return await RestoreCredentialModule.getCredential(requestJson);
  } catch {
    // Silent: on every device that has never been restored this is the normal
    // outcome, and it happens on each cold start. Logging it would be noise.
    return null;
  }
}

export async function clearRestoreCredential(): Promise<void> {
  if (!RestoreCredentialModule) return;
  try {
    await RestoreCredentialModule.clearCredential();
  } catch (e) {
    console.warn('[RestoreCredentials] clear failed:', e);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/services/restoreCredentials/ && npx tsc --noEmit`
Expected: PASS and a clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/services/restoreCredentials/
git commit -m "ABA-465 Add restore-credential JS bridge with platform stubs"
```

---

### Task 3: API client methods and the two orchestration flows

**Files:**
- Modify: `apps/mobile/src/services/auth.api.ts`
- Create: `apps/mobile/src/features/auth/restoreCredential.ts`
- Create: `apps/mobile/src/stores/restoreCredentialStore.ts`
- Test: `apps/mobile/src/features/auth/__tests__/restoreCredential.test.ts`

**Interfaces:**
- Consumes: the bridge from Task 2; the five stage-1 endpoints.
- Produces:
  - `registerRestoreCredential(userId: string): Promise<void>` — fail-silent
  - `attemptRestoreSession(): Promise<AuthResponse | null>`
  - `RESTORE_TIMEOUT_MS = 5000`
  - `useRestoreCredentialStore` with `hasSynced(userId)` / `markSynced(userId)` and a pure `resolveSynced(read, userId)`

- [ ] **Step 1: Add the API methods**

In `apps/mobile/src/services/auth.api.ts`, following the file's existing style, add these five methods on the same object the other auth calls live on. Read the file first and match how it builds paths and passes bodies:

- `getRestoreRegistrationOptions()` → `GET /auth/restore/register/options`
- `verifyRestoreRegistration(response: unknown)` → `POST /auth/restore/register` with body `{ response }`
- `getRestoreAuthenticationOptions()` → `GET /auth/restore/options`
- `verifyRestoreAuthentication(response: unknown)` → `POST /auth/restore` with body `{ response }`, returning the same shape as `login`
- `deleteRestoreCredentials()` → `DELETE /auth/restore`

The two public ones must NOT attach an auth header — check how the client decides that and follow it; `POST /auth/restore` is called when there is no token at all.

- [ ] **Step 2: Write the MMKV flag store**

`restoreCredentialStore.ts`, mirroring `firstRunStore.ts`'s pure-resolver convention:

```typescript
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'restore-credential' });

const key = (userId: string) => `synced:${userId}`;

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSynced(read: (k: string) => string | undefined, userId: string): boolean {
  return read(key(userId)) === 'true';
}

/**
 * Keyed by user id, not a bare boolean: signing into a second account on the
 * same device must register that account too, and a shared flag would make the
 * second account silently never get a credential.
 */
export const restoreCredentialFlag = {
  hasSynced: (userId: string) => resolveSynced((k) => mmkv.getString(k), userId),
  markSynced: (userId: string) => mmkv.set(key(userId), 'true'),
};
```

- [ ] **Step 3: Write the failing tests**

```typescript
jest.mock('@/services/restoreCredentials', () => ({
  createRestoreCredential: jest.fn(),
  getRestoreCredential: jest.fn(),
  clearRestoreCredential: jest.fn(),
}));
jest.mock('@/services/api', () => ({ api: {
  getRestoreRegistrationOptions: jest.fn(),
  verifyRestoreRegistration: jest.fn(),
  getRestoreAuthenticationOptions: jest.fn(),
  verifyRestoreAuthentication: jest.fn(),
} }));
jest.mock('@/stores/restoreCredentialStore', () => ({
  restoreCredentialFlag: { hasSynced: jest.fn(), markSynced: jest.fn() },
}));

import { createRestoreCredential, getRestoreCredential } from '@/services/restoreCredentials';
import { api } from '@/services/api';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';
import { registerRestoreCredential, attemptRestoreSession } from '../restoreCredential';

describe('registerRestoreCredential', () => {
  it('posts the attestation and marks the user synced', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

    await registerRestoreCredential('u1');

    expect(createRestoreCredential).toHaveBeenCalledWith(JSON.stringify({ challenge: 'c' }));
    expect(api.verifyRestoreRegistration).toHaveBeenCalledWith({ id: 'cred' });
    expect(restoreCredentialFlag.markSynced).toHaveBeenCalledWith('u1');
  });

  // The flag is what stops a retry on the next launch. Setting it on a failed
  // attempt would mean the user never gets a credential and nothing ever tries again.
  it('does not mark synced when the bridge returns null', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue(null);

    await registerRestoreCredential('u1');

    expect(api.verifyRestoreRegistration).not.toHaveBeenCalled();
    expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();
  });

  it('does not mark synced when the server rejects the attestation', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreRegistration as jest.Mock).mockRejectedValue(new Error('400'));

    await expect(registerRestoreCredential('u1')).resolves.toBeUndefined();
    expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();
  });

  it('never throws when fetching options fails', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(registerRestoreCredential('u1')).resolves.toBeUndefined();
  });
});

describe('attemptRestoreSession', () => {
  it('returns the session when the assertion verifies', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreAuthentication as jest.Mock).mockResolvedValue({ accessToken: 'a' });

    await expect(attemptRestoreSession()).resolves.toEqual({ accessToken: 'a' });
  });

  it('returns null when the device has no credential', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue(null);

    await expect(attemptRestoreSession()).resolves.toBeNull();
    expect(api.verifyRestoreAuthentication).not.toHaveBeenCalled();
  });

  // This runs before the first screen is drawn. A hung native call without a
  // timeout freezes the app on the splash screen.
  it('gives up after the timeout instead of hanging the boot', async () => {
    jest.useFakeTimers();
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockReturnValue(new Promise(() => {}));

    const p = attemptRestoreSession();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('returns null when the server rejects the assertion', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreAuthentication as jest.Mock).mockRejectedValue(new Error('401'));

    await expect(attemptRestoreSession()).resolves.toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest src/features/auth/`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the two flows**

`restoreCredential.ts`. Keep both functions total: `registerRestoreCredential` resolves whatever happens, `attemptRestoreSession` resolves a session or `null`.

```typescript
import { createRestoreCredential, getRestoreCredential } from '@/services/restoreCredentials';
import { api } from '@/services/api';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';

/**
 * Bounds the Credential Manager call. This runs inside authStore.initialize(),
 * before the first screen is drawn, so an unbounded call freezes the app on the
 * splash screen — worse than the feature not working. Five seconds is a guess
 * at "slow device, cold start"; production is what will correct it. Same shape
 * of problem and answer as captureCurrentLocation's 4s race.
 */
export const RESTORE_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function registerRestoreCredential(userId: string): Promise<void> {
  try {
    const options = await api.getRestoreRegistrationOptions();
    const responseJson = await createRestoreCredential(JSON.stringify(options));
    if (!responseJson) return;
    await api.verifyRestoreRegistration(JSON.parse(responseJson));
    restoreCredentialFlag.markSynced(userId);
  } catch (e) {
    console.warn('[RestoreCredentials] registration failed:', e);
  }
}

export async function attemptRestoreSession() {
  try {
    const options = await api.getRestoreAuthenticationOptions();
    const responseJson = await withTimeout(
      getRestoreCredential(JSON.stringify(options)),
      RESTORE_TIMEOUT_MS,
    );
    if (!responseJson) return null;
    return await api.verifyRestoreAuthentication(JSON.parse(responseJson));
  } catch {
    // Every failure is the same to the caller: show the login screen.
    return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/features/auth/ && npx tsc --noEmit`
Expected: PASS, clean typecheck, pristine output.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/auth/ apps/mobile/src/stores/restoreCredentialStore.ts apps/mobile/src/services/auth.api.ts
git commit -m "ABA-465 Add restore-credential registration and restore flows"
```

---

### Task 4: Register after sign-in and on launch

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts` (`login`, `googleLogin`, and the verify-email path)
- Modify: `apps/mobile/src/hooks/useAuthenticatedBootstrap.ts`

**Interfaces:**
- Consumes: `registerRestoreCredential`, `restoreCredentialFlag` from Task 3.

- [ ] **Step 1: Fire after each sign-in**

In `authStore.login`, `authStore.googleLogin`, and wherever `verifyEmail` stores its session, after the tokens and user are written to `secureStorage`, add a fire-and-forget call. Do not await it — sign-in must not wait on Credential Manager:

```typescript
void registerRestoreCredential(user.id);
```

Read each site first: they differ in where the user object is built. Use the same `user.id` that was just stored.

- [ ] **Step 2: Register on launch for users who never sign in again**

In `useAuthenticatedBootstrap`, inside the existing `if (!isAuthenticated) return;` effect, alongside the other one-time setup:

```typescript
    const userId = useAuthStore.getState().user?.id;
    if (userId && !restoreCredentialFlag.hasSynced(userId)) {
      void registerRestoreCredential(userId);
    }
```

This is the load-bearing half of the task. Every existing user is already signed in and will not log in again, so without it the feature would reach new sign-ins and nobody else — the whole installed base would silently never get a credential.

Put it inside the existing delayed `setTimeout` block rather than firing it at mount: the boot path is already busy, and this is not urgent.

- [ ] **Step 3: Verify nothing regressed**

Run: `cd apps/mobile && npx jest src/stores src/hooks && npx tsc --noEmit`
Expected: PASS. If a store test now needs the new module mocked, add the mock — do not weaken the test.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts apps/mobile/src/hooks/useAuthenticatedBootstrap.ts
git commit -m "ABA-465 Register a restore credential after sign-in and on launch"
```

---

### Task 5: Restore the session on a fresh device

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts` (`initialize`)
- Test: `apps/mobile/src/stores/__tests__/authStoreRestore.test.ts`

**Interfaces:**
- Consumes: `attemptRestoreSession` from Task 3; `useFirstRunStore.markSeen`.

- [ ] **Step 1: Write the failing test**

Mock `attemptRestoreSession`, `secureStorage`, and the data-hydration calls. Cover:

- when `secureStorage` holds no `accessToken` and `attemptRestoreSession` resolves a session: tokens and user are written to `secureStorage`, `isAuthenticated` becomes true, and `useFirstRunStore.markSeen` is called
- when it resolves `null`: state ends exactly as before this change — `isInitializing: false`, not authenticated, `markSeen` NOT called
- when a stored session already exists: `attemptRestoreSession` is never called

That third case matters: calling Credential Manager on every launch for an already-signed-in user would be wasted work on the boot path.

Read the existing `authStore` tests first and follow their mocking style.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/stores/__tests__/authStoreRestore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `initialize()`, replace the bare no-session branch — the `else { set({ isInitializing: false }); }` that runs when there is no `accessToken` — with an attempt to restore. Keep the corrupted-stored-user branch as it is.

```typescript
          } else {
            const restored = await attemptRestoreSession();
            if (restored) {
              await applyRestoredSession(restored);
            } else {
              set({ isInitializing: false });
            }
          }
```

`applyRestoredSession` writes tokens and the user to `secureStorage` exactly as `login` does, sets the store state, and then:

```typescript
            // A restored device has an empty local SQLite until the first sync
            // pull, and useFirstRunOnboarding reads exactly that — so without
            // this a user with years of history is shown "add your first
            // expense". Restoring by credential is proof they are established.
            useFirstRunStore.getState().markSeen();
```

Then run the same data-hydration path the stored-session branch runs, so a restored user lands on a populated app rather than an empty one.

Factor the token/user/state writing so `login` and `applyRestoredSession` do not drift into storing different things — if that means extracting a small helper, do it, and say so in your report.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/stores && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts apps/mobile/src/stores/__tests__/
git commit -m "ABA-465 Restore a session from a restore credential on launch"
```

---

### Task 6: Clear the credential on sign-out

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts` (`logout`)

- [ ] **Step 1: Add the two calls**

In `logout`, inside the existing block that runs while the access token is still valid — the same place `unregisterPushNotifications` is called, and for the same reason — add the server-side delete, then clear locally regardless:

```typescript
            try {
              await api.deleteRestoreCredentials();
            } catch {
              // Offline sign-out: the server row survives, which is harmless —
              // using it would need the private key clearRestoreCredential is
              // about to destroy.
            }
```

and, outside that `if` so it runs even when there was no valid token:

```typescript
          await clearRestoreCredential();
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx jest src/stores && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "ABA-465 Clear the restore credential on sign-out"
```

---

### Task 7: Close out

- [ ] **Step 1: Full verification**

```
cd apps/mobile && npx jest && npx tsc --noEmit && npx eslint src app
cd apps/mobile/android && ./gradlew :app:compileDebugKotlin
```

All must pass. Report the actual output. Pre-existing failures unrelated to this branch must be identified as such by diffing against the merge base, not asserted.

- [ ] **Step 2: Update `CLAUDE.md`**

Extend the existing restore-credentials bullet rather than adding a second one — the server and client halves are one feature. Cover: the native module and why it is legacy Old-Arch; `androidx.credentials` 1.6.0 stable and why not the alpha; the callback APIs instead of suspend; registration firing both after sign-in **and** on launch, and why the launch path is the load-bearing one; the 5s timeout and what it protects; the first-run-onboarding interaction; and that verification comes from production (`user_restore_credentials` rows, `lastUsedAt`).

- [ ] **Step 3: Update `user_docs`**

This stage IS user-visible — a user moving to a new phone is signed in automatically. Add a short passage to the sign-in/account section of `user_docs/<lang>/` for **all nine locales**, then run `npm run generate:help` from the repo root. Never edit `apps/mobile/src/help/content.ts` by hand.

Keep the wording honest: it works on Android, when the new device was set up from a backup of the old one, and the user still needs their encryption passphrase if they use E2EE.

- [ ] **Step 4: Issue**

Follow the `finish-aba-task` skill: find the highest existing `ABA-N` across issue titles, add 1, and open an English issue. This plan's commits assume **ABA-465**; reword them if the number moved.

State plainly that the round trip has never been executed on real hardware, and name the two production signals that will confirm it.

---

## Self-review notes

- **Spec coverage.** Native module → Task 1. Bridge and stubs → Task 2. Both flows, the timeout, the per-user flag → Task 3. Registration on sign-in and on launch (decisions 2) → Task 4. Restore plus the first-run interaction (decisions 3, 4) → Task 5. Sign-out → Task 6. `E2eeUnavailableException` retry (decision 6) → Task 1 Step 3. androidx 1.6.0 (decision 1) → Task 1 Step 1. No debug keystore (decision 5) → absent by construction, recorded in the spec's follow-ups.
- **The one thing no task can deliver** is evidence that the feature works. Task 7 Step 4 makes that explicit in the issue rather than letting it go unsaid.
- **Deliberate deviation:** the spec says the E2EE retry uses `E2eeUnavailableException`; Task 1 compares the exception's simple name instead, because the class moved packages between androidx versions and a wrong import is a compile failure while a wrong name check merely skips the retry. The implementer may replace it with a real `is` check once the import path is confirmed.
