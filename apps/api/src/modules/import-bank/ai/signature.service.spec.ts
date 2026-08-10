import { SignatureService, isQuarantined } from './signature.service';
import type { ColumnMapping } from '@budget/shared-types';

const MAPPING: ColumnMapping = { date: 'Data', amount: 'Kwota', description: 'Opis' };

describe('isQuarantined', () => {
  it('is false when corrections do not outnumber confirmations', () => {
    expect(isQuarantined({ confirmedCount: 0, correctedCount: 0 })).toBe(false);
    expect(isQuarantined({ confirmedCount: 3, correctedCount: 3 })).toBe(false);
  });

  it('is true once corrections outnumber confirmations', () => {
    expect(isQuarantined({ confirmedCount: 0, correctedCount: 1 })).toBe(true);
    expect(isQuarantined({ confirmedCount: 2, correctedCount: 5 })).toBe(true);
  });
});

describe('SignatureService', () => {
  const prisma = {
    bankStatementSignature: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new SignatureService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns a stored signature', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue({
      mapping: MAPPING, delimiter: ';', amountFormat: 'polish', dateFormat: 'auto',
      bankLabel: 'mBank', confirmedCount: 2, correctedCount: 0,
    });
    await expect(service.find('fp')).resolves.toEqual({
      mapping: MAPPING, delimiter: ';', amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'mBank',
    });
  });

  it('returns null when nothing is stored', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue(null);
    await expect(service.find('fp')).resolves.toBeNull();
  });

  it('returns null for a quarantined signature', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue({
      mapping: MAPPING, confirmedCount: 1, correctedCount: 4,
    });
    await expect(service.find('fp')).resolves.toBeNull();
  });

  it('upserts without resetting the counters on an existing, non-quarantined row', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue({ confirmedCount: 3, correctedCount: 1 });
    await service.record({ headerFingerprint: 'fp', mapping: MAPPING, delimiter: ',' });
    const arg = prisma.bankStatementSignature.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ headerFingerprint: 'fp' });
    expect(arg.create).toMatchObject({ headerFingerprint: 'fp', confirmedCount: 0, correctedCount: 0 });
    expect(arg.update).not.toHaveProperty('confirmedCount');
    expect(arg.update).not.toHaveProperty('correctedCount');
  });

  it('upserts without resetting the counters when there is no existing row yet', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue(null);
    await service.record({ headerFingerprint: 'fp', mapping: MAPPING, delimiter: ',' });
    const arg = prisma.bankStatementSignature.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty('confirmedCount');
    expect(arg.update).not.toHaveProperty('correctedCount');
  });

  it('resets both counters to zero when re-recording an already-quarantined signature', async () => {
    // correctedCount(4) > confirmedCount(1) — quarantined.
    prisma.bankStatementSignature.findUnique.mockResolvedValue({ confirmedCount: 1, correctedCount: 4 });
    await service.record({ headerFingerprint: 'fp', mapping: MAPPING, delimiter: ',' });
    const arg = prisma.bankStatementSignature.upsert.mock.calls[0][0];
    expect(arg.update).toMatchObject({ confirmedCount: 0, correctedCount: 0 });
  });

  // Full lifecycle, with a mock that actually holds state across calls
  // (rather than a fresh assertion per call) so the quarantine → find()=null
  // → record() → find() != null sequence is exercised end to end, exactly as
  // the fix is meant to behave in production.
  it('quarantines once corrections outnumber confirmations, and clears when the fingerprint is re-recorded', async () => {
    const row: { confirmedCount: number; correctedCount: number; mapping?: unknown } = {
      confirmedCount: 0,
      correctedCount: 0,
    };
    prisma.bankStatementSignature.findUnique.mockImplementation(async () => ({ ...row }));
    prisma.bankStatementSignature.update.mockImplementation(async ({ data }: any) => {
      const [field] = Object.keys(data) as ('confirmedCount' | 'correctedCount')[];
      row[field] += data[field].increment;
    });
    prisma.bankStatementSignature.upsert.mockImplementation(async ({ update }: any) => {
      Object.assign(row, update);
    });

    await service.confirm('fp');
    await service.confirm('fp'); // confirmedCount: 2
    await service.markCorrected('fp');
    await service.markCorrected('fp');
    await service.markCorrected('fp'); // correctedCount: 3 > confirmedCount: 2 -> quarantined

    await expect(service.find('fp')).resolves.toBeNull();

    // A fresh AI inference for the same fingerprint re-records it — this must
    // give the corrected mapping a clean slate, not inherit the counts that
    // quarantined the old one.
    await service.record({ headerFingerprint: 'fp', mapping: MAPPING });

    expect(row.confirmedCount).toBe(0);
    expect(row.correctedCount).toBe(0);
    await expect(service.find('fp')).resolves.not.toBeNull();
  });

  it('increments confirmations', async () => {
    await service.confirm('fp');
    expect(prisma.bankStatementSignature.update).toHaveBeenCalledWith({
      where: { headerFingerprint: 'fp' },
      data: { confirmedCount: { increment: 1 } },
    });
  });

  it('increments corrections', async () => {
    await service.markCorrected('fp');
    expect(prisma.bankStatementSignature.update).toHaveBeenCalledWith({
      where: { headerFingerprint: 'fp' },
      data: { correctedCount: { increment: 1 } },
    });
  });

  it('never throws when the row to increment is gone', async () => {
    prisma.bankStatementSignature.update.mockRejectedValue(new Error('P2025'));
    await expect(service.confirm('missing')).resolves.toBeUndefined();
  });
});
