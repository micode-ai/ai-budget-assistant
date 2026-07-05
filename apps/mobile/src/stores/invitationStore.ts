import { create } from 'zustand';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';
import type { MyInvitation } from '@/services/accounts.api';

interface InvitationState {
  invitations: MyInvitation[];
  isLoading: boolean;

  loadInvitations: () => Promise<void>;
  respond: (id: string, action: 'accept' | 'decline') => Promise<void>;
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  invitations: [],
  isLoading: false,

  async loadInvitations() {
    set({ isLoading: true });
    try {
      const invitations = await api.getMyInvitations();
      set({ invitations, isLoading: false });
    } catch (e) {
      // Offline or server error — keep whatever we had; this store is server-backed only.
      console.warn('Failed to load invitations:', e);
      set({ isLoading: false });
    }
  },

  async respond(id, action) {
    const { invitations } = get();
    const previous = invitations;
    set({ invitations: invitations.filter((i) => i.id !== id) });
    try {
      await api.respondToInvitation(id, action);
    } catch (e) {
      set({ invitations: previous });
      throw e;
    }
    // Accepting adds a membership on the server — refresh the account list so the
    // joined account (including trip accounts) appears immediately in the switcher.
    // Best-effort: a reload failure must not undo the already-successful accept.
    if (action === 'accept') {
      try {
        await useAccountStore.getState().loadAccountsFromServer();
      } catch (e) {
        console.warn('Failed to refresh accounts after accepting invitation:', e);
      }
    }
  },
}));
