import { ActivationNudgeCron, activationNudgeWindow } from './activation-nudge.cron';
import * as ni18n from '../notifications/notification-i18n';

const NOW = new Date('2026-11-10T17:00:00Z');

function make(users: Array<{ id: string }>) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValueOnce(users).mockResolvedValue([]) },
  } as any;
  const notifications = { sendToUser: jest.fn().mockResolvedValue(true) } as any;
  return { cron: new ActivationNudgeCron(prisma, notifications), prisma, notifications };
}

describe('activationNudgeWindow', () => {
  it('is the 24-hour slice of signups between 48 h and 24 h ago — one cron period, so each user is hit once', () => {
    const w = activationNudgeWindow(NOW);
    expect(w.gte.toISOString()).toBe('2026-11-08T17:00:00.000Z');
    expect(w.lt.toISOString()).toBe('2026-11-09T17:00:00.000Z');
    expect(w.lt.getTime() - w.gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('tiles consecutive daily runs with no gap and no overlap', () => {
    const today = activationNudgeWindow(NOW);
    const tomorrow = activationNudgeWindow(new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    expect(tomorrow.gte.getTime()).toBe(today.lt.getTime());
  });
});

describe('ActivationNudgeCron', () => {
  it('asks only for active, reachable, opted-in users in the window who have logged nothing', async () => {
    const { cron, prisma } = make([]);
    await cron.handleActivationNudges(NOW);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      createdAt: activationNudgeWindow(NOW),
      isActive: true,
      notifyTrackingGap: true,
      pushToken: { not: null },
      expenses: { none: { isDeleted: false } },
      incomes: { none: { isDeleted: false } },
    });
  });

  it('sends one activation_nudge per user with localized copy', async () => {
    const { cron, notifications } = make([{ id: 'u1' }, { id: 'u2' }]);
    const sent = await cron.handleActivationNudges(NOW);

    expect(sent).toBe(2);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(2);
    const [userId, title, body, data, type] = notifications.sendToUser.mock.calls[0];
    expect(userId).toBe('u1');
    expect(type).toBe('activation_nudge');
    expect(data).toEqual({});
    expect(title('pl')).toBe(ni18n.activationNudgeTitle('pl'));
    expect(body('ru')).toBe(ni18n.activationNudgeBody('ru'));
  });

  it('a failed send does not stop the run', async () => {
    const { cron, notifications } = make([{ id: 'u1' }, { id: 'u2' }]);
    notifications.sendToUser.mockRejectedValueOnce(new Error('expo down'));
    await expect(cron.handleActivationNudges(NOW)).resolves.toBe(2);
  });
});

describe('activation nudge copy', () => {
  it('exists in every language and never falls back to English for a translated one', () => {
    const langs = ['en', 'ru', 'ua', 'pl', 'es', 'fr', 'de', 'be', 'nl'] as const;
    for (const l of langs) {
      expect(ni18n.activationNudgeTitle(l)).toBeTruthy();
      expect(ni18n.activationNudgeBody(l)).toBeTruthy();
      if (l !== 'en') expect(ni18n.activationNudgeBody(l)).not.toBe(ni18n.activationNudgeBody('en'));
    }
  });
});
