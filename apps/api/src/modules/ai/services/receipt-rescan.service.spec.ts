import { ReceiptRescanService } from './receipt-rescan.service';

const flush = () => new Promise((r) => setImmediate(r));

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (...ks: string[]) => ks.forEach((k) => store.delete(k))),
    setIfAbsent: jest.fn(async (k: string) => (store.has(k) ? false : (store.set(k, true), true))),
  };
}

function row(id: string, userId = 'u1', mime: string | null = 'image/jpeg') {
  return { id, accountId: 'a1', userId, receiptMimeType: mime, user: { email: `${userId}@x.pl` } };
}

function make(rows: any[], outcome: (id: string) => string = () => 'contributed') {
  const prisma = {
    expense: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn().mockResolvedValue({ receiptImage: Buffer.from('img') }),
    },
  } as any;
  const cache = makeCache();
  const ocr = {
    parseReceipt: jest.fn().mockResolvedValue({
      scanAttestation: 'tok',
      receiptItems: [{ canonicalName: 'Mleko', quantity: 0, totalPrice: 3.5 }],
    }),
  } as any;
  const community = {
    contributeRescannedReceipt: jest.fn(async (_a: string, _u: string, id: string) => outcome(id)),
  } as any;
  const svc = new ReceiptRescanService(prisma, cache as any, ocr, community);
  (svc as any).logger = { warn: jest.fn(), log: jest.fn() };
  return { svc, prisma, cache, ocr, community };
}

describe('ReceiptRescanService', () => {
  it('only asks for recent, consenting, non-E2EE receipts and passes the OCR lines through', async () => {
    const { svc, prisma, community } = make([row('e1')]);
    await expect(svc.start({ emails: ['U1@x.pl'] })).resolves.toEqual({ started: true, candidates: 1 });
    await flush();
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.user.contributeCommunityPrices).toBe(true);
    expect(where.user.email.in).toEqual(['u1@x.pl']);
    expect(where.account).toEqual({ encryptionEnabled: false });
    expect(community.contributeRescannedReceipt).toHaveBeenCalledWith('a1', 'u1', 'e1', 'tok', [
      { canonicalName: 'Mleko', quantity: 1, totalPrice: 3.5 },
    ]);
  });

  it('dry run reads nothing', async () => {
    const { svc, ocr } = make([row('e1'), row('e2')]);
    await svc.start({ dryRun: true });
    await flush();
    expect(ocr.parseReceipt).not.toHaveBeenCalled();
    expect((await svc.lastReport())?.outcomes).toEqual({ candidate: 2 });
  });

  it('skips PDFs and stops paying for OCR once a user hits the daily cap', async () => {
    const rows = [row('pdf', 'u1', 'application/pdf'), ...Array.from({ length: 8 }, (_, i) => row(`e${i}`))];
    const { svc, ocr } = make(rows);
    await svc.start({});
    for (let i = 0; i < 20; i++) await flush();
    expect(ocr.parseReceipt).toHaveBeenCalledTimes(6);
    expect((await svc.lastReport())?.outcomes).toEqual({ not_image: 1, contributed: 6, deferred: 2 });
  });

  it('does not re-read a finished receipt on the next run, but retries a rate-limited one', async () => {
    const { svc, ocr } = make([row('done'), row('later')], (id) => (id === 'done' ? 'no_lines' : 'rate_limited'));
    await svc.start({});
    for (let i = 0; i < 10; i++) await flush();
    ocr.parseReceipt.mockClear();
    await svc.start({});
    for (let i = 0; i < 10; i++) await flush();
    expect(ocr.parseReceipt).toHaveBeenCalledTimes(1);
  });

  it('refuses a second concurrent run', async () => {
    const { svc, cache } = make([]);
    cache.store.set('cp:rescan:running', true);
    await expect(svc.start({})).resolves.toEqual({ started: false, alreadyRunning: true, candidates: 0 });
  });
});
