import { CoicopClassifierService, CLASSIFY_BATCH } from '../coicop-classifier.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make(cats: any[], modelJson?: unknown, fail = false) {
  const update = jest.fn().mockResolvedValue({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    category: { findMany: jest.fn().mockResolvedValue(cats), update },
  };
  const create = fail
    ? jest.fn().mockRejectedValue(new Error('openai down'))
    : jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(modelJson ?? {}) } }] });
  const openai = { chat: { completions: { create } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = { get: jest.fn() };
  return { svc: new CoicopClassifierService(prisma, config, openai), prisma, update, create };
}

describe('CoicopClassifierService', () => {
  it('maps seed icons without calling the model', async () => {
    const { svc, update, create } = make([{ id: 'c1', name: 'Groceries', icon: '🛒' }]);
    await svc.ensureClassified('acc');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP01' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model with category NAMES only and stores valid answers', async () => {
    const { svc, update, create } = make(
      [{ id: 'c1', name: 'Czynsz', icon: '🏠' }, { id: 'c2', name: 'Kot', icon: null }],
      { '0': 'CP04', '1': 'CP13' },
    );
    await svc.ensureClassified('acc');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompt: string = create.mock.calls[0][0].messages.map((m: any) => m.content).join('\n');
    expect(prompt).toContain('0: Czynsz');
    expect(prompt).toContain('1: Kot');
    expect(prompt).not.toMatch(/\d+[.,]\d{2}/); // no amounts
    expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP04' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'CP13' } });
  });

  it('stores TOTAL for an invented or missing answer so it is never re-asked', async () => {
    const { svc, update } = make([{ id: 'c1', name: 'Misc', icon: null }, { id: 'c2', name: 'X', icon: null }], { '0': 'CP99' });
    await svc.ensureClassified('acc');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'TOTAL' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'TOTAL' } });
  });

  it('leaves categories unclassified when the model call fails (retried next time)', async () => {
    const { svc, update } = make([{ id: 'c1', name: 'Misc', icon: null }], undefined, true);
    await expect(svc.ensureClassified('acc')).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it(`queries at most ${CLASSIFY_BATCH} unclassified expense categories of the account`, async () => {
    const { svc, prisma } = make([]);
    await svc.ensureClassified('acc');
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc', type: 'expense', isDeleted: false, coicopDivision: null },
      select: { id: true, name: true, icon: true },
      take: CLASSIFY_BATCH,
    });
  });
});
