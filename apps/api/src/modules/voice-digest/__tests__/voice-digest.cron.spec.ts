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
