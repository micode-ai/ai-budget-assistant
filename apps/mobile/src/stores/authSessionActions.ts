/**
 * authSessionActions.ts — session-lifecycle logic (initialize/login/register/
 * googleLogin/biometricLogin/logout) extracted from authStore.ts. Functions
 * accept the store's (set, get) as params so they share state without a
 * circular import, mirroring walletBalanceActions.ts.
 */
import { Platform } from 'react-native';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency, AuthResponse } from '@budget/shared-types';
import { useAccountStore } from './accountStore';
import { useBudgetStore } from './budgetStore';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';
import { hydrateTransactions } from './hydrateTransactions';
import { useCategoryStore } from './categoryStore';
import { useWalletStore } from './walletStore';
import { useExchangeRateStore } from './exchangeRateStore';
import { useInvestmentStore } from './investmentStore';
import { useInsightsStore } from './insightsStore';
import { useGoalStore } from './goalStore';
import * as investmentRepo from '../db/investmentRepository';
import { registerRestoreCredential, attemptRestoreSession } from '../features/auth/restoreCredential';
import { clearRestoreCredential, isRestoreCredentialAvailable } from '../services/restoreCredentials';
import { resetTelemetry } from '../services/telemetry';
import { useFirstRunStore } from './firstRunStore';
import type { AuthStoreSet } from './authStore.types';

let isLoggingOut = false;

/**
 * Writes tokens and the user to secureStorage. Shared by `loginAction()` and
 * a restored session below, so the two cannot drift into storing different
 * things — `registerAction()`, `googleLoginAction()`, and
 * `verifyEmailAction()` (in `authRecoveryActions.ts`) still write the same
 * three keys inline rather than through this helper.
 */
async function persistSession(user: User, accessToken: string, refreshToken: string): Promise<void> {
  await secureStorage.setItem('accessToken', accessToken);
  await secureStorage.setItem('refreshToken', refreshToken);
  await secureStorage.setItem('user', JSON.stringify(user));
}

/**
 * Signs the user in from a session recovered via Credential Manager restore
 * (`attemptRestoreSession`) when the app starts with no stored session at
 * all — the common case on a fresh device restored from an Android backup.
 *
 * `isVerified` is read from the response, not assumed: the restore endpoint
 * (`RestoreCredentialsService`) already rejects an unverified account as
 * defence-in-depth before it ever reaches this response, and the server's
 * `buildAuthResponse` always includes the real field, so this reads it the
 * same way `loginAction()` does rather than hardcoding `true` — a hardcode
 * would silently misrepresent an unverified account if that server-side
 * guard is ever relaxed. Falls back to `true` only when the field is
 * genuinely absent, matching this path's original (pre-fix) behavior.
 *
 * Writes tokens and the user to secureStorage exactly as `loginAction()`
 * does (via `persistSession`), sets the store state, marks first-run
 * onboarding seen, and then runs the SAME data-hydration path the
 * stored-session branch of `initializeAction()` runs below, so a restored
 * user lands on a populated app rather than an empty one.
 *
 * Account setup uses `accountStore.initialize()` — the same call
 * `loginAction()` and `googleLoginAction()` make with the accounts already
 * present in the auth response — NOT `loadAccounts()`. `loadAccounts()`'s
 * premise is a populated local SQLite (the stored-session case this
 * mirrors), which a freshly restored device never has: it would read zero
 * local rows, fall through to `loadAccountsFromServer()`, re-fetch
 * `GET /accounts` for data already sent in `response.accounts`, and — worse
 * — pick `localAccounts[0]` instead of `user.defaultAccountId` and never
 * persist `currentAccountId`. For a multi-account user that can land them on
 * the wrong account after a device transfer, in an app where every screen is
 * account-scoped, and re-derive the same wrong choice on every later launch.
 * `initialize()` is also cheaper here (no extra round trip) and clears stale
 * local rows, which matches a fresh device better than a merge would.
 */
async function applyRestoredSession(
  response: AuthResponse,
  set: AuthStoreSet,
): Promise<void> {
  const user: User = {
    id: response.user.id,
    email: response.user.email,
    name: response.user.name,
    currencyCode: (response.user.currencyCode || 'USD') as Currency,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultAccountId: response.user.defaultAccountId,
    isVerified: response.user.isVerified ?? true,
    themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
    accentColor: (response.user.accentColor as string | null) ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await persistSession(user, response.accessToken, response.refreshToken);

  set({
    user,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    // Mirrors the stored-session branch of initializeAction() below
    // (`isAuthenticated: !!user.isVerified`) — an unverified account must
    // land on the verify-email screen, not skip past it, whichever path
    // restored the session.
    isAuthenticated: !!user.isVerified,
    isInitializing: false,
    hasSavedSession: false,
  });

  // A restored device has an empty local SQLite until the first sync
  // pull, and useFirstRunOnboarding reads exactly that — so without
  // this a user with years of history is shown "add your first
  // expense". Restoring by credential is proof they are established.
  useFirstRunStore.getState().markSeen();

  // Same data-hydration path the stored-session branch of initializeAction()
  // runs (see below), so a restored user lands on a populated app rather
  // than an empty one. Uses the accounts the restore response already
  // carried — see the doc comment above for why this is `initialize()`, not
  // `loadAccounts()`.
  await useAccountStore.getState().initialize(
    response.accounts,
    response.user.defaultAccountId || '',
    user.id,
  );
  await useExchangeRateStore.getState().loadRates();
  await Promise.allSettled([
    hydrateTransactions(),
    useCategoryStore.getState().loadCategories(),
    useWalletStore.getState().loadWallet(),
    useBudgetStore.getState().loadBudgets(),
  ]);
}

export async function initializeAction(set: AuthStoreSet): Promise<void> {
  set({ isInitializing: true });
  try {
    const accessToken = await secureStorage.getItem('accessToken');
    const refreshToken = await secureStorage.getItem('refreshToken');
    const userJson = await secureStorage.getItem('user');
    const biometricEnabled = await secureStorage.getItem('biometricEnabled');

    if (accessToken && userJson) {
      // Parse stored user so we can gate biometric on verification status
      let storedUser: User | null = null;
      try {
        storedUser = JSON.parse(userJson) as User;
      } catch {
        storedUser = null;
      }

      // Only gate behind biometric if the user has verified their email.
      // Unverified sessions should go straight through so the user can
      // reach the verify-email screen without a fingerprint prompt.
      // Web has no biometric (useBiometric.web is a no-op), so never gate
      // a web reload behind it — otherwise the saved session is stuck
      // waiting for a fingerprint prompt that can't fire and the user is
      // forced to log in again on every refresh.
      if (biometricEnabled === 'true' && storedUser?.isVerified && Platform.OS !== 'web') {
        // Session exists but biometric required — wait for biometric verification
        set({ hasSavedSession: true, isInitializing: false });
      } else if (storedUser) {
        const user = storedUser;
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: !!user.isVerified,
          isInitializing: false,
        });
        // Restore account context from local DB
        await useAccountStore.getState().loadAccounts();
        // Load exchange rates first so baseCurrency is set before
        // expense/income totals are computed by subscribers
        await useExchangeRateStore.getState().loadRates();
        // Load remaining data. hydrateTransactions serializes expense→income
        // to avoid SQLite contention; other stores run in parallel to it.
        await Promise.allSettled([
          hydrateTransactions(),
          useCategoryStore.getState().loadCategories(),
          useWalletStore.getState().loadWallet(),
          useBudgetStore.getState().loadBudgets(),
        ]);
      } else {
        // Stored user data was corrupted — treat as logged out
        set({ isInitializing: false });
      }
    } else {
      const restored = await attemptRestoreSession();
      if (restored) {
        await applyRestoredSession(restored, set);
      } else {
        set({ isInitializing: false });
      }
    }
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    set({ isInitializing: false });
  }
}

export async function loginAction(set: AuthStoreSet, email: string, password: string): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const response = await api.login(email, password);

    const user: User = {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      currencyCode: (response.user.currencyCode || 'USD') as Currency,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      defaultAccountId: response.user.defaultAccountId,
      isVerified: !!response.user.isVerified,
      themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
      accentColor: (response.user.accentColor as string | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await persistSession(user, response.accessToken, response.refreshToken);
    // Only enable biometric for verified users — unverified users
    // must reach the verify-email screen without a fingerprint prompt.
    if (user.isVerified) {
      await secureStorage.setItem('biometricEnabled', 'true');
    }
    // Fire-and-forget: sign-in must not wait on Credential Manager.
    // Sits after the biometricEnabled write, same relative position as
    // googleLoginAction()/verifyEmailAction() — kept consistent across all
    // three sign-in sites so the "when does this fire" answer doesn't
    // depend on which one you're reading.
    void registerRestoreCredential(user.id);

    set({
      user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      hasSavedSession: false,
    });

    // Initialize account store with accounts from auth response
    if (response.accounts) {
      await useAccountStore.getState().initialize(
        response.accounts,
        response.user.defaultAccountId || '',
        user.id,
      );
    }

    // Fetch profile to get isAdmin flag
    try {
      const profile = await api.getProfile();
      if (profile.isAdmin || profile.aiResponseMode || profile.aiModel || profile.themeMode || profile.accentColor !== undefined) {
        const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced', themeMode: profile.themeMode ?? user.themeMode, accentColor: profile.accentColor ?? null };
        set({ user: updatedUser });
        await secureStorage.setItem('user', JSON.stringify(updatedUser));
      }
    } catch { /* non-critical */ }

    // Load exchange rates first so baseCurrency is set before
    // expense/income totals are computed by subscribers
    await useExchangeRateStore.getState().loadRates();

    // Load remaining data for the new user's account.
    await Promise.allSettled([
      hydrateTransactions(),
      useCategoryStore.getState().loadCategories(),
      useWalletStore.getState().loadWallet(),
      useBudgetStore.getState().loadBudgets(),
    ]);

    // Mark as authenticated only after all data is ready so the
    // dashboard mounts with data already in the stores. Keep isLoading
    // true through the entire flow so the login UI keeps showing the
    // loader until navigation actually happens.
    set({ isAuthenticated: user.isVerified, isLoading: false });
  } catch (error) {
    // Network error — try offline login with cached session
    const isNetworkError = error instanceof TypeError
      || (error instanceof Error && (
        error.message === 'Network request failed'
        || error.message.includes('fetch')
      ));

    if (isNetworkError) {
      const cachedUserJson = await secureStorage.getItem('user');
      const cachedToken = await secureStorage.getItem('accessToken');
      if (cachedUserJson && cachedToken) {
        const cachedUser = JSON.parse(cachedUserJson) as User;
        // Only allow offline login if email matches
        if (cachedUser.email === email) {
          set({
            user: cachedUser,
            accessToken: cachedToken,
            refreshToken: await secureStorage.getItem('refreshToken'),
            hasSavedSession: false,
          });
          await useAccountStore.getState().loadAccounts();
          await useExchangeRateStore.getState().loadRates();
          await Promise.allSettled([
            hydrateTransactions(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);
          set({ isAuthenticated: true, isLoading: false });
          return;
        }
      }
    }

    set({
      error: error instanceof Error ? error.message : 'Login failed',
      isLoading: false,
    });
    throw error;
  }
}

export async function registerAction(
  set: AuthStoreSet,
  email: string,
  password: string,
  name: string,
  currencyCode?: string,
  referralCode?: string,
  language?: string,
): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const response = await api.register(email, password, name, currencyCode, referralCode, language);

    const user: User = {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      currencyCode: (response.user.currencyCode || 'USD') as Currency,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      defaultAccountId: response.user.defaultAccountId,
      isVerified: false,
      themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
      accentColor: (response.user.accentColor as string | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await secureStorage.setItem('accessToken', response.accessToken);
    await secureStorage.setItem('refreshToken', response.refreshToken);
    await secureStorage.setItem('user', JSON.stringify(user));
    // Clear biometricEnabled from any previous session so the login
    // screen does not auto-prompt fingerprint during verify-email flow.
    // It will be re-enabled after successful email verification.
    await secureStorage.removeItem('biometricEnabled');

    set({
      user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      hasSavedSession: false,
    });

    // Initialize account store with accounts from auth response
    if (response.accounts) {
      await useAccountStore.getState().initialize(
        response.accounts,
        response.user.defaultAccountId || '',
        user.id,
      );
    }

    // Load exchange rates first so baseCurrency is set before
    // expense/income totals are computed by subscribers
    await useExchangeRateStore.getState().loadRates();

    // Load remaining data for the new user's account.
    await Promise.allSettled([
      hydrateTransactions(),
      useCategoryStore.getState().loadCategories(),
      useWalletStore.getState().loadWallet(),
      useBudgetStore.getState().loadBudgets(),
    ]);

    // Mark as authenticated only after all data is ready so the
    // dashboard mounts with data already in the stores. Keep isLoading
    // true through the entire flow so the registration UI keeps
    // showing the loader until navigation actually happens.
    set({ isAuthenticated: user.isVerified, isLoading: false });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : 'Registration failed',
      isLoading: false,
    });
    throw error;
  }
}

export async function googleLoginAction(set: AuthStoreSet, idToken: string, language?: string): Promise<void> {
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
      themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
      accentColor: (response.user.accentColor as string | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await secureStorage.setItem('accessToken', response.accessToken);
    await secureStorage.setItem('refreshToken', response.refreshToken);
    await secureStorage.setItem('user', JSON.stringify(user));
    await secureStorage.setItem('biometricEnabled', 'true');
    // Fire-and-forget: sign-in must not wait on Credential Manager. Same
    // relative position (right after biometricEnabled) as loginAction()/
    // verifyEmailAction() — see the note in loginAction() above.
    void registerRestoreCredential(user.id);

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
      if (profile.isAdmin || profile.aiResponseMode || profile.aiModel || profile.themeMode || profile.accentColor !== undefined) {
        const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced', themeMode: profile.themeMode ?? user.themeMode, accentColor: profile.accentColor ?? null };
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
}

export async function biometricLoginAction(set: AuthStoreSet): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const accessToken = await secureStorage.getItem('accessToken');
    const refreshToken = await secureStorage.getItem('refreshToken');
    const userJson = await secureStorage.getItem('user');

    if (!accessToken || !userJson) {
      throw new Error('No saved session found');
    }

    const user = JSON.parse(userJson) as User;

    // Set tokens in state so api.request() can use them (not authenticated yet)
    set({
      user,
      accessToken,
      refreshToken,
      hasSavedSession: false,
    });

    // Validate session — getProfile() will trigger token refresh if accessToken is expired
    try {
      const profile = await api.getProfile();
      const updatedUser: User = {
        ...user,
        name: profile.name || user.name,
        currencyCode: (profile.currencyCode || user.currencyCode) as Currency,
        isAdmin: profile.isAdmin,
        aiResponseMode: profile.aiResponseMode || 'balanced',
        aiModel: profile.aiModel || 'balanced',
        themeMode: profile.themeMode ?? user.themeMode,
        accentColor: profile.accentColor ?? null,
      };
      set({ user: updatedUser });
      await secureStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (profileError: any) {
      // Network error — allow offline login with cached data
      const isNetworkError = profileError?.message === 'Network request failed'
        || profileError?.message?.includes('fetch')
        || profileError?.name === 'TypeError';
      if (!isNetworkError) {
        // Tokens are invalid (401) — need full re-login
        await secureStorage.removeItem('accessToken');
        await secureStorage.removeItem('refreshToken');
        await secureStorage.removeItem('user');
        await secureStorage.removeItem('biometricEnabled');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          hasSavedSession: false,
        });
        throw new Error('Session expired, please login again');
      }
      // Network error — proceed with cached user data
    }

    // Restore account context from local DB
    await useAccountStore.getState().loadAccounts();
    // Load exchange rates first so baseCurrency is set before
    // expense/income totals are computed by subscribers
    await useExchangeRateStore.getState().loadRates();
    // Load data for the user's account.
    await Promise.allSettled([
      hydrateTransactions(),
      useCategoryStore.getState().loadCategories(),
      useWalletStore.getState().loadWallet(),
      useBudgetStore.getState().loadBudgets(),
    ]);
    // Mark as authenticated only after all data is ready
    set({ isAuthenticated: true, isLoading: false });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : 'Biometric login failed',
      hasSavedSession: false,
      isLoading: false,
    });
    throw error;
  }
}

export async function logoutAction(set: AuthStoreSet): Promise<void> {
  if (isLoggingOut) return;
  isLoggingOut = true;
  try {
    // Clear push token from server before clearing auth state,
    // but only if we still have a valid token (skip when called
    // from a 401 cascade where tokens are already removed).
    const currentToken = await secureStorage.getItem('accessToken');
    if (currentToken) {
      try {
        const { unregisterPushNotifications } = await import('../services/notifications');
        await unregisterPushNotifications();
      } catch {
        // Non-critical — server token will expire naturally
      }

      // iOS/web (and an Android build with no registered native module)
      // can never have a server-side row to delete — this device could
      // never have registered one — so this would otherwise call the
      // server on every sign-out on those platforms for nothing. Same
      // defect class as the availability gate on registerRestoreCredential
      // / attemptRestoreSession above.
      if (isRestoreCredentialAvailable()) {
        try {
          await api.deleteRestoreCredentials();
        } catch {
          // Offline sign-out: the server row survives, which is harmless —
          // using it would need the private key clearRestoreCredential is
          // about to destroy.
        }
      }
    }

    // Clear the local restore credential regardless of whether the server
    // call above ran (or was skipped) — a signed-out device must never
    // offer a passkey that would silently sign the user back in on the
    // next launch. Deliberately NOT gated on isRestoreCredentialAvailable:
    // it's a local no-op on iOS/web (see the stub in
    // services/restoreCredentials), so gating it buys nothing.
    await clearRestoreCredential();

    // Drop whatever telemetry is buffered — those events belong to a session
    // that has just ended. Outside the token-valid guard above so an offline
    // sign-out still clears it, mirroring clearRestoreCredential() just above.
    resetTelemetry();

    const biometricEnabled = await secureStorage.getItem('biometricEnabled');

    // Web has no biometric (useBiometric.web is a no-op) and initializeAction()
    // never gates a web reload behind it — so on web we MUST fully clear
    // the tokens here, otherwise logout keeps them and the next refresh
    // restores the session ("logged in again after logout").
    if (biometricEnabled === 'true' && Platform.OS !== 'web') {
      // Keep tokens in storage for biometric re-login
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        hasSavedSession: true,
      });
    } else {
      await secureStorage.removeItem('accessToken');
      await secureStorage.removeItem('refreshToken');
      await secureStorage.removeItem('user');
      await secureStorage.removeItem('currentAccountId');

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        hasSavedSession: false,
      });
    }

    // Reset stores
    useAccountStore.getState().reset();
    useBudgetStore.getState().reset();
    useExpenseStore.getState().reset();
    useIncomeStore.getState().reset();
    useWalletStore.getState().reset();
    useExchangeRateStore.getState().reset();
    useInvestmentStore.getState().reset();
    useInsightsStore.getState().reset();
    useGoalStore.getState().reset();

    // Clear investment data from SQLite
    await investmentRepo.clearAllInvestments();
  } catch (error) {
    console.error('Failed to logout:', error);
  } finally {
    isLoggingOut = false;
  }
}
