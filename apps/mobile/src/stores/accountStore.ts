import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type {
  Account,
  AccountMember,
  AccountInvitation,
  AccountType,
  AccountRole,
  Currency,
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
      await insertAccounts(serverAccounts as Array<Account & { myRole?: AccountRole }>, userId);

      // Load from local DB to get consistent format with myRole (filtered by userId)
      const localAccounts = await loadAllAccounts(userId);

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

      const localAccounts = await loadAllAccounts(userId ?? undefined);
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

      const localAccounts = await loadAllAccounts(userId ?? undefined);
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
      const localAccounts = await loadAllAccounts(userId ?? undefined);
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
      const localAccounts = await loadAllAccounts(userId ?? undefined);
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
    } catch (error) {
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
    const localAccounts = await loadAllAccounts(userId ?? undefined);
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
