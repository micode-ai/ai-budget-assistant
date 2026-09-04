import { TelemetryService } from './telemetry.service';

function makeService() {
  const prisma = { telemetryEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) } };
  return { service: new TelemetryService(prisma as never), prisma };
}

describe('TelemetryService.ingest', () => {
  it('writes one row per surviving event, stamping the caller as the user', async () => {
    const { service, prisma } = makeService();

    const result = await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [
        { name: 'screen_view', screen: 'expense/new' },
        { name: 'action', props: { flow: 'expense_manual', status: 'completed' } },
      ],
    } as never);

    expect(result).toEqual({ accepted: 2 });
    const rows = prisma.telemetryEvent.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      userId: 'user-1',
      name: 'screen_view',
      screen: 'expense/new',
      platform: 'web',
      sessionId: 'sess-1',
      props: undefined,
    });
  });

  it('never lets the payload choose the user', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [{ name: 'session_start', userId: 'someone-else' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].userId).toBe('user-1');
  });

  it('writes nothing at all when every event was dropped', async () => {
    const { service, prisma } = makeService();

    const result = await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [{ name: 'expense_amount', props: { amount: 42.5 } }],
    } as never);

    expect(result).toEqual({ accepted: 0 });
    expect(prisma.telemetryEvent.createMany).not.toHaveBeenCalled();
  });

  it('records only the platforms it knows, defaulting the rest to unknown', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'smart-fridge',
      sessionId: 'sess-1',
      events: [{ name: 'session_start' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].platform).toBe('unknown');
  });

  it('bounds the session id it stores', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'x'.repeat(200),
      events: [{ name: 'session_start' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].sessionId).toHaveLength(64);
  });
});
