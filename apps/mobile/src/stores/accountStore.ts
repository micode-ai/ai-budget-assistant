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

      const { currentAccountId } = get();

      set({
        accounts: localAccounts,
        currentAccountId:
          currentAccountId && localAccounts.some((a) => a.id === currentAccountId)
            ? currentAccountId
            : localAccounts[0]?.id || null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load accounts',
        isLoading: false,
      });
    }
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
