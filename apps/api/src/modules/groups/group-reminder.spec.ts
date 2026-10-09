import {
  CLOSED_STATE,
  nextReminderState,
  pickPerUser,
  reminderSign,
  reminderStateChanged,
  REMINDER_MAX_PER_EPISODE,
  type ReminderCandidate,
  type ReminderState,
} from './group-reminder';

const day = (n: number, hour = 17) => new Date(Date.UTC(2026, 9, 1 + n, hour));
const open = (since: number, sign: number, extra: Partial<ReminderState> = {}): ReminderState => ({
  balanceOpenSince: day(since),
  balanceOpenSign: sign,
  lastReminderAt: null,
  reminderCount: 0,
  ...extra,
});

describe('reminderSign', () => {
  it('treats anything under 1.00 as closed', () => {
    expect(reminderSign(0)).toBe(0);
    expect(reminderSign(0.99)).toBe(0);
    expect(reminderSign(-0.99)).toBe(0);
    expect(reminderSign(1)).toBe(1);
    expect(reminderSign(-1)).toBe(-1);
  });
});

describe('nextReminderState', () => {
  it('opens an episode on the first sight of an open balance, with no push that day', () => {
    const step = nextReminderState(CLOSED_STATE, -42, day(0));
    expect(step.due).toBe(false);
    expect(step.next).toEqual({ balanceOpenSince: day(0), balanceOpenSign: -1, lastReminderAt: null, reminderCount: 0 });
  });

  it('is due 7 days after the episode opened, not on day 6', () => {
    expect(nextReminderState(open(0, -1), -42, day(6)).due).toBe(false);
    expect(nextReminderState(open(0, -1), -42, day(7)).due).toBe(true);
  });

  it('counts whole UTC days, so a run a few minutes earlier in the day still counts as day 7', () => {
    expect(nextReminderState(open(0, -1), -42, day(7, 0)).due).toBe(true);
  });

  it('is due 7 days after the previous reminder', () => {
    const s = open(0, 1, { lastReminderAt: day(7), reminderCount: 1 });
    expect(nextReminderState(s, 54, day(13)).due).toBe(false);
    expect(nextReminderState(s, 54, day(14)).due).toBe(true);
  });

  it(`stops after ${REMINDER_MAX_PER_EPISODE} reminders in one episode`, () => {
    const s = open(0, -1, { lastReminderAt: day(28), reminderCount: REMINDER_MAX_PER_EPISODE });
    expect(nextReminderState(s, -42, day(60)).due).toBe(false);
  });

  it('never twice on the same UTC day', () => {
    const s = open(0, -1, { lastReminderAt: day(7), reminderCount: 1 });
    expect(nextReminderState(s, -42, day(7, 23)).due).toBe(false);
  });

  it('resets everything when the balance closes (under the 1.00 floor)', () => {
    const s = open(0, -1, { lastReminderAt: day(14), reminderCount: 2 });
    const step = nextReminderState(s, -0.5, day(15));
    expect(step.due).toBe(false);
    expect(step.next).toEqual(CLOSED_STATE);
  });

  it('a sign flip starts a new episode with a fresh count', () => {
    const s = open(0, -1, { lastReminderAt: day(14), reminderCount: 2 });
    const step = nextReminderState(s, 20, day(15));
    expect(step.due).toBe(false);
    expect(step.next).toEqual({ balanceOpenSince: day(15), balanceOpenSign: 1, lastReminderAt: null, reminderCount: 0 });
  });

  it('leaves the state unchanged inside an episode', () => {
    const s = open(0, -1);
    expect(reminderStateChanged(s, nextReminderState(s, -42, day(3)).next)).toBe(false);
  });
});

describe('pickPerUser', () => {
  const c = (groupId: string, net: number): ReminderCandidate => ({
    userId: 'u1',
    memberId: `m-${groupId}`,
    groupId,
    groupName: groupId,
    currencyCode: 'PLN',
    net,
    prev: CLOSED_STATE,
  });

  it('keeps the group with the largest absolute balance', () => {
    const best = new Map<string, ReminderCandidate>();
    pickPerUser(best, c('g1', -10));
    pickPerUser(best, c('g2', 30));
    pickPerUser(best, c('g3', -20));
    expect(best.get('u1')!.groupId).toBe('g2');
  });

  it('breaks a tie on the lower group id, so reruns pick the same group', () => {
    const best = new Map<string, ReminderCandidate>();
    pickPerUser(best, c('g2', -10));
    pickPerUser(best, c('g1', 10));
    expect(best.get('u1')!.groupId).toBe('g1');
  });
});
