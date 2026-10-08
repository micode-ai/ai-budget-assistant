import { create } from 'zustand';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';
import { confirmOutcome, isFeatureUnavailable } from '@/features/inboundMail/inboundMail';
import { clearInboundDocumentCache, deleteInboundDocumentCache } from '@/features/inboundMail/documentUri';
import type {
  InboundMailAddressResponse,
  InboundReceiptDetail,
  InboundReceiptListItem,
} from '@budget/shared-types';

/**
 * Server-only store for e-mail receipts (ABA-644): the items are server-born and
 * the document must be downloaded to confirm, so there is no SQLite mirror and no
 * sync queue (same reasoning as `groupStore`). Reset on sign-out through the auth
 * sign-out reset list.
 *
 * `availability` is the feature gate: a 404 on the address/list/count routes means
 * the server flag is off, and every entry point (settings row, inbox, banner) hides.
 * A network failure leaves it `unknown` - it must never hide the feature.
 *
 * `locallySaved` holds items the user already turned into an expense whose
 * `POST /confirm` has not been acknowledged yet (the expense may not have synced
 * when the call first ran, which the server answers with 404). They are hidden from
 * the lists immediately and the confirm is retried until it lands.
 */
export type InboundAvailability = 'unknown' | 'available' | 'unavailable';

interface InboundReceiptState {
  availability: InboundAvailability;
  address: InboundMailAddressResponse | null;
  /** `true` once `GET /inbound-mail/address` answered (a null address is a valid answer). */
  addressLoaded: boolean;
  pending: InboundReceiptListItem[];
  handled: InboundReceiptListItem[];
  pendingCount: number;
  /** Account the lists above were loaded for. */
  loadedAccountId: string | null;
  isLoading: boolean;
  error: string | null;
  locallySaved: Record<string, string>;

  probe: () => Promise<void>;
  loadAddress: () => Promise<void>;
  createAddress: () => Promise<void>;
  setTarget: (accountId: string) => Promise<void>;
  rotateAddress: () => Promise<void>;
  disableAddress: () => Promise<void>;
  loadInbox: () => Promise<void>;
  loadCount: () => Promise<void>;
  getDetail: (id: string) => Promise<InboundReceiptDetail>;
  dismiss: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  /** Records the expense created from an item and confirms it on the server. */
  markSaved: (id: string, expenseId: string) => Promise<void>;
  flushLocallySaved: () => Promise<void>;
  reset: () => void;
}

const initial = {
  availability: 'unknown' as InboundAvailability,
  address: null as InboundMailAddressResponse | null,
  addressLoaded: false,
  pending: [] as InboundReceiptListItem[],
  handled: [] as InboundReceiptListItem[],
  pendingCount: 0,
  loadedAccountId: null as string | null,
  isLoading: false,
  error: null as string | null,
  locallySaved: {} as Record<string, string>,
};

const CONFIRM_RETRY_DELAYS_MS = [2000, 6000, 15000];

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Request failed';
}

function without(map: Record<string, string>, id: string): Record<string, string> {
  const next = { ...map };
  delete next[id];
  return next;
}

export const useInboundReceiptStore = create<InboundReceiptState>()((set, get) => {
  const currentAccountId = () => useAccountStore.getState().currentAccountId;
  let flushing = false;

  /** A 404 on a gate route flips the feature off; anything else is just logged. */
  function noteFailure(label: string, e: unknown) {
    if (isFeatureUnavailable(e)) {
      set({ availability: 'unavailable', address: null, pending: [], handled: [], pendingCount: 0 });
      return;
    }
    console.warn(`[inboundReceiptStore] ${label} failed:`, messageOf(e));
  }

  function applyAddress(address: InboundMailAddressResponse | null) {
    set({
      address,
      addressLoaded: true,
      availability: address && address.enabled === false ? 'unavailable' : 'available',
    });
  }

  function scopeToCurrentAccount() {
    const accountId = currentAccountId();
    if (get().loadedAccountId !== accountId) {
      set({ pending: [], handled: [], pendingCount: 0, loadedAccountId: accountId });
    }
    return accountId;
  }

  async function confirmOne(id: string, expenseId: string, attempt = 0): Promise<void> {
    try {
      await api.confirmInboundReceipt(id, expenseId);
      set((s) => ({ locallySaved: without(s.locallySaved, id) }));
    } catch (e) {
      if (confirmOutcome(e) === 'drop') {
        set((s) => ({ locallySaved: without(s.locallySaved, id) }));
        return;
      }
      console.warn('[inboundReceiptStore] confirm deferred:', messageOf(e));
      const delay = CONFIRM_RETRY_DELAYS_MS[attempt];
      // Out of scheduled retries: the entry stays in `locallySaved` and the next
      // list load / banner refresh flushes it again.
      if (delay !== undefined) {
        setTimeout(() => {
          if (get().locallySaved[id]) void confirmOne(id, expenseId, attempt + 1);
        }, delay);
      }
    }
  }

  return {
    ...initial,

    probe: async () => {
      if (get().availability === 'unavailable' || get().addressLoaded) return;
      await get().loadAddress();
    },

    loadAddress: async () => {
      try {
        applyAddress((await api.getInboundMailAddress()) ?? null);
      } catch (e) {
        noteFailure('loadAddress', e);
      }
    },

    createAddress: async () => {
      try {
        applyAddress(await api.createInboundMailAddress());
      } catch (e) {
        noteFailure('createAddress', e);
        throw e;
      }
    },

    setTarget: async (accountId) => {
      try {
        applyAddress(await api.setInboundMailTarget(accountId));
      } catch (e) {
        noteFailure('setTarget', e);
        throw e;
      }
    },

    rotateAddress: async () => {
      try {
        applyAddress(await api.rotateInboundMailAddress());
      } catch (e) {
        noteFailure('rotateAddress', e);
        throw e;
      }
    },

    disableAddress: async () => {
      try {
        await api.disableInboundMailAddress();
        set({ address: null, addressLoaded: true, pending: [], handled: [], pendingCount: 0 });
      } catch (e) {
        noteFailure('disableAddress', e);
        throw e;
      }
    },

    loadInbox: async () => {
      if (get().availability === 'unavailable') return;
      const accountId = scopeToCurrentAccount();
      set({ isLoading: true, error: null });
      try {
        void get().flushLocallySaved();
        const [pending, handled] = await Promise.all([
          api.listInboundReceipts('pending'),
          api.listInboundReceipts('handled'),
        ]);
        if (currentAccountId() !== accountId) return; // switched away mid-flight
        set({ pending, handled, availability: 'available' });
      } catch (e) {
        noteFailure('loadInbox', e);
        if (!isFeatureUnavailable(e)) set({ error: messageOf(e) });
      } finally {
        set({ isLoading: false });
      }
    },

    loadCount: async () => {
      if (get().availability === 'unavailable') return;
      const accountId = scopeToCurrentAccount();
      try {
        void get().flushLocallySaved();
        const { pending } = await api.getInboundReceiptCount();
        if (currentAccountId() !== accountId) return;
        set({ pendingCount: pending, availability: 'available' });
      } catch (e) {
        noteFailure('loadCount', e);
      }
    },

    getDetail: async (id) => api.getInboundReceipt(id),

    dismiss: async (id) => {
      try {
        await api.dismissInboundReceipt(id);
        deleteInboundDocumentCache(id);
        set((s) => ({
          pending: s.pending.filter((i) => i.id !== id),
          handled: s.handled.filter((i) => i.id !== id),
          pendingCount: Math.max(0, s.pendingCount - (s.pending.some((i) => i.id === id) ? 1 : 0)),
        }));
      } catch (e) {
        console.warn('[inboundReceiptStore] dismiss failed:', messageOf(e));
        throw e;
      }
    },

    retry: async (id) => {
      try {
        await api.retryInboundReceipt(id);
        await get().loadInbox();
      } catch (e) {
        console.warn('[inboundReceiptStore] retry failed:', messageOf(e));
        throw e;
      }
    },

    markSaved: async (id, expenseId) => {
      set((s) => ({
        locallySaved: { ...s.locallySaved, [id]: expenseId },
        pendingCount: Math.max(0, s.pendingCount - (s.pending.some((i) => i.id === id) ? 1 : 0)),
      }));
      // The expense (and its receipt image) is already saved locally; the cached copy is dead weight.
      deleteInboundDocumentCache(id);
      await confirmOne(id, expenseId);
    },

    flushLocallySaved: async () => {
      if (flushing) return;
      flushing = true;
      try {
        for (const [id, expenseId] of Object.entries(get().locallySaved)) {
          await confirmOne(id, expenseId, CONFIRM_RETRY_DELAYS_MS.length);
        }
      } finally {
        flushing = false;
      }
    },

    reset: () => {
      clearInboundDocumentCache();
      set({ ...initial });
    },
  };
});
