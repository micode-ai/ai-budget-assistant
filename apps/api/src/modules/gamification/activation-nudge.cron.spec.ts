import {
  ACTIVATION_EMAIL_CTA_URL,
  ActivationNudgeCron,
  activationEmailWindow,
  activationNudgeWindow,
} from './activation-nudge.cron';
import { verifyUnsubscribeToken } from '../mail/email-unsubscribe';
import * as ni18n from '../notifications/notification-i18n';

const NOW = new Date('2026-11-10T17:00:00Z');

function make(users: Array<{ id: string }>) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValueOnce(users).mockResolvedValue([]) },
  } as any;
  const notifications = { sendToUser: jest.fn().mockResolvedValue(true) } as any;
  const mail = { sendActivationEmail: jest.fn().mockResolvedValue(true) } as any;
  const config = { get: jest.fn().mockReturnValue('secret') } as any;
  return { cron: new ActivationNudgeCron(prisma, notifications, mail, config), prisma, notifications, mail, config };
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

describe('ActivationNudgeCron — follow-up e-mail (ABA-738)', () => {
  const u = { id: 'u1', email: 'a@x.io', name: 'Ann', language: 'pl' };

  it('uses its own one-period window, two days after the push', () => {
    const w = activationEmailWindow(NOW);
    expect(w.gte.toISOString()).toBe('2026-11-06T17:00:00.000Z');
    expect(w.lt.toISOString()).toBe('2026-11-07T17:00:00.000Z');
    expect(w.gte.getTime()).toBe(activationNudgeWindow(NOW).gte.getTime() - 48 * 60 * 60 * 1000);
  });

  it('asks for opted-in active users in the window with nothing logged — push token not required', async () => {
    const { cron, prisma } = make([]);
    await cron.handleActivationEmails(NOW);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      createdAt: activationEmailWindow(NOW),
      isActive: true,
      onboardingEmailsEnabled: true,
      expenses: { none: { isDeleted: false } },
      incomes: { none: { isDeleted: false } },
    });
  });

  it('sends in the user language with the tagged CTA and a signed unsubscribe link', async () => {
    const { cron, mail } = make([u] as any);
    await expect(cron.handleActivationEmails(NOW)).resolves.toBe(1);
    const arg = mail.sendActivationEmail.mock.calls[0][0];
    expect(arg).toMatchObject({ to: 'a@x.io', lang: 'pl', name: 'Ann', ctaUrl: ACTIVATION_EMAIL_CTA_URL });
    const url = new URL(arg.unsubscribeUrl);
    expect(url.pathname).toBe('/api/v1/mail/unsubscribe');
    expect(verifyUnsubscribeToken(url.searchParams.get('u')!, url.searchParams.get('t')!, 'secret')).toBe(true);
  });

  it('sends nothing without a signing secret', async () => {
    const { cron, mail, config } = make([u] as any);
    config.get.mockReturnValue(undefined);
    await expect(cron.handleActivationEmails(NOW)).resolves.toBe(0);
    expect(mail.sendActivationEmail).not.toHaveBeenCalled();
  });

  it('one failed send does not stop the run and is not counted', async () => {
    const { cron, mail } = make([u, { ...u, id: 'u2' }] as any);
    mail.sendActivationEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(cron.handleActivationEmails(NOW)).resolves.toBe(1);
  });
});
