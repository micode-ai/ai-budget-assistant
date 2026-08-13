import { ReceiptCategorySplitService } from './receipt-category-split.service';

const CATEGORIES = [
  { id: 'c-food', name: 'Groceries' },
  { id: 'c-alc', name: 'Alcohol' },
];

const ITEMS = [
  { index: 0, label: 'Chleb', amount: 5 },
  { index: 1, label: 'Piwo Żywiec', amount: 8 },
];

function makeService(opts: {
  rules?: Map<string, string>;
  completion?: unknown;
  quotaUsed?: number;
} = {}) {
  const productRules = {
    getRulesMap: jest.fn().mockResolvedValue(opts.rules ?? new Map()),
    upsertRules: jest.fn().mockResolvedValue(undefined),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(opts.quotaUsed ?? 0),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const create = jest.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(opts.completion ?? { assignments: [] }) } }],
  });

  const service = new ReceiptCategorySplitService(
    { get: () => 'test-key' } as any,
    productRules as any,
    cache as any,
  );
  (service as any).openai = { chat: { completions: { create } } };

  return { service, productRules, cache, create };
}

describe('ReceiptCategorySplitService.classify', () => {
  it('answers from rules without calling the model', async () => {
    const { service, create } = makeService({ rules: new Map([['chleb', 'c-food'], ['piwo żywiec', 'c-alc']]) });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.get(1)).toBe('c-alc');
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model only about lines the rules did not cover, and learns the answer', async () => {
    const { service, productRules, create, cache } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      completion: { assignments: [{ line: 1, category: 'Alcohol' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(1)).toBe('c-alc');
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Piwo Żywiec');
    expect(prompt).not.toContain('Chleb');
    expect(productRules.upsertRules).toHaveBeenCalledWith('a1', [
      { canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' },
    ]);
    // A successful model call must actually spend one unit of the daily quota —
    // this is the positive counterpart to the "leaves it untouched on failure"
    // test below; without it, deleting recordInferenceUse entirely (removing
    // the only ceiling on this unmetered path) would leave every test green.
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^aisplit:a1:\d{4}-\d{2}-\d{2}$/),
      1,
      24 * 60 * 60,
    );
  });

  it('drops an invented category name instead of trusting it', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 1, category: 'Crypto' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.size).toBe(0);
  });

  it('drops an out-of-range line number, keeping a valid assignment from the same response', async () => {
    // The valid entry (line 1) must survive alongside the bad one (line 99).
    // If the bounds check were missing, `lines[98]` is undefined and reading
    // `.index` off it throws — a throw inside validateAssignments propagates
    // out of classifyWithModel and is swallowed by classify()'s try/catch,
    // which would silently discard the valid entry too. Asserting size === 0
    // alone (with nothing valid in the response) can't tell "gracefully
    // dropped" apart from "threw and got masked".
    const { service } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }, { line: 99, category: 'Alcohol' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.has(1)).toBe(false);
    expect(result.size).toBe(1);
  });

  it('keeps the valid assignments when one entry is bad', async () => {
    const { service } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }, { line: 2, category: 'Nope' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.has(1)).toBe(false);
  });

  it('falls back to rules only when the daily quota is spent', async () => {
    const { service, create } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      quotaUsed: 999,
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns rule hits and never throws when the model call fails, and leaves the quota counter untouched', async () => {
    const { service, create, cache } = makeService({ rules: new Map([['chleb', 'c-food']]) });
    create.mockRejectedValueOnce(new Error('openai down'));

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.has(1)).toBe(false);
    // A failed call must not spend the daily quota it never got value from —
    // only a model call that actually returns increments the counter.
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('matches category names case-insensitively', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 2, category: 'alcohol' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(1)).toBe('c-alc');
  });
});
