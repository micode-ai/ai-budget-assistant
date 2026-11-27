import { SupportEmailCron } from './support-email.cron';

describe('SupportEmailCron', () => {
  const NOW = new Date('2026-11-28T12:00:00Z');
  function build(rows: { id: string }[], sendResults: (boolean | Error)[] = []) {
    const prisma: any = { supportThread: { findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]) } };
    const email: any = { sendUnreadReplyEmail: jest.fn() };
    sendResults.forEach((r) => email.sendUnreadReplyEmail.mockImplementationOnce(async () => { if (r instanceof Error) throw r; return r; }));
    return { cron: new SupportEmailCron(prisma, email), prisma, email };
  }

  it('selects eligible threads older than 12 h, id-ordered', async () => {
    const { cron, prisma } = build([]);
    await cron.handleUnreadReplyEmails(NOW);
    const arg = prisma.supportThread.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      userUnreadCount: { gt: 0 },
      lastEmailedAt: null,
      emailEnabled: true,
      muted: false,
      firstUnreadReplyAt: { lte: new Date(NOW.getTime() - 12 * 3600_000) },
      user: { isActive: true, email: { not: '' } },
    });
    expect(arg.orderBy).toEqual({ id: 'asc' });
  });

  it('sends per thread with the cutoff and keeps going after a failure', async () => {
    const { cron, email } = build([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [true, new Error('x'), true]);
    const sent = await cron.handleUnreadReplyEmails(NOW);
    expect(sent).toBe(2);
    expect(email.sendUnreadReplyEmail).toHaveBeenCalledTimes(3);
    expect(email.sendUnreadReplyEmail).toHaveBeenCalledWith('a', new Date(NOW.getTime() - 12 * 3600_000), NOW);
  });

  it('pages with id > cursor (no cursor/skip), since claimed rows leave the filter', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: 'id' + String(i).padStart(3, '0') }));
    const { cron, prisma } = build(rows, rows.map(() => true));
    await cron.handleUnreadReplyEmails(NOW);
    const second = prisma.supportThread.findMany.mock.calls[1][0];
    expect(second.where.id).toEqual({ gt: 'id199' });
    expect(second).not.toHaveProperty('cursor');
    expect(second).not.toHaveProperty('skip');
  });
});
