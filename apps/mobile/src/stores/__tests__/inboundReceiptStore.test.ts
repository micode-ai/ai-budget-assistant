/**
 * The e-mail receipt store (ABA-644): the feature gate, and the confirm that follows
 * a local save.
 */
jest.mock('@/services/api', () => ({
  api: {
    getInboundMailAddress: jest.fn(),
    getInboundReceiptCount: jest.fn(),
    listInboundReceipts: jest.fn(),
    confirmInboundReceipt: jest.fn(),
    dismissInboundReceipt: jest.fn(),
  },
}));
jest.mock('@/features/inboundMail/documentUri', () => ({
  deleteInboundDocumentCache: jest.fn(),
  clearInboundDocumentCache: jest.fn(),
}));
jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1' }) },
}));

import { api } from '@/services/api';
import { clearInboundDocumentCache, deleteInboundDocumentCache } from '@/features/inboundMail/documentUri';
import { useInboundReceiptStore } from '../inboundReceiptStore';

const mockApi = api as unknown as Record<string, jest.Mock>;

const err = (status?: number) => Object.assign(new Error('x'), status === undefined ? {} : { status });

function row(id: string) {
  return { id, status: 'pending', kind: 'receipt' };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useInboundReceiptStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('feature gate', () => {
  // Catches: the inbox, settings row and banner staying visible after the server flag
  // went off - every route behind them answers 404.
  it('flips to unavailable on a 404 from the count route and clears the lists', async () => {
    useInboundReceiptStore.setState({ pending: [row('a')] as never, pendingCount: 3 });
    mockApi.getInboundReceiptCount.mockRejectedValue(err(404));
    await useInboundReceiptStore.getState().loadCount();
    const s = useInboundReceiptStore.getState();
    expect(s.availability).toBe('unavailable');
    expect(s.pending).toEqual([]);
    expect(s.pendingCount).toBe(0);
  });

  // Catches: one failed request (offline, 500) hiding the feature for the session.
  it('stays unknown on a network failure', async () => {
    mockApi.getInboundMailAddress.mockRejectedValue(err());
    await useInboundReceiptStore.getState().loadAddress();
    expect(useInboundReceiptStore.getState().availability).toBe('unknown');
  });

  // Catches: a user with no address yet (null body) being read as "feature off".
  it('treats a null address as available but not set up', async () => {
    mockApi.getInboundMailAddress.mockResolvedValue(null);
    await useInboundReceiptStore.getState().loadAddress();
    const s = useInboundReceiptStore.getState();
    expect(s.availability).toBe('available');
    expect(s.address).toBeNull();
    expect(s.addressLoaded).toBe(true);
  });

  // Catches: `enabled: false` in the address response not hiding the surface.
  it('reads enabled=false as unavailable', async () => {
    mockApi.getInboundMailAddress.mockResolvedValue({ address: 'a@in.ai-budget.pl', targetAccountId: 'acc-1', enabled: false });
    await useInboundReceiptStore.getState().loadAddress();
    expect(useInboundReceiptStore.getState().availability).toBe('unavailable');
  });

  // Catches: probing again (and hitting the API) once the answer is known.
  it('probes only once', async () => {
    mockApi.getInboundMailAddress.mockResolvedValue(null);
    await useInboundReceiptStore.getState().probe();
    await useInboundReceiptStore.getState().probe();
    expect(mockApi.getInboundMailAddress).toHaveBeenCalledTimes(1);
  });
});

describe('markSaved', () => {
  // Catches: a saved item staying in the count/list until the server acks, so the
  // banner still invites the user to confirm what they just saved.
  it('hides the item and drops the count at once, then clears it on ack', async () => {
    useInboundReceiptStore.setState({ pending: [row('a'), row('b')] as never, pendingCount: 2 });
    mockApi.confirmInboundReceipt.mockResolvedValue(undefined);
    await useInboundReceiptStore.getState().markSaved('a', 'exp-1');
    expect(mockApi.confirmInboundReceipt).toHaveBeenCalledWith('a', 'exp-1');
    const s = useInboundReceiptStore.getState();
    expect(s.pendingCount).toBe(1);
    expect(s.locallySaved).toEqual({});
  });

  // Catches: losing the confirm when it races the expense's own sync (404 "Expense not
  // found"): the entry must stay queued so the next load flushes it.
  it('keeps the entry queued on a 404 and flushes it on the next load', async () => {
    jest.useFakeTimers();
    try {
      mockApi.confirmInboundReceipt.mockRejectedValueOnce(err(404)).mockResolvedValue(undefined);
      await useInboundReceiptStore.getState().markSaved('a', 'exp-1');
      expect(useInboundReceiptStore.getState().locallySaved).toEqual({ a: 'exp-1' });
      await useInboundReceiptStore.getState().flushLocallySaved();
      expect(mockApi.confirmInboundReceipt).toHaveBeenCalledTimes(2);
      expect(useInboundReceiptStore.getState().locallySaved).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  // Catches: retrying forever on an answer that cannot change (409 already handled).
  it('drops the entry on a 409', async () => {
    mockApi.confirmInboundReceipt.mockRejectedValue(err(409));
    await useInboundReceiptStore.getState().markSaved('a', 'exp-1');
    expect(useInboundReceiptStore.getState().locallySaved).toEqual({});
  });
});

describe('reset', () => {
  // Catches: one user's address, inbox and gate surviving sign-out for the next sign-in.
  it('clears everything', async () => {
    useInboundReceiptStore.setState({
      availability: 'available',
      address: { address: 'a@x', targetAccountId: 'acc-1', enabled: true },
      addressLoaded: true,
      pending: [row('a')] as never,
      pendingCount: 1,
      locallySaved: { a: 'e' },
    });
    useInboundReceiptStore.getState().reset();
    const s = useInboundReceiptStore.getState();
    expect(s.availability).toBe('unknown');
    expect(s.address).toBeNull();
    expect(s.pending).toEqual([]);
    expect(s.locallySaved).toEqual({});
  });
});

describe('cached attachment cleanup', () => {
  // Catches: a copy of the receipt lingering in the app cache after the item is confirmed.
  it('deletes the cached document when an item is saved', async () => {
    mockApi.confirmInboundReceipt.mockResolvedValue(undefined);
    await useInboundReceiptStore.getState().markSaved('a', 'exp-1');
    expect(deleteInboundDocumentCache).toHaveBeenCalledWith('a');
  });

  // Catches: a dismissed receipt's image staying on the device.
  it('deletes the cached document after a successful dismiss, not after a failed one', async () => {
    mockApi.dismissInboundReceipt.mockRejectedValueOnce(err(500)).mockResolvedValue(undefined);
    await expect(useInboundReceiptStore.getState().dismiss('a')).rejects.toBeDefined();
    expect(deleteInboundDocumentCache).not.toHaveBeenCalled();
    await useInboundReceiptStore.getState().dismiss('a');
    expect(deleteInboundDocumentCache).toHaveBeenCalledWith('a');
  });

  // Catches: sign-out leaving the previous user's receipt images in the cache.
  it('clears every cached document on reset', () => {
    (clearInboundDocumentCache as jest.Mock).mockClear();
    useInboundReceiptStore.getState().reset();
    expect(clearInboundDocumentCache).toHaveBeenCalledTimes(1);
  });
});
