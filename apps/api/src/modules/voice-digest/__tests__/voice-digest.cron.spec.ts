import { VoiceDigestCron } from '../voice-digest.cron';

const NOW = new Date('2026-09-28T08:05:00.000Z'); // Monday 08:05 UTC

function userRow(o: {
  id: string;
  timezone?: string;
  day?: number;
  hour?: number;
  lastSentAt?: Date | null;
}) {
  return {
    id: o.id,
    timezone: o.timezone ?? 'UTC',
    voiceDigestDay: o.day ?? 1, // Monday
    voiceDigestHour: o.hour ?? 8,
    voiceDigestLastSentAt: o.lastSentAt ?? null,
  };
}

function make(o: { pages?: any[][]; setIfAbsentImpl?: (key: string) => Promise<boolean> } = {}) {
  const pages = o.pages ?? [[]];
  let call = 0;
  const prisma: any = {
    user: {
      findMany: jest.fn().mockImplementation(async () => {
        const page = pages[call] ?? [];
        call += 1;
        return page;
      }),
    },
  };

  const cache: any = {
    setIfAbsent: o.setIfAbsentImpl ? jest.fn().mockImplementation(o.setIfAbsentImpl) : jest.fn().mockResolvedValue(true),
  };

  const service: any = {
    runForUser: jest.fn().mockResolvedValue('sent'),
  };

  const cron = new VoiceDigestCron(prisma, cache, service);
  return { cron, prisma, cache, service };
}

describe('VoiceDigestCron.run', () => {
  it('runs a due user with a free lock and returns the attempted count', async () => {
    const { cron, service, cache } = make({ pages: [[userRow({ id: 'u1' })]] });

    const attempted = await cron.run(NOW);

    expect(attempted).toBe(1);
    expect(cache.setIfAbsent).toHaveBeenCalledWith('vd:u1:2026-W40', 8 * 24 * 60 * 60);
    expect(service.runForUser).toHaveBeenCalledWith('u1', { now: NOW });
  });

  it('skips a user who is not due yet', async () => {
    const { cron, service } = make({ pages: [[userRow({ id: 'u1', hour: 20 })]] });

    const attempted = await cron.run(NOW);

    expect(attempted).toBe(0);
    expect(service.runForUser).not.toHaveBeenCalled();
  });

  it('skips a user whose lock is already taken and still runs one whose lock is free', async () => {
    const { cron, service } = make({
      pages: [[userRow({ id: 'locked' }), userRow({ id: 'free' })]],
      setIfAbsentImpl: async (key: string) => !key.includes('locked'),
    });

    const attempted = await cron.run(NOW);

    expect(attempted).toBe(1);
    expect(service.runForUser).toHaveBeenCalledTimes(1);
    expect(service.runForUser).toHaveBeenCalledWith('free', { now: NOW });
  });

  it('does not stop the run when one user throws', async () => {
    const { cron, service } = make({ pages: [[userRow({ id: 'bad' }), userRow({ id: 'good' })]] });
    service.runForUser.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const attempted = await cron.run(NOW);

    expect(attempted).toBe(2);
    expect(service.runForUser).toHaveBeenCalledWith('good', { now: NOW });
  });

  it('defaults now to the current time when omitted', async () => {
    const { cron, service } = make({ pages: [[]] });
    await cron.run();
    expect(service.runForUser).not.toHaveBeenCalled();
  });
});

/**
 * A `user.findMany` double that honours what Prisma actually does: applies
 * `where` (voiceDigestEnabled, the lastSentAt OR, `id.gt`), orders by id,
 * resolves `cursor` as "rows with id >= cursor that match the filter" and
 * then applies `skip` — so a cursor row that stopped matching the filter
 * makes `skip: 1` drop the NEXT row, exactly like the real query.
 */
function filteringPrisma(rows: Array<ReturnType<typeof userRow> & { voiceDigestEnabled: boolean }>) {
  const matches = (r: (typeof rows)[number], where: any): boolean => {
    if (where.voiceDigestEnabled !== undefined && r.voiceDigestEnabled !== where.voiceDigestEnabled) return false;
    if (where.id?.gt !== undefined && !(r.id > where.id.gt)) return false;
    if (where.OR) {
      const ok = where.OR.some((c: any) =>
        c.voiceDigestLastSentAt === null
          ? r.voiceDigestLastSentAt === null
          : r.voiceDigestLastSentAt !== null && r.voiceDigestLastSentAt < c.voiceDigestLastSentAt.lt,
      );
      if (!ok) return false;
    }
    return true;
  };
  return {
    user: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        let list = rows.filter((r) => matches(r, args.where)).sort((a, b) => (a.id < b.id ? -1 : 1));
        if (args.cursor) list = list.filter((r) => r.id >= args.cursor.id);
        list = list.slice(args.skip ?? 0, (args.skip ?? 0) + args.take);
        return list.map((r) => ({ ...r }));
      }),
    },
  };
}

describe('VoiceDigestCron.run — pagination while rows are being sent', () => {
  it('still processes the first row of page 2 after the last row of page 1 was sent', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      ...userRow({ id: `u${String(i).padStart(4, '0')}` }),
      voiceDigestEnabled: true,
    }));
    const prisma = filteringPrisma(rows);
    const cache: any = { setIfAbsent: jest.fn().mockResolvedValue(true) };
    const service: any = {
      runForUser: jest.fn().mockImplementation(async (id: string, opts: { now: Date }) => {
        const row = rows.find((r) => r.id === id)!;
        row.voiceDigestLastSentAt = opts.now; // what a real send stamps
        return 'sent';
      }),
    };
    const cron = new VoiceDigestCron(prisma as any, cache, service);

    const attempted = await cron.run(NOW);

    expect(attempted).toBe(501);
    expect(service.runForUser).toHaveBeenCalledWith('u0500', { now: NOW });
  });

  it('still processes the next row when the cursor row got disabled (blocked) mid-run', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      ...userRow({ id: `u${String(i).padStart(4, '0')}` }),
      voiceDigestEnabled: true,
    }));
    const prisma = filteringPrisma(rows);
    const cache: any = { setIfAbsent: jest.fn().mockResolvedValue(true) };
    const service: any = {
      runForUser: jest.fn().mockImplementation(async (id: string) => {
        rows.find((r) => r.id === id)!.voiceDigestEnabled = false;
        return 'blocked';
      }),
    };
    const cron = new VoiceDigestCron(prisma as any, cache, service);

    await cron.run(NOW);

    expect(service.runForUser).toHaveBeenCalledWith('u0500', { now: NOW });
  });

  it('skips a user sent within the resend guard (checked in JS, not in SQL)', async () => {
    const recent = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const prisma = filteringPrisma([{ ...userRow({ id: 'u1', lastSentAt: recent }), voiceDigestEnabled: true }]);
    const service: any = { runForUser: jest.fn() };
    const cron = new VoiceDigestCron(prisma as any, { setIfAbsent: jest.fn().mockResolvedValue(true) } as any, service);

    await cron.run(NOW);

    expect(service.runForUser).not.toHaveBeenCalled();
  });
});
