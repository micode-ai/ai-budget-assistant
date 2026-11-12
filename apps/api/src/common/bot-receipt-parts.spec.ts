import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  MAX_BOT_PARTS,
  MAX_BOT_PART_BYTES,
  appendPart,
  canBePart,
  continueReceiptWithPart,
  partRefusalMessage,
  pendingPointerKey,
  withReceiptLock,
} from './bot-receipt-parts';

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => (store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
    }),
    setIfAbsent: jest.fn(async (key: string) => {
      if (store.has(key)) return false;
      store.set(key, 1);
      return true;
    }),
  };
}

const part = (s = 'aGVsbG8=') => ({ imageBase64: s, mimeType: 'image/jpeg' });

describe('bot-receipt-parts', () => {
  it('exposes the limits from the spec', () => {
    expect(MAX_BOT_PARTS).toBe(4);
    expect(MAX_BOT_PART_BYTES).toBe(1_572_864);
  });

  it('builds the pointer key per chat and user under the bot prefix', () => {
    expect(pendingPointerKey('telegram', '-100', '42')).toBe('telegram:receipt-latest:-100:42');
  });

  it('appendPart writes back with cache.set and caps at 4', async () => {
    const cache = makeCache();
    cache.store.set('k', { amount: 1, parts: [part('MQ==')] });

    for (let i = 2; i <= 4; i++) {
      expect(await appendPart(cache as never, 'k', part(), 1800)).toBe('ok');
    }
    expect(cache.set).toHaveBeenCalledTimes(3);
    expect(cache.set).toHaveBeenLastCalledWith('k', expect.objectContaining({ amount: 1 }), 1800);
    const stored = cache.store.get('k') as { parts: unknown[] };
    expect(stored.parts).toHaveLength(4);
    expect(stored.parts[0]).toEqual(part('MQ==')); // order kept, part 1 first

    expect(await appendPart(cache as never, 'k', part(), 1800)).toBe('full');
    expect((cache.store.get('k') as { parts: unknown[] }).parts).toHaveLength(4);
    expect(cache.set).toHaveBeenCalledTimes(3);
  });

  it('too_large over the byte cap', async () => {
    const cache = makeCache();
    cache.store.set('k', { parts: [part()] });
    const big = Buffer.alloc(MAX_BOT_PART_BYTES + 1).toString('base64');
    expect(await appendPart(cache as never, 'k', part(big), 1800)).toBe('too_large');
    expect(cache.set).not.toHaveBeenCalled();

    const exact = Buffer.alloc(MAX_BOT_PART_BYTES).toString('base64');
    expect(await appendPart(cache as never, 'k', part(exact), 1800)).toBe('ok');
  });

  it('expired when the receipt key is gone', async () => {
    const cache = makeCache();
    expect(await appendPart(cache as never, 'gone', part(), 1800)).toBe('expired');
    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe('canBePart', () => {
  it('accepts allow-listed image types within the cap, case-insensitively', () => {
    expect(canBePart('aGVsbG8=', 'image/jpeg')).toBe(true);
    expect(canBePart('aGVsbG8=', 'IMAGE/PNG')).toBe(true);
  });

  it('refuses a PDF, a gif and anything over the byte cap', () => {
    expect(canBePart('aGVsbG8=', 'application/pdf')).toBe(false);
    expect(canBePart('aGVsbG8=', 'image/gif')).toBe(false);
    expect(canBePart(Buffer.alloc(MAX_BOT_PART_BYTES + 1).toString('base64'), 'image/jpeg')).toBe(false);
  });
});

describe('withReceiptLock', () => {
  it('runs the work holding the lock and releases it afterwards', async () => {
    const cache = makeCache();
    const work = jest.fn(async () => {
      expect(cache.store.has('lock')).toBe(true);
    });
    expect(await withReceiptLock(cache as never, 'lock', work)).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(cache.setIfAbsent).toHaveBeenCalledWith('lock', 300);
    expect(cache.store.has('lock')).toBe(false);
  });

  it('runs nothing when the lock is held', async () => {
    const cache = makeCache();
    cache.store.set('lock', 1);
    const work = jest.fn();
    expect(await withReceiptLock(cache as never, 'lock', work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(cache.store.has('lock')).toBe(true);
  });

  it('releases the lock when the work throws', async () => {
    const cache = makeCache();
    await expect(
      withReceiptLock(cache as never, 'lock', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(cache.store.has('lock')).toBe(false);
  });
});

type Stored = { userId: string; accountId: string; amount: number; parts: Array<{ imageBase64: string; mimeType: string }> };

describe('continueReceiptWithPart', () => {
  const read = { amount: 99, fingerprint: 'fp' };
  function setup(parts = 1) {
    const cache = makeCache();
    cache.store.set('r', {
      userId: 'u',
      accountId: 'a',
      amount: 1,
      caption: 'cap',
      parts: Array.from({ length: parts }, (_, i) => part(Buffer.from(`p${i + 1}`).toString('base64'))),
    });
    const subscriptions = {
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
      refundAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const ocr = { parseReceiptParts: jest.fn().mockResolvedValue(read) };
    const deps = { cache: cache as never, subscriptions: subscriptions as never, ocr: ocr as never };
    const args = {
      receiptKey: 'r',
      part: part('bmV3'),
      userId: 'u',
      accountId: 'a',
      ttlSec: 1800,
      onCharged: jest.fn().mockResolvedValue(undefined),
      onAppended: jest.fn().mockResolvedValue(undefined),
      apply: (current: Stored, receipt: { amount: number }) => ({ ...current, amount: receipt.amount }),
    };
    return { cache, subscriptions, ocr, deps, args };
  }

  it('charges 2.0, reads all parts in one call and writes the result', async () => {
    const h = setup();
    const res = await continueReceiptWithPart<Stored>(h.deps, h.args);
    expect(res.status).toBe('ok');
    expect(h.subscriptions.trackAiUsage).toHaveBeenCalledWith('u', 'ocr', 2.0, 'a');
    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceiptParts.mock.calls[0][0]).toHaveLength(2);
    expect(h.ocr.parseReceiptParts.mock.calls[0][3]).toBe('cap');
    expect(h.args.onCharged).toHaveBeenCalled();
    expect(h.args.onAppended).toHaveBeenCalled();
    const stored = h.cache.store.get('r') as Stored;
    expect(stored.amount).toBe(99);
    expect(stored.parts).toHaveLength(2);
    expect(h.subscriptions.refundAiUsage).not.toHaveBeenCalled();
  });

  it('limit: nothing charged, nothing consumed', async () => {
    const h = setup();
    h.subscriptions.trackAiUsage.mockRejectedValueOnce(new ForbiddenException('limit'));
    expect(await continueReceiptWithPart<Stored>(h.deps, h.args)).toEqual({ status: 'limit' });
    expect(h.args.onCharged).not.toHaveBeenCalled();
    expect((h.cache.store.get('r') as Stored).parts).toHaveLength(1);
  });

  it.each([
    ['full', 4, 'u'],
    ['expired', 1, 'someone-else'],
  ])('refuses (%s) and refunds', async (reason, parts, userId) => {
    const h = setup(parts as number);
    const res = await continueReceiptWithPart<Stored>(h.deps, { ...h.args, userId: userId as string });
    expect(res).toEqual({ status: 'refused', reason });
    expect(h.subscriptions.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
  });

  it('unreadable: a BadRequest from the reader is refunded and rolled back', async () => {
    const h = setup();
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new BadRequestException('parts_mime'));
    expect(await continueReceiptWithPart<Stored>(h.deps, h.args)).toEqual({ status: 'refused', reason: 'unreadable' });
    expect(h.subscriptions.refundAiUsage).toHaveBeenCalledTimes(1);
    expect((h.cache.store.get('r') as Stored).parts).toHaveLength(1);
  });

  it('another model error rolls back and rethrows, unrefunded', async () => {
    const h = setup();
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new Error('down'));
    await expect(continueReceiptWithPart<Stored>(h.deps, h.args)).rejects.toThrow('down');
    expect(h.subscriptions.refundAiUsage).not.toHaveBeenCalled();
    expect((h.cache.store.get('r') as Stored).parts).toHaveLength(1);
  });

  it('superseded: a receipt gone during the read is neither rewritten nor resurrected', async () => {
    const h = setup();
    h.ocr.parseReceiptParts.mockImplementationOnce(async () => {
      h.cache.store.delete('r');
      return read;
    });
    expect(await continueReceiptWithPart<Stored>(h.deps, h.args)).toEqual({ status: 'superseded' });
    expect(h.cache.store.has('r')).toBe(false);
  });

  it('a failed read does not resurrect a receipt that is gone', async () => {
    const h = setup();
    h.ocr.parseReceiptParts.mockImplementationOnce(async () => {
      h.cache.store.delete('r');
      throw new Error('down');
    });
    await expect(continueReceiptWithPart<Stored>(h.deps, h.args)).rejects.toThrow('down');
    expect(h.cache.store.has('r')).toBe(false);
  });

  it('maps each refusal to its shared message', () => {
    expect(partRefusalMessage('full')).toEqual({ key: 'receiptPartsFull', params: { max: '4' } });
    expect(partRefusalMessage('too_large').key).toBe('receiptPartTooLarge');
    expect(partRefusalMessage('expired').key).toBe('scanRequestExpired');
    expect(partRefusalMessage('unreadable').key).toBe('receiptScanFailed');
  });
});
