import { create } from 'zustand';
import { api } from '@/services/api';
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
  },
}));
