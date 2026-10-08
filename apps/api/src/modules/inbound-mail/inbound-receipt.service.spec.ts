import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InboundReceiptService } from './inbound-receipt.service';
import { inboundDedupKey } from './inbound-mail.util';

const TOKEN = 'abcdefghijklmnop';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 1)]);

function setup(flag: string | null = 'true') {
  const prisma: any = {
    inboundReceipt: {
      create: jest.fn().mockResolvedValue({ id: 'rec-1' }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    expense: { findFirst: jest.fn() },
  };
  const cache: any = {
    peekWindow: jest.fn().mockResolvedValue(0),
    incrementWindow: jest.fn().mockResolvedValue(1),
  };
  const config: any = { get: (k: string) => ({ INBOUND_MAIL_ENABLED: flag })[k] };
  const addresses: any = {
    resolveActive: jest.fn().mockResolvedValue({
      id: 'addr-1',
      userId: 'user-1',
      token: TOKEN,
      targetAccountId: 'acc-1',
      accountTier: 0,
    }),
  };
  const processor: any = { process: jest.fn().mockResolvedValue(undefined) };
  const duplicates: any = {
    findByFingerprint: jest.fn().mockResolvedValue(null),
    findLikely: jest.fn().mockResolvedValue(null),
  };
  const service = new InboundReceiptService(prisma, cache, config, addresses, processor, duplicates);
  (service as any).logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  return { prisma, cache, addresses, processor, duplicates, service };
}

const payload = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  remoteIp: '203.0.113.9',
  helo: 'mail.example.com',
  envelopeFrom: 'bounce@shop.pl',
  auth: { spf: 'pass', dkim: ['pass'], dmarc: 'pass', arc: 'none' },
  messageIdHash: 'a'.repeat(64),
  fromAddress: 'sklep@shop.pl',
  subject: 'Paragon',
  date: null,
  kind: 'receipt',
  document: { kind: 'pdf', mimeType: 'application/pdf', base64: PDF.toString('base64'), contentHash: 'x'.repeat(64) },
  ignoredAttachmentCount: 0,
  ...over,
});

describe('InboundReceiptService.ingest', () => {
  it('404s and does nothing while the flag is off', async () => {
    const { prisma, addresses, service } = setup(null);

    await expect(service.ingest(payload())).rejects.toBeInstanceOf(NotFoundException);
    expect(addresses.resolveActive).not.toHaveBeenCalled();
    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload with 400', async () => {
    const { service } = setup();
    await expect(service.ingest({ token: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s for a token that no longer resolves (rotated, disabled, tier 2, demoted)', async () => {
    const { addresses, service } = setup();
    addresses.resolveActive.mockResolvedValue(null);
    await expect(service.ingest(payload())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists the row scoped to the address owner and target account, then processes it off-path', async () => {
    const { prisma, processor, cache, service } = setup();

    await expect(service.ingest(payload())).resolves.toEqual({ id: 'rec-1' });

    const data = prisma.inboundReceipt.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'user-1',
      accountId: 'acc-1',
      kind: 'receipt',
      documentKind: 'pdf',
      documentMime: 'application/pdf',
      // L2: the dedup identity is (Message-ID hash, content hash), folded into the unique column.
      messageIdHash: inboundDedupKey('a'.repeat(64), createHash('sha256').update(PDF.toString('base64')).digest('hex')),
    });
    expect(processor.process).toHaveBeenCalledWith('rec-1');
    expect(cache.incrementWindow).toHaveBeenCalledWith(`inmail:tok:${TOKEN}:h`, 3_600_000);
    expect(cache.incrementWindow).toHaveBeenCalledWith(`inmail:tok:${TOKEN}:d`, 86_400_000);
  });

  it('dedup: the same Message-ID + content (unique violation) is a 409 and is not processed', async () => {
    const { prisma, processor, service } = setup();
    prisma.inboundReceipt.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.ingest(payload())).rejects.toBeInstanceOf(ConflictException);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('recomputes the file fingerprint server-side (SHA-256 of the base64 text), ignoring the container hash', async () => {
    const { prisma, service } = setup();

    await service.ingest(payload());

    const expected = createHash('sha256').update(PDF.toString('base64')).digest('hex');
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data.contentHash).toBe(expected);
  });

  it('decides the document kind from magic bytes: an .exe sent as a PDF is recorded unsupported (422)', async () => {
    const { prisma, processor, service } = setup();
    const bad = payload({ document: { kind: 'pdf', mimeType: 'application/pdf', filename: 'receipt.pdf', base64: EXE.toString('base64'), contentHash: 'y'.repeat(64) } });

    await expect(service.ingest(bad)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data).toMatchObject({ status: 'unsupported' });
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data.document).toBeUndefined();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('a PDF declared as image/jpeg is still treated as a PDF', async () => {
    const { prisma, service } = setup();
    await service.ingest(payload({ document: { kind: 'image', mimeType: 'image/jpeg', base64: PDF.toString('base64'), contentHash: 'z'.repeat(64) } }));
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data).toMatchObject({ documentKind: 'pdf', documentMime: 'application/pdf' });
  });

  it('a message with no document at all is recorded unsupported (422)', async () => {
    const { prisma, service } = setup();
    await expect(service.ingest(payload({ document: undefined }))).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data.status).toBe('unsupported');
  });

  it('stores a text body with its own content hash and no bytes', async () => {
    const { prisma, service } = setup();
    await service.ingest(payload({ document: { kind: 'text', mimeType: 'text/plain', text: 'Razem 12,50 PLN', contentHash: 'q'.repeat(64) } }));

    const data = prisma.inboundReceipt.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ documentKind: 'text', documentText: 'Razem 12,50 PLN' });
    expect(data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.contentHash).not.toBe('q'.repeat(64));
  });

  it('retention: 30 days normally, 7 days for a tier-1 account, 30 minutes for a verification', async () => {
    const { prisma, addresses, service } = setup();
    const days = (n: number) => n * 24 * 3600 * 1000;
    const span = (i: number) => prisma.inboundReceipt.create.mock.calls[i][0].data.expiresAt.getTime() - Date.now();

    await service.ingest(payload());
    expect(span(0)).toBeGreaterThan(days(30) - 5000);
    expect(span(0)).toBeLessThanOrEqual(days(30));

    addresses.resolveActive.mockResolvedValue({ id: 'a', userId: 'user-1', token: TOKEN, targetAccountId: 'acc-1', accountTier: 1 });
    await service.ingest(payload({ messageIdHash: 'b'.repeat(64) }));
    expect(span(1)).toBeLessThanOrEqual(days(7));
    expect(span(1)).toBeGreaterThan(days(7) - 5000);

    await service.ingest(
      payload({ messageIdHash: 'c'.repeat(64), kind: 'forwarding_verification', verificationCode: '123456789', document: undefined }),
    );
    expect(span(2)).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(span(2)).toBeGreaterThan(30 * 60 * 1000 - 5000);
  });

  it('captures a Gmail verification code (no document stored) and hands the row to the processor', async () => {
    const { prisma, processor, service } = setup();

    await service.ingest(payload({ kind: 'forwarding_verification', verificationCode: '987654321', document: undefined }));

    expect(prisma.inboundReceipt.create.mock.calls[0][0].data).toMatchObject({
      kind: 'forwarding_verification',
      verificationCode: '987654321',
    });
    expect(prisma.inboundReceipt.create.mock.calls[0][0].data.document).toBeUndefined();
    expect(processor.process).toHaveBeenCalledWith('rec-1');
  });

  it('refuses a verification message without a numeric code, and a non-numeric code outright', async () => {
    const { service } = setup();
    await expect(service.ingest(payload({ kind: 'forwarding_verification', document: undefined }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.ingest(payload({ kind: 'forwarding_verification', verificationCode: '12ab56', document: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate limit: a token over its hourly or daily cap gets 429 and nothing is stored', async () => {
    const { prisma, cache, service } = setup();
    cache.incrementWindow.mockImplementation(async (k: string) => (k.endsWith(':h') ? 21 : 1));

    const err = await service.ingest(payload()).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
  });

  it('rate limit fails CLOSED: Redis down is a 503 and nothing is stored', async () => {
    const { prisma, cache, service } = setup();
    cache.incrementWindow.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.ingest(payload())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
  });
});

describe('InboundReceiptService — ownership (IDOR)', () => {
  const owned = (over: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    status: 'pending',
    kind: 'receipt',
    fromAddress: 'a@shop.pl',
    subject: 's',
    documentKind: 'pdf',
    documentMime: 'application/pdf',
    document: Buffer.from('x'),
    documentText: null,
    extraction: { amount: 12.5, currencyCode: 'PLN', merchant: 'Shop', date: '2026-10-01', fingerprint: 'f'.repeat(64) },
    verificationCode: null,
    expenseId: null,
    errorCode: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    expiresAt: new Date('2026-10-31T10:00:00Z'),
    ...over,
  });

  it('every :id lookup filters on id AND userId AND accountId, and a miss is 404 (never 403)', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(null);

    await expect(service.detail('acc-1', 'user-1', 'rec-9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.document('acc-1', 'user-1', 'rec-9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.confirm('acc-1', 'user-1', 'rec-9', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.dismiss('acc-1', 'user-1', 'rec-9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.retry('acc-1', 'user-1', 'rec-9')).rejects.toBeInstanceOf(NotFoundException);

    for (const call of prisma.inboundReceipt.findFirst.mock.calls) {
      expect(call[0].where).toEqual({ id: 'rec-9', userId: 'user-1', accountId: 'acc-1' });
    }
  });

  it("another user's confirm never reaches an update", async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(null);

    await expect(service.confirm('acc-1', 'attacker', 'rec-1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
    expect(prisma.expense.findFirst).not.toHaveBeenCalled();
  });

  it("another user's dismiss never reaches an update", async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(null);

    await expect(service.dismiss('acc-1', 'attacker', 'rec-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('confirm resolves a client id inside the account, links the server PK, and nulls the document; the write is owner-scoped', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValueOnce(owned()).mockResolvedValue(null);
    prisma.expense.findFirst.mockResolvedValue({ id: 'server-pk' });

    await service.confirm('acc-1', 'user-1', 'rec-1', 'client-id');

    expect(prisma.expense.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', isDeleted: false, OR: [{ id: 'client-id' }, { clientId: 'client-id' }] },
      select: { id: true },
    });
    expect(prisma.inboundReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', userId: 'user-1', accountId: 'acc-1', status: 'pending' },
      data: { status: 'confirmed', expenseId: 'server-pk', document: null, documentText: null },
    });
  });

  it('confirm 404s when the expense is not in the caller account', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned());
    prisma.expense.findFirst.mockResolvedValue(null);

    await expect(service.confirm('acc-1', 'user-1', 'rec-1', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('confirm is idempotent on an already-confirmed row', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'confirmed' }));

    await expect(service.confirm('acc-1', 'user-1', 'rec-1', 'e1')).resolves.toBeUndefined();
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('confirm refuses a row that is not awaiting confirmation (e.g. duplicate)', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'duplicate' }));

    await expect(service.confirm('acc-1', 'user-1', 'rec-1', 'e1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('dismiss nulls the document and never downgrades a confirmed row', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned());

    await service.dismiss('acc-1', 'user-1', 'rec-1');
    expect(prisma.inboundReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', userId: 'user-1', accountId: 'acc-1', status: { not: 'confirmed' } },
      data: { status: 'dismissed', document: null, documentText: null },
    });

    prisma.inboundReceipt.updateMany.mockClear();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'confirmed' }));
    await service.dismiss('acc-1', 'user-1', 'rec-1');
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('list and count are scoped to userId AND accountId (a co-member never sees them) and exclude verification rows', async () => {
    const { prisma, service } = setup();

    await service.list('acc-1', 'user-1', 'pending');
    await service.countPending('acc-1', 'user-1');

    expect(prisma.inboundReceipt.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      accountId: 'acc-1',
      kind: 'receipt',
      status: 'pending',
    });
    expect(prisma.inboundReceipt.count.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      accountId: 'acc-1',
      kind: 'receipt',
      status: 'pending',
    });
  });

  it('handled segment lists duplicate / not_a_receipt / quota_exceeded / unsupported / failed', async () => {
    const { prisma, service } = setup();
    await service.list('acc-1', 'user-1', 'handled');
    expect(prisma.inboundReceipt.findMany.mock.calls[0][0].where.status).toEqual({
      in: ['duplicate', 'not_a_receipt', 'quota_exceeded', 'unsupported', 'failed'],
    });
  });

  it('detail recomputes possibleDuplicate (no AI) from the stored extraction', async () => {
    const { prisma, duplicates, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned());
    duplicates.findLikely.mockResolvedValue({ kind: 'likely', expenseId: 'e1' });

    const detail = await service.detail('acc-1', 'user-1', 'rec-1');

    expect(duplicates.findByFingerprint).toHaveBeenCalledWith('acc-1', 'f'.repeat(64));
    expect(duplicates.findLikely).toHaveBeenCalledWith('acc-1', expect.objectContaining({ amount: 12.5, currencyCode: 'PLN' }));
    expect(detail.possibleDuplicate).toEqual({ kind: 'likely', expenseId: 'e1' });
    expect(detail).toMatchObject({ total: 12.5, merchant: 'Shop', fromDomain: 'shop.pl', hasDocument: true });
  });

  it('document is 410 once nulled', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ document: null, documentText: null, status: 'confirmed' }));

    await expect(service.document('acc-1', 'user-1', 'rec-1')).rejects.toBeInstanceOf(GoneException);
  });

  it('retry only from quota_exceeded/failed, and only while the document is still stored', async () => {
    const { prisma, processor, service } = setup();

    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'pending' }));
    await expect(service.retry('acc-1', 'user-1', 'rec-1')).rejects.toBeInstanceOf(ConflictException);

    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'failed', document: null, documentText: null }));
    await expect(service.retry('acc-1', 'user-1', 'rec-1')).rejects.toBeInstanceOf(GoneException);

    prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ status: 'quota_exceeded' }));
    await service.retry('acc-1', 'user-1', 'rec-1');
    expect(processor.process).toHaveBeenCalledWith('rec-1', { prepaid: true });
  });
});

describe('InboundReceiptService — audit hardening', () => {
  const owned = (over: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    status: 'pending',
    kind: 'receipt',
    fromAddress: 'a@shop.pl',
    subject: 's',
    documentKind: 'pdf',
    documentMime: 'application/pdf',
    document: Buffer.from('x'),
    documentText: null,
    extraction: { amount: 12.5, currencyCode: 'PLN', fingerprint: 'f'.repeat(64) },
    verificationCode: null,
    expenseId: null,
    errorCode: null,
    authDmarc: 'pass',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    expiresAt: new Date('2026-10-31T10:00:00Z'),
    ...over,
  });

  // M7: the cap is a reservation (INCR then compare), not peek-then-increment.
  it('reserves the cap atomically BEFORE storing: N parallel messages cannot all pass a stale peek', async () => {
    const { prisma, cache, service } = setup();
    const order: string[] = [];
    cache.incrementWindow.mockImplementation(async () => (order.push('incr'), 1));
    prisma.inboundReceipt.create.mockImplementation(async () => (order.push('create'), { id: 'rec-1' }));

    await service.ingest(payload());

    expect(order).toEqual(['incr', 'incr', 'create']);
    expect(cache.peekWindow).not.toHaveBeenCalled();
  });

  it('the 21st message in the hour (INCR returns 21) is refused with 429 and nothing is stored', async () => {
    const { prisma, cache, service } = setup();
    cache.incrementWindow.mockImplementation(async (k: string) => (k.endsWith(':h') ? 21 : 1));
    const err = await service.ingest(payload()).catch((e) => e);
    expect(err.getStatus()).toBe(429);
    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
  });

  it('the 20th message (INCR returns exactly the cap) is still accepted', async () => {
    const { cache, service } = setup();
    cache.incrementWindow.mockImplementation(async (k: string) => (k.endsWith(':h') ? 20 : 60));
    await expect(service.ingest(payload())).resolves.toEqual({ id: 'rec-1' });
  });

  // L2
  it('the same Message-ID with a different body gets a different dedup key; identical content keeps the same one', async () => {
    const { prisma, service } = setup();
    const other = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 2)]);
    await service.ingest(payload());
    await service.ingest(
      payload({ document: { kind: 'pdf', mimeType: 'application/pdf', base64: other.toString('base64'), contentHash: 'x'.repeat(64) } }),
    );
    await service.ingest(payload());
    const keys = prisma.inboundReceipt.create.mock.calls.map((c: any) => c[0].data.messageIdHash);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toBe(keys[2]);
  });

  // M1
  it('a new forwarding code removes every older one for that user (only the latest is kept)', async () => {
    const { prisma, service } = setup();

    await service.ingest(payload({ kind: 'forwarding_verification', verificationCode: '111111111', document: undefined }));

    expect(prisma.inboundReceipt.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', kind: 'forwarding_verification', id: { not: 'rec-1' } },
    });
  });

  it('an ordinary receipt never deletes verification rows', async () => {
    const { prisma, service } = setup();
    await service.ingest(payload());
    expect(prisma.inboundReceipt.deleteMany).not.toHaveBeenCalled();
  });

  // M7: surface DMARC
  it('detail reports senderVerified only for an aligned DMARC pass', async () => {
    const { prisma, service } = setup();
    for (const [dmarc, expected] of [['pass', true], ['PASS', true], ['fail', false], ['none', false], [null, false]] as const) {
      prisma.inboundReceipt.findFirst.mockResolvedValue(owned({ authDmarc: dmarc }));
      const detail = await service.detail('acc-1', 'user-1', 'rec-1');
      expect(detail.senderVerified).toBe(expected);
    }
  });

  // L5
  it('confirm refuses an expense already linked to another inbound receipt', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValueOnce(owned()).mockResolvedValueOnce({ id: 'rec-other' });
    prisma.expense.findFirst.mockResolvedValue({ id: 'server-pk' });

    await expect(service.confirm('acc-1', 'user-1', 'rec-1', 'e1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.inboundReceipt.findFirst.mock.calls[1][0].where).toEqual({ expenseId: 'server-pk', id: { not: 'rec-1' } });
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('confirm treats a soft-deleted expense as not found (the lookup filters isDeleted:false)', async () => {
    const { prisma, service } = setup();
    prisma.inboundReceipt.findFirst.mockResolvedValue(owned());
    prisma.expense.findFirst.mockResolvedValue(null);

    await expect(service.confirm('acc-1', 'user-1', 'rec-1', 'deleted')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.expense.findFirst.mock.calls[0][0].where.isDeleted).toBe(false);
  });
});
