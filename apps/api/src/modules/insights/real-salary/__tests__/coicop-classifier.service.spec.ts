import OpenAI from 'openai';
import { CoicopClassifierService, CLASSIFY_BATCH } from '../coicop-classifier.service';

jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({})) }));

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
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP01', coicopSource: 'seed' } });
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
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'CP04', coicopSource: 'model' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'CP13', coicopSource: 'model' } });
  });

  // A JSON object of 50 `"NN": "CPxx"` pairs is ~8-10 tokens a pair: a flat
  // 400-token cap truncated a full batch, JSON.parse threw, nothing was stored,
  // and the same batch was re-asked (and truncated again) on every request.
  it('sizes the completion budget to a full batch so its JSON is never truncated', async () => {
    const cats = Array.from({ length: CLASSIFY_BATCH }, (_, i) => ({ id: `c${i}`, name: `Category ${i}`, icon: null }));
    const answer = Object.fromEntries(cats.map((_, i) => [String(i), 'CP09']));
    const { svc, create, update } = make(cats, answer);
    await svc.ensureClassified('acc');
    // A pretty-printed pair `  "49": "CP09",` tokenizes to ~8 tokens (indent,
    // quote, index, `":`, ` "`, `CP`, digits, `",` + newline); budget 10 each.
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(CLASSIFY_BATCH * 10);
    expect(update).toHaveBeenCalledTimes(CLASSIFY_BATCH);
  });

  it('keeps a small completion budget for a small batch', async () => {
    const { svc, create } = make([{ id: 'c1', name: 'Kot', icon: null }], { '0': 'CP13' });
    await svc.ensureClassified('acc');
    expect(create.mock.calls[0][0].max_tokens).toBeLessThanOrEqual(100);
  });

  it('tells the model TOTAL is only for people, pets or mixed categories, and maps generic names', async () => {
    const { svc, create } = make([{ id: 'c1', name: 'Rozrywka', icon: null }], { '0': 'CP09' });
    await svc.ensureClassified('acc');
    const system: string = create.mock.calls[0][0].messages[0].content;
    expect(system).toMatch(/TOTAL only/i);
    expect(system).toMatch(/person|people/i);
    expect(system).toMatch(/entertainment[^\n]*CP09|CP09[^\n]*entertainment/i);
    expect(system).toMatch(/subscriptions?[^\n]*CP08|CP08[^\n]*subscriptions?/i);
  });

  it('builds its own client with a 10 s timeout and no retries', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = { get: jest.fn().mockReturnValue('sk-test') };
    new CoicopClassifierService(prisma, config);
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test', timeout: 10_000, maxRetries: 0 });
  });

  it('stores TOTAL for an invented or missing answer so it is never re-asked', async () => {
    const { svc, update } = make([{ id: 'c1', name: 'Misc', icon: null }, { id: 'c2', name: 'X', icon: null }], { '0': 'CP99' });
    await svc.ensureClassified('acc');
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { coicopDivision: 'TOTAL', coicopSource: 'model' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { coicopDivision: 'TOTAL', coicopSource: 'model' } });
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
