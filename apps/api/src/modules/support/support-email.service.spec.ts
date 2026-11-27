import { SupportEmailService, SUPPORT_EMAIL_CTA_URL } from './support-email.service';
import { signSupportUnsubscribeToken } from '../mail/email-unsubscribe';

const NOW = new Date('2026-11-28T12:00:00Z');
const H = 3600_000;

function build(over: { thread?: any; claim?: number; sendOk?: boolean | Error; secret?: string | undefined } = {}) {
  const thread = {
    id: 't1', userId: 'u1', userUnreadCount: 2,
    user: { id: 'u1', email: 'a@b.c', name: 'Ann', language: 'pl' },
    ...over.thread,
  };
  const prisma: any = {
    supportThread: {
      updateMany: jest.fn().mockResolvedValue({ count: over.claim ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(thread),
    },
    supportMessage: {
      findMany: jest.fn().mockResolvedValue([
        { body: 'Second', translatedBody: null, createdAt: new Date(2) },
        { body: 'Hello', translatedBody: 'Cześć', createdAt: new Date(1) },
      ]),
    },
  };
  const mail: any = {
    sendSupportReplyEmail: jest.fn().mockImplementation(async () => {
      if (over.sendOk instanceof Error) throw over.sendOk;
      return over.sendOk ?? true;
    }),
  };
  const config: any = { get: jest.fn().mockReturnValue('secret' in over ? over.secret : 's3cret') };
  return { svc: new SupportEmailService(prisma, mail, config), prisma, mail };
}

describe('SupportEmailService.sendUnreadReplyEmail', () => {
  it('claims with the full eligibility predicate before sending', async () => {
    const { svc, prisma, mail } = build();
    expect(await svc.sendUnreadReplyEmail('t1', undefined, NOW)).toBe(true);
    const arg = prisma.supportThread.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 't1',
      userUnreadCount: { gt: 0 },
      lastEmailedAt: null,
      emailEnabled: true,
      muted: false,
      user: { isActive: true, email: { not: '' } },
    });
    expect(arg.data).toEqual({ lastEmailedAt: NOW });
    expect(prisma.supportThread.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mail.sendSupportReplyEmail.mock.invocationCallOrder[0]);
  });

  it('adds the 12 h bound for the cron: firstUnreadReplyAt <= cutoff', async () => {
    const { svc, prisma } = build();
    const cutoff = new Date(NOW.getTime() - 12 * H);
    await svc.sendUnreadReplyEmail('t1', cutoff, NOW);
    expect(prisma.supportThread.updateMany.mock.calls[0][0].where.firstUnreadReplyAt).toEqual({ lte: cutoff });
  });

  it('sends nothing when the claim loses (already emailed / ineligible / concurrent run)', async () => {
    const { svc, mail } = build({ claim: 0 });
    expect(await svc.sendUnreadReplyEmail('t1', undefined, NOW)).toBe(false);
    expect(mail.sendSupportReplyEmail).not.toHaveBeenCalled();
  });

  it('sends the unread developer replies, translation first, original only when translated', async () => {
    const { svc, prisma, mail } = build();
    await svc.sendUnreadReplyEmail('t1', undefined, NOW);
    expect(prisma.supportMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { threadId: 't1', author: 'developer' }, take: 2, orderBy: { createdAt: 'desc' } }),
    );
    const p = mail.sendSupportReplyEmail.mock.calls[0][0];
    expect(p.to).toBe('a@b.c');
    expect(p.lang).toBe('pl');
    expect(p.replies).toEqual([
      { text: 'Cześć', original: 'Hello' },
      { text: 'Second', original: null },
    ]);
    expect(p.ctaUrl).toBe(SUPPORT_EMAIL_CTA_URL);
    expect(p.ctaUrl).toContain('/support');
    expect(p.unsubscribeUrl).toContain('/api/v1/mail/unsubscribe/support?u=u1&t=' + signSupportUnsubscribeToken('u1', 's3cret'));
  });

  it('resets lastEmailedAt when the send returns false', async () => {
    const { svc, prisma } = build({ sendOk: false });
    expect(await svc.sendUnreadReplyEmail('t1', undefined, NOW)).toBe(false);
    expect(prisma.supportThread.updateMany).toHaveBeenLastCalledWith({ where: { id: 't1', lastEmailedAt: NOW }, data: { lastEmailedAt: null } });
  });

  it('resets lastEmailedAt and rethrows when the send throws', async () => {
    const { svc, prisma } = build({ sendOk: new Error('smtp') });
    await expect(svc.sendUnreadReplyEmail('t1', undefined, NOW)).rejects.toThrow('smtp');
    expect(prisma.supportThread.updateMany).toHaveBeenLastCalledWith({ where: { id: 't1', lastEmailedAt: NOW }, data: { lastEmailedAt: null } });
  });

  it('does nothing without a signing secret', async () => {
    const { svc, prisma } = build({ secret: undefined });
    expect(await svc.sendUnreadReplyEmail('t1', undefined, NOW)).toBe(false);
    expect(prisma.supportThread.updateMany).not.toHaveBeenCalled();
  });
});
