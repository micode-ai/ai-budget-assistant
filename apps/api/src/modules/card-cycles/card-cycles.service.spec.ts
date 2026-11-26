import { CardCyclesService, resolveDue } from './card-cycles.service';
import { CardCycleReminderCron } from './card-cycle-reminder.cron';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('CardCyclesService', () => {
  it('sums the current cycle with the card currency filter and computes utilisation', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { amount: 500 } });
    const svc = new CardCyclesService({ expense: { aggregate } } as never);
    const s = await svc.buildSummary(
      { accountId: 'a1', currencyCode: 'PLN', statementDay: 12, dueDay: 27, creditLimit: 2000 },
      d(2026, 11, 28),
    );
    expect(s.cycleStart).toBe('2026-11-13');
    expect(s.cycleEnd).toBe('2026-12-12');
    expect(s.utilisation).toBeCloseTo(0.25);
    expect(aggregate.mock.calls[0][0].where).toMatchObject({
      accountId: 'a1',
      currencyCode: 'PLN',
      isPlanned: false,
      isSplitReceivable: false,
      isDeleted: false,
    });
    // closed statement (11-12) was due 11-27, already past on 11-28
    expect(s.statementAmount).toBeNull();
    expect(s.dueDate).toBe('2026-12-27');
  });

  it('null utilisation without a limit', async () => {
    const svc = new CardCyclesService({ expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) } } as never);
    const s = await svc.buildSummary(
      { accountId: 'a1', currencyCode: 'PLN', statementDay: 12, dueDay: 27, creditLimit: null },
      d(2026, 11, 20),
    );
    expect(s.utilisation).toBeNull();
    expect(s.spent).toBe(0);
    expect(s.statementAmount).toBe(0);
    expect(s.dueDate).toBe('2026-11-27');
  });

  it('resolveDue points at the closed statement while it is payable', () => {
    expect(resolveDue(d(2026, 11, 20), 12, 27).closedIsPayable).toBe(true);
  });
});

describe('CardCycleReminderCron', () => {
  const setting = (over = {}) => ({
    id: 's1', accountId: 'a1', currencyCode: 'PLN', statementDay: 12, dueDay: 27,
    lastRemindedDueDate: null, account: { name: 'Visa', ownerId: 'u1', isActive: true }, ...over,
  });
  const make = (amount: number) => {
    const update = jest.fn().mockResolvedValue({});
    const sendToUser = jest.fn().mockResolvedValue(true);
    const cron = new CardCycleReminderCron(
      { cardCycleSetting: { update } } as never,
      { sendToUser } as never,
      { spentBetween: jest.fn().mockResolvedValue(amount) } as never,
    );
    return { cron, update, sendToUser };
  };

  it('pushes exactly 3 days before the due date and records it', async () => {
    const { cron, update, sendToUser } = make(1840);
    expect(await cron.remindOne(setting(), d(2026, 11, 24))).toBe(true);
    expect(update).toHaveBeenCalled();
    expect(sendToUser).toHaveBeenCalledWith('u1', expect.any(Function), expect.any(Function), { accountId: 'a1' }, 'debt_reminder');
  });

  it('does not push on other days, twice, or for an empty statement', async () => {
    expect(await make(10).cron.remindOne(setting(), d(2026, 11, 23))).toBe(false);
    expect(await make(10).cron.remindOne(setting({ lastRemindedDueDate: d(2026, 11, 27) }), d(2026, 11, 24))).toBe(false);
    const empty = make(0);
    expect(await empty.cron.remindOne(setting(), d(2026, 11, 24))).toBe(false);
    expect(empty.sendToUser).not.toHaveBeenCalled();
  });
});
