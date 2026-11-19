import { PetReminderCron } from './pet-reminder.cron';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function make(pages: unknown[][], sendImpl: () => Promise<boolean> = () => Promise.resolve(true)) {
  const findMany = jest.fn();
  for (const p of pages) findMany.mockResolvedValueOnce(p);
  findMany.mockResolvedValue([]);
  const prisma: any = { pet: { findMany } };
  const notifications: any = { sendToUser: jest.fn(sendImpl) };
  return { cron: new PetReminderCron(prisma, notifications), prisma, notifications };
}

const pet = (id: string, vac: string | null, para: string | null) => ({
  id,
  userId: `u-${id}`,
  name: `Pet ${id}`,
  nextVaccinationDate: vac ? d(vac) : null,
  nextParasiteTreatmentDate: para ? d(para) : null,
});

describe('PetReminderCron', () => {
  it('pushes to the pet owner on the due days only, under the renewals switch', async () => {
    const { cron, notifications } = make([[pet('a', '2026-06-15', null), pet('b', '2026-06-10', '2026-06-03')]]);
    const sent = await cron.runFor(d('2026-06-01'));
    expect(sent).toBe(2);
    const calls = notifications.sendToUser.mock.calls;
    expect(calls.map((c: unknown[]) => c[0])).toEqual(['u-a', 'u-b']);
    expect(calls[0][3]).toEqual({ petId: 'a', petReminderKind: 'vaccination' });
    expect(calls[1][3]).toEqual({ petId: 'b', petReminderKind: 'parasite' });
    expect(calls[0][4]).toBe('subscription_renewal');
    expect((calls[0][1] as (l: string) => string)('pl')).toContain('Pet a');
  });

  it('queries only live pets with a date, in id-ordered pages', async () => {
    const { cron, prisma } = make([[]]);
    await cron.runFor(d('2026-06-01'));
    const args = prisma.pet.findMany.mock.calls[0][0];
    expect(args.where.isDeleted).toBe(false);
    expect(args.orderBy).toEqual({ id: 'asc' });
    expect(args.take).toBe(500);
  });

  it('pages on with a cursor after a full batch', async () => {
    const full = Array.from({ length: 500 }, (_, i) => pet(String(i).padStart(3, '0'), null, null));
    const { cron, prisma } = make([full, [pet('zzz', '2026-06-03', null)]]);
    expect(await cron.runFor(d('2026-06-01'))).toBe(1);
    expect(prisma.pet.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: '499' }, skip: 1 });
  });

  it('a failed push is logged, not thrown, and the run goes on', async () => {
    const { cron } = make([[pet('a', '2026-06-15', '2026-06-15')]], () => Promise.reject(new Error('expo down')));
    await expect(cron.runFor(d('2026-06-01'))).resolves.toBe(2);
    await new Promise((r) => setImmediate(r));
  });
});
