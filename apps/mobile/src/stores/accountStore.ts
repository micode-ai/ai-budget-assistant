import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import { tripApi } from '../services/trip.api';
import type {
  Account,
  AccountMember,
  AccountInvitation,
  AccountRole,
  Currency,
  SettleMethod,
} from '@budget/shared-types';
import type { CreateAccountDto, UpdateAccountDto, CreateInvitationDto } from '@budget/shared-types';
import {
  loadAllAccounts,
  insertAccounts,
  updateAccountInDb,
  deleteAccountFromDb,
  insertAccount,
  loadMembersByAccountId,
  insertMembers,
  deleteMembersByAccountId,
  clearAllAccounts,
} from '@/db/accountRepository';
import { clearAllExpenses } from '@/db/expenseRepository';
import { clearAllWalletBalances } from '@/db/walletRepository';
import { clearAllExchanges } from '@/db/currencyExchangeRepository';
import { usePriceHistoryStore } from './priceHistoryStore';
import { useMerchantRulesStore } from './merchantRulesStore';
import { useTagStore } from './tagStore';
import { useProjectStore } from './projectStore';
import { useChatStore } from './chatStore';

interface AccountState {
  accounts: (Account & { myRole: AccountRole })[];
  currentAccountId: string | null;
  members: Record<string, AccountMember[]>;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: (accounts: Account[], defaultAccountId: string, userId: string) => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  loadAccounts: () => Promise<void>;
  loadAccountsFromServer: () => Promise<void>;
  /** Re-fetch the account list only when it is empty (see the implementation). */
  ensureAccountsLoaded: () => Promise<void>;
  createAccount: (dto: CreateAccountDto) => Promise<Account>;
  updateAccount: (id: string, dto: UpdateAccountDto) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Trip accounts
  createTripAccount: (
    name: string,
    tripEndDate: string,
    currencyCode: Currency,
    tripStartDate?: string,
  ) => Promise<Account>;
  archiveTrip: (accountId: string, force?: boolean) => Promise<void>;
  updatePaymentInfo: (
    accountId: string,
    paymentMethod: SettleMethod,
    paymentHandle: string,
  ) => Promise<void>;

  // Members & Invitations
  loadMembers: (accountId: string) => Promise<AccountMember[]>;
  inviteMember: (accountId: string, dto: CreateInvitationDto) => Promise<AccountInvitation>;
  removeMember: (accountId: string, memberId: string) => Promise<void>;
  updateMemberRole: (accountId: string, memberId: string, role: AccountRole) => Promise<void>;
  acceptInvitation: (inviteCode: string) => Promise<void>;
  declineInvitation: (inviteCode: string) => Promise<void>;
  leaveAccount: (accountId: string) => Promise<void>;

  // Selectors
  currentAccount: () => (Account & { myRole: AccountRole }) | null;
  canEdit: () => boolean;
  isOwner: () => boolean;
  clearError: () => void;
  reset: () => void;
}

/**
 * In-memory caches of data the server scopes to `X-Account-Id`, torn down the
 * moment the active account changes.
 *
 * This lives here, at the account boundary, rather than in each screen that
 * reads one of these stores, for the same reason sign-out tears its stores
 * down in one block inside `logoutAction`: `priceHistoryStore` is read by both
 * the analytics screen and Settings -> Products, and two components each
 * clearing one store on `[currentAccountId]` is how they come to fight over
 * it in an order that depends on mount timing. Screens keep only the *refill*
 * half — a load effect keyed on `[currentAccountId]`.
 *
 * It is invoked from the subscription at the bottom of this file, NOT from
 * each action that reassigns `currentAccountId` — see the comment there for
 * why the callers cannot be enumerated reliably.
 *
 * **`tagStore`/`projectStore` (wave 4, ABA-512).** These were nearly left out
 * on the theory that a synchronous reset could strand `ExpenseCreateForm.tsx`
 * / `IncomeCreateForm.tsx` with a permanently empty `TagPicker`/`ProjectPicker`
 * if an account switch landed while one was open. That theory does not
 * survive reading the two forms: both call `loadTags()`/`loadProjects()` in a
 * mount-only effect, and both are conditionally-rendered dialogs on desktop
 * (`{dialog === 'expense' && <CreateDialog .../>}`) and pushed screens on
 * mobile — so the real cost of a reset firing mid-edit is "this already-open
 * form's picker is empty until it is closed and reopened", not permanent. It
 * is also a narrower window than it looks: `CreateDialog`/`ExpenseDialog` are
 * RN `Modal`s whose scrim is a full-viewport `position: fixed` element, which
 * sits over `WebTopBar` and makes the account-switcher pill itself unreachable
 * by pointer while any of these dialogs is open — the account can still move
 * from underneath one (a background `loadAccountsFromServer` fallback), just
 * not by the obvious click path.
 *
 * Against that bounded cost, the alternative was worse, not merely
 * un-fixed: without a reset, `loadTags()`/`loadProjects()` still run (both
 * are already keyed on `[currentAccountId]` in every long-lived screen that
 * reads them), but on web `tagRepo.getAllTags`/`projectRepo.getAllProjects`
 * resolve near-instantly to `[]` (SQLite is an in-memory no-op mock there —
 * see `db/client.web.ts`), so the *actual* prior sequence was: the previous
 * account's rows, rendered in a pane whose whole purpose is managing the
 * CURRENT account's rows, until that promise resolves — then empty until the
 * fire-and-forget `api.getTags()`/equivalent server call completes a real
 * network round trip. Resetting here removes the "wrong account's rows on
 * screen" phase entirely and replaces it with an immediate, honest "empty,
 * loading" state — the corrected read of what this decision was trading away.
 *
 * **`chatStore` (ABA-513).** A `ChatConversation` carries an `accountId`, so
 * it belongs here for the same reason as the four above it: without this,
 * switching accounts left the previous account's conversation list, messages
 * and `currentConversationId` on screen, and a composer that would still post
 * into the account just switched away from. Unlike `tagStore`/`projectStore`,
 * `chatStore.reset()` is ALSO called explicitly from `logoutAction` — a
 * conversation is sensitive enough (it can contain another person's name,
 * amounts, anything the user typed) that sign-out teardown should not depend
 * on the side effect of `accountStore.reset()` nulling `currentAccountId` and
 * this subscription happening to fire as a result. That mirrors
 * `priceHistoryStore`/`merchantRulesStore`, which are reset in both places
 * too, not `tagStore`/`projectStore`, which rely on the subscription alone.
 */
function clearAccountScopedCaches() {
  usePriceHistoryStore.getState().reset();
  useMerchantRulesStore.getState().reset();
  useTagStore.getState().reset();
  useProjectStore.getState().reset();
  useChatStore.getState().reset();
}

async function getCurrentUserId(): Promise<string | null> {
  const userJson = await secureStorage.getItem('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson).id;
  } catch {
    return null;
  }
}

// Normalize a server account payload into the in-memory shape the store uses.
// Used as a fallback when the local SQLite read-back returns no rows — notably
// on web, where SQLite is a no-op mock, so the round-trip through the local DB
// would otherwise drop the accounts the API just returned.
function toAccountWithRole(
  account: Account & { myRole?: AccountRole },
  userId: string | null,
): Account & { myRole: AccountRole } {
  const myRole: AccountRole =
    account.myRole ?? (userId && account.ownerId === userId ? 'owner' : 'editor');
  return {
    ...account,
    myRole,
    createdAt: account.createdAt ? new Date(account.createdAt) : new Date(),
    updatedAt: account.updatedAt ? new Date(account.updatedAt) : new Date(),
  };
}

/**
 * Read the account list back from SQLite after a write.
 *
 * On web `db/client.web.ts` is an in-memory no-op mock, so the read-back comes
 * back empty no matter what was just written. Assigning that straight into
 * state blanks the account list — which is what stranded users on
 * "Account not found" immediately after saving an account setting. Every write
 * path here has that shape, so they all go through this.
 *
 * `whenEmpty` is the caller's own answer for that case, built from what it
 * already knows: the row the API just returned, or the previous list with the
 * write applied.
 */
async function readBackAccounts(
  userId: string | undefined,
  whenEmpty: () => (Account & { myRole: AccountRole })[],
): Promise<(Account & { myRole: AccountRole })[]> {
  const local = await loadAllAccounts(userId);
  return local.length > 0 ? local : whenEmpty();
}

// Pure helper: days remaining until an active trip's end date. Returns null
// for non-trip accounts, non-active trips, or accounts missing tripEndDate.
export function getTripDaysLeft(account: {
  type: string;
  tripStatus?: string;
  tripEndDate?: string;
}): number | null {
  if (account.type !== 'trip' || account.tripStatus !== 'active' || !account.tripEndDate) {
    return null;
  }
  const end = new Date(account.tripEndDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - today.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export const useAccountStore = create<AccountState>()((set, get) => ({
  accounts: [],
  currentAccountId: null,
  members: {},
  isLoading: false,
  error: null,

  initialize: async (serverAccounts, defaultAccountId, userId) => {
    try {
      // Clear all previous user's data from SQLite
      await clearAllAccounts();
      await clearAllExpenses();
      await clearAllWalletBalances();
      await clearAllExchanges();
      // Save accounts to local DB
      await insertAccounts(serverAccounts as (Account & { myRole?: AccountRole })[], userId);

      // Load from local DB to get consistent format with myRole (filtered by userId)
      let localAccounts = await loadAllAccounts(userId);

      // Web (no real SQLite) returns nothing from the read-back — fall back to
      // the server payload so the accounts the API returned are still shown.
      if (localAccounts.length === 0 && serverAccounts.length > 0) {
        localAccounts = serverAccounts.map((a) =>
          toAccountWithRole(a as Account & { myRole?: AccountRole }, userId),
        );
      }

      const currentId = defaultAccountId || localAccounts[0]?.id || null;

      set({
        accounts: localAccounts,
        currentAccountId: currentId,
      });

      // Persist current account selection
      if (currentId) {
        await secureStorage.setItem('currentAccountId', currentId);
      }
    } catch (error) {
      console.error('Failed to initialize accounts:', error);
    }
  },

  switchAccount: async (accountId) => {
    const { accounts } = get();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    set({ currentAccountId: accountId });
    await secureStorage.setItem('currentAccountId', accountId);
  },

  loadAccounts: async () => {
    try {
      const userId = await getCurrentUserId();
      const localAccounts = await loadAllAccounts(userId ?? undefined);

      // No local accounts for this user (e.g. after migration) — refresh from server
      if (localAccounts.length === 0 && userId) {
        await get().loadAccountsFromServer();
        return;
      }

      const savedAccountId = await secureStorage.getItem('currentAccountId');

      set({
        accounts: localAccounts,
        currentAccountId:
          savedAccountId && localAccounts.some((a) => a.id === savedAccountId)
            ? savedAccountId
            : localAccounts[0]?.id || null,
      });

      // Local-first paint above is instant; now reconcile with the server in the
      // background so a membership added server-side (e.g. accepting an invitation,
      // possibly on another device) appears without a manual sync — the previous
      // behaviour only re-fetched when there were zero local accounts, so a newly
      // joined account never showed up on restart.
      void get().loadAccountsFromServer().catch(() => {});
    } catch (error) {
      console.error('Failed to load accounts from SQLite:', error);
    }
  },

  loadAccountsFromServer: async () => {
    set({ isLoading: true, error: null });
    try {
      const serverAccounts = await api.getAccounts();
      const userId = await getCurrentUserId();

      if (userId) {
        await clearAllAccounts();
        await insertAccounts(serverAccounts, userId);
      }

      let localAccounts = await loadAllAccounts(userId ?? undefined);

      // Web (no real SQLite) returns nothing from the read-back — fall back to
      // the server payload so the accounts the API returned are still shown.
      if (localAccounts.length === 0 && serverAccounts.length > 0) {
        localAccounts = serverAccounts.map((a) =>
          toAccountWithRole(a as Account & { myRole?: AccountRole }, userId),
        );
      }

      // The persisted selection has to be read HERE, not only in
      // `loadAccounts`. On web `db/client.web.ts` is an in-memory mock, so
      // `loadAllAccounts` always returns nothing, `loadAccounts` always takes
      // its zero-local-rows branch and returns before it reaches its own
      // `secureStorage` read — making this the only path that runs. Without
      // this, every page refresh reset the user to their first account.
      //
      // In-memory wins when it is set: the other callers (accepting an
      // invitation, Settings -> "Sync now") run with a live selection that a
      // staler stored value must not override.
      const { currentAccountId } = get();
      const desiredId = currentAccountId ?? (await secureStorage.getItem('currentAccountId'));
      const resolvedId =
        desiredId && localAccounts.some((a) => a.id === desiredId)
          ? desiredId
          : localAccounts[0]?.id || null;

      set({
        accounts: localAccounts,
        currentAccountId: resolvedId,
        isLoading: false,
      });

      // Re-persist when the stored account is gone (a membership removed
      // elsewhere), so the dead id is not looked up again on every later
      // refresh. `deleteAccount` already does this for the same reason.
      if (resolvedId && resolvedId !== desiredId) {
        await secureStorage.setItem('currentAccountId', resolvedId);
      }
    } catch (error) {
      // A failed fetch is NOT the same answer as "this user has no accounts
      // and no selection", and the difference is not cosmetic. With
      // `currentAccountId` left null, `api.setAccountIdGetter` omits the
      // `X-Account-Id` header, and the API's `AccountContextGuard` then falls
      // back to the user's DEFAULT account — so one failed `GET /accounts`
      // silently serves a different account's data (an empty dashboard for a
      // user whose selected account is full of transactions) while the
      // persisted selection still says otherwise, with nothing on screen
      // saying anything went wrong.
      //
      // The selection is local, persisted state; only the *list* failed. Put
      // it back so every later request stays addressed to the account the user
      // actually chose. Fills a null only — a live in-memory selection still
      // wins, exactly as on the success path above.
      if (!get().currentAccountId) {
        const storedId = await secureStorage.getItem('currentAccountId');
        if (storedId) {
          set({ currentAccountId: storedId });
        }
      }

      set({
        error: error instanceof Error ? error.message : 'Failed to load accounts',
        isLoading: false,
      });
    }
  },

  ensureAccountsLoaded: async () => {
    // Re-fetch only when the list is missing entirely.
    //
    // On web the account list lives in memory only (`db/client.web.ts` is an
    // in-memory mock), so it is rebuilt from `GET /accounts` on every page
    // load — and that request is made exactly once. If it fails, the switcher
    // is empty for the rest of the session with nothing that retries it, and
    // the user has no route back to their accounts from the UI at all. The
    // switcher calls this as it opens, so opening the empty menu IS the retry.
    //
    // Native normally has rows from SQLite by this point, so this is a no-op
    // there.
    if (get().accounts.length > 0 || get().isLoading) return;
    await get().loadAccountsFromServer();
  },

  createAccount: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      const newAccount = await api.createAccount(dto);
      const userId = await getCurrentUserId();
      await insertAccount(newAccount, 'owner', userId ?? undefined);

      const localAccounts = await readBackAccounts(userId ?? undefined, () => [
        ...get().accounts,
        toAccountWithRole({ ...newAccount, myRole: 'owner' }, userId),
      ]);
      set({ accounts: localAccounts, isLoading: false });

      return newAccount;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create account',
        isLoading: false,
      });
      throw error;
    }
  },

  updateAccount: async (id, dto) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.updateAccount(id, dto);
      await updateAccountInDb(id, updated);

      const userId = await getCurrentUserId();
      const localAccounts = await readBackAccounts(userId ?? undefined, () =>
        get().accounts.map((a) =>
          a.id === id ? toAccountWithRole({ ...updated, myRole: a.myRole }, userId) : a,
        ),
      );
      set({ accounts: localAccounts, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update account',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteAccount: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteAccount(id);
      await deleteAccountFromDb(id);

      const userId = await getCurrentUserId();
      const localAccounts = await readBackAccounts(userId ?? undefined, () =>
        get().accounts.filter((a) => a.id !== id),
      );
      const { currentAccountId } = get();

      set({
        accounts: localAccounts,
        currentAccountId:
          currentAccountId === id ? localAccounts[0]?.id || null : currentAccountId,
        isLoading: false,
      });

      // Update persisted selection if needed
      if (currentAccountId === id && localAccounts[0]) {
        await secureStorage.setItem('currentAccountId', localAccounts[0].id);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete account',
        isLoading: false,
      });
      throw error;
    }
  },

  // Trip accounts
  //
  // Note: archiveTrip/updatePaymentInfo patch in-memory state directly from
  // the server response rather than writing through to local SQLite. The
  // `accounts` table (accountRepository.ts) DOES persist tripStatus/
  // tripStartDate/tripEndDate (trip_status/trip_start_date/trip_end_date
  // columns), so a full reload (loadAccountsFromServer) correctly picks up
  // the authoritative row including trip fields — it re-fetches from the
  // server and round-trips through insertAccounts/loadAllAccounts, which now
  // read/write those columns instead of silently dropping them.

  createTripAccount: async (name, tripEndDate, currencyCode, tripStartDate) => {
    set({ isLoading: true, error: null });
    try {
      const account = await api.createAccount({
        name,
        type: 'trip',
        currencyCode,
        tripEndDate,
        tripStartDate,
      });
      const userId = await getCurrentUserId();
      await insertAccount(account, 'owner', userId ?? undefined);

      const localAccounts = await readBackAccounts(userId ?? undefined, () => [
        ...get().accounts,
        toAccountWithRole({ ...account, myRole: 'owner' }, userId),
      ]);
      set({ accounts: localAccounts, isLoading: false });
      return account;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create trip',
        isLoading: false,
      });
      throw error;
    }
  },

  archiveTrip: async (accountId, force) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await tripApi.archiveTrip(accountId, force);
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, ...updated } : a)),
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to archive trip',
        isLoading: false,
      });
      throw error;
    }
  },

  updatePaymentInfo: async (accountId, paymentMethod, paymentHandle) => {
    const updated = await tripApi.updatePaymentInfo(accountId, { paymentMethod, paymentHandle });
    const userId = await getCurrentUserId();
    set((state) => ({
      members: {
        ...state.members,
        [accountId]: (state.members[accountId] || []).map((m) =>
          m.userId === userId
            ? { ...m, paymentMethod: updated.paymentMethod, paymentHandle: updated.paymentHandle }
            : m,
        ),
      },
    }));
  },

  // Members & Invitations

  loadMembers: async (accountId) => {
    try {
      const serverMembers = await api.getMembers(accountId);

      // Cache in local DB
      await deleteMembersByAccountId(accountId);
      await insertMembers(serverMembers);

      set((state) => ({
        members: { ...state.members, [accountId]: serverMembers },
      }));

      return serverMembers;
    } catch {
      // Fall back to local cache
      const localMembers = await loadMembersByAccountId(accountId);
      set((state) => ({
        members: { ...state.members, [accountId]: localMembers },
      }));
      return localMembers;
    }
  },

  inviteMember: async (accountId, dto) => {
    const invitation = await api.createInvitation(accountId, dto);
    return invitation;
  },

  removeMember: async (accountId, memberId) => {
    await api.removeMember(accountId, memberId);

    set((state) => ({
      members: {
        ...state.members,
        [accountId]: (state.members[accountId] || []).filter((m) => m.id !== memberId),
      },
    }));
  },

  updateMemberRole: async (accountId, memberId, role) => {
    await api.updateMemberRole(accountId, memberId, role);

    set((state) => ({
      members: {
        ...state.members,
        [accountId]: (state.members[accountId] || []).map((m) =>
          m.id === memberId ? { ...m, role } : m,
        ),
      },
    }));
  },

  acceptInvitation: async (inviteCode) => {
    await api.acceptInvitation(inviteCode);
    // Reload accounts to include the new one
    await get().loadAccountsFromServer();
  },

  declineInvitation: async (inviteCode) => {
    await api.declineInvitation(inviteCode);
  },

  leaveAccount: async (accountId) => {
    await api.leaveAccount(accountId);
    await deleteAccountFromDb(accountId);

    const userId = await getCurrentUserId();
    const localAccounts = await readBackAccounts(userId ?? undefined, () =>
      get().accounts.filter((a) => a.id !== accountId),
    );
    const { currentAccountId } = get();

    set({
      accounts: localAccounts,
      currentAccountId:
        currentAccountId === accountId ? localAccounts[0]?.id || null : currentAccountId,
    });
  },

  // Selectors

  currentAccount: () => {
    const { accounts, currentAccountId } = get();
    return accounts.find((a) => a.id === currentAccountId) ?? null;
  },

  canEdit: () => {
    const account = get().currentAccount();
    if (!account) return false;
    if (account.tripStatus === 'archived') return false;
    return account.myRole === 'owner' || account.myRole === 'editor';
  },

  isOwner: () => {
    const account = get().currentAccount();
    if (!account) return false;
    return account.myRole === 'owner';
  },

  clearError: () => set({ error: null }),

  reset: () => {
    set({
      accounts: [],
      currentAccountId: null,
      members: {},
      isLoading: false,
      error: null,
    });
  },
}));

// Wire up account context for API client (avoids circular require)
api.setAccountIdGetter(() => useAccountStore.getState().currentAccountId);

// The account-scoped teardown is attached to the VALUE, not to the actions
// that assign it, because the assigning actions cannot be enumerated
// reliably: `currentAccountId` is written from eight places in this file, and
// a careful pass looking for exactly this found three of them. The two that
// were missed are the two that matter most — `loadAccounts` and
// `loadAccountsFromServer` both silently fall back to `localAccounts[0]` when
// the persisted selection is no longer in the list the server returned, which
// is precisely the moment the user is moved to a different account without
// asking. A `clearAccountScopedCaches()` call per caller would be one more
// thing the next writer of this field has to know about; a subscription is
// one thing that already knows.
//
// Fires synchronously inside `set()`, so the caches are empty before any
// `[currentAccountId]` effect runs and a switch cannot paint the previous
// account's data while the refetch is in flight.
//
// Skips null -> account: nothing was addressed under a real account before, so
// there is nothing belonging to one to throw away (sign-out has its own
// teardown block in `logoutAction`). Skips an unchanged value: re-selecting
// the account you are already on fires no `[currentAccountId]` effect, so a
// clear there would leave screens empty rather than stale.
useAccountStore.subscribe((state, prev) => {
  if (prev.currentAccountId === null) return;
  if (state.currentAccountId === prev.currentAccountId) return;
  clearAccountScopedCaches();
});
