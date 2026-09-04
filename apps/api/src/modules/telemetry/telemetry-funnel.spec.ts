import { TelemetryService, MAX_FUNNEL_ROWS } from './telemetry.service';

type Row = {
  name: string;
  screen: string | null;
  props: unknown;
  sessionId: string;
  createdAt: Date;
};

function makeService(rows: Row[]) {
  const prisma = {
    telemetryEvent: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  return { service: new TelemetryService(prisma as never), prisma };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 12, minutes));

describe('TelemetryService.getFunnel', () => {
  it('counts each flow by status', async () => {
    const { service } = makeService([
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'started' }, sessionId: 'a', createdAt: at(0) },
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'started' }, sessionId: 'b', createdAt: at(1) },
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'abandoned' }, sessionId: 'a', createdAt: at(2) },
      { name: 'action', screen: null, props: { flow: 'expense_manual', status: 'completed' }, sessionId: 'b', createdAt: at(3) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.flows).toEqual([
      { flow: 'expense_receipt', started: 2, completed: 0, abandoned: 1, failed: 0 },
      { flow: 'expense_manual', started: 0, completed: 1, abandoned: 0, failed: 0 },
    ]);
  });

  it('ignores an action row with an unrecognised status instead of creating a stray key', async () => {
    const { service } = makeService([
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'started' }, sessionId: 'a', createdAt: at(0) },
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'weird' }, sessionId: 'a', createdAt: at(1) },
    ]);

    const out = await service.getFunnel(30);

    // The bad row must not throw, and must not add a stray `weird` key to the row.
    expect(out.flows).toEqual([
      { flow: 'expense_receipt', started: 1, completed: 0, abandoned: 0, failed: 0 },
    ]);
  });

  it('counts screen views most-viewed first and ignores other event names', async () => {
    const { service } = makeService([
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'a', createdAt: at(0) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'a', createdAt: at(1) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'b', createdAt: at(2) },
      { name: 'session_start', screen: null, props: null, sessionId: 'b', createdAt: at(3) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.screens).toEqual([
      { screen: 'expense/new', views: 2 },
      { screen: '(tabs)/index', views: 1 },
    ]);
  });

  it('ignores a screen_view with no screen instead of counting a null key', async () => {
    const { service } = makeService([
      { name: 'screen_view', screen: null, props: null, sessionId: 'g', createdAt: at(0) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'g', createdAt: at(1) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.screens).toEqual([{ screen: 'expense/new', views: 1 }]);
    expect(out.lastScreens).toEqual([{ screen: 'expense/new', views: 1 }]);
  });

  it('reports the screen each session ended on — where people leave', async () => {
    const { service } = makeService([
      // session a: index -> receipt, left on receipt
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'a', createdAt: at(0) },
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'a', createdAt: at(5) },
      // session b: receipt -> index, left on index
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'b', createdAt: at(1) },
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'b', createdAt: at(9) },
      // session c: left on receipt
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'c', createdAt: at(2) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.lastScreens).toEqual([
      { screen: 'expense/receipt', views: 2 },
      { screen: '(tabs)/index', views: 1 },
    ]);
  });

  it('keeps the last screen even when sessions start differently — a first-wins fold would disagree', async () => {
    const { service } = makeService([
      // session d: new -> index   (last = index, first = new)
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'd', createdAt: at(0) },
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'd', createdAt: at(5) },
      // session e: receipt -> index   (last = index, first = receipt)
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'e', createdAt: at(1) },
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'e', createdAt: at(6) },
    ]);

    const out = await service.getFunnel(30);

    // Last-wins: both sessions ended on the tab bar.
    expect(out.lastScreens).toEqual([{ screen: '(tabs)/index', views: 2 }]);
    // A first-wins fold would have produced two rows of 1 here instead.
  });

  it('breaks an exact-timestamp tie in favour of the later row', async () => {
    const { service } = makeService([
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'f', createdAt: at(3) },
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'f', createdAt: at(3) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.lastScreens).toEqual([{ screen: '(tabs)/index', views: 1 }]);
  });

  it('asks the database only for the requested window', async () => {
    const { service, prisma } = makeService([]);

    const out = await service.getFunnel(7);

    const since = prisma.telemetryEvent.findMany.mock.calls[0][0].where.createdAt.gte as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(7);
    expect(out.days).toBe(7);
  });

  it('clamps a nonsense window instead of scanning the whole table', async () => {
    const { service, prisma } = makeService([]);

    const out = await service.getFunnel(9999);

    const since = prisma.telemetryEvent.findMany.mock.calls[0][0].where.createdAt.gte as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(90);
    expect(out.days).toBe(90);
  });

  // The window clamp alone bounds the DATE range, not the ROW count. Without a
  // `take`, a busy 90-day window materialises every row as a JS object against
  // a 768 MB heap, and an OOM here takes the whole API down (the ABA-163
  // precedent). These pin the ceiling and the honesty about hitting it.
  it('caps the rows it will materialise, newest first', async () => {
    const { service, prisma } = makeService([]);

    await service.getFunnel(90);

    const args = prisma.telemetryEvent.findMany.mock.calls[0][0];
    expect(args.take).toBe(MAX_FUNNEL_ROWS);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('reports truncated when the ceiling is reached, and not when it is not', async () => {
    // The ceiling is a parameter so this needs 2 rows, not 200 000.
    const rows = [
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'a', createdAt: at(1) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'b', createdAt: at(0) },
    ];

    const atCeiling = await makeService(rows).service.getFunnel(30, 2);
    expect(atCeiling.truncated).toBe(true);
    // Truncated or not, the aggregation still has to be correct.
    expect(atCeiling.screens).toEqual([{ screen: 'expense/new', views: 2 }]);

    const underCeiling = await makeService(rows).service.getFunnel(30, 3);
    expect(underCeiling.truncated).toBe(false);
  });
});
