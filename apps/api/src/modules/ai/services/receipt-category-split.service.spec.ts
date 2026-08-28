import { ReceiptCategorySplitService } from './receipt-category-split.service';

const CATEGORIES = [
  { id: 'c-food', name: 'Groceries' },
  { id: 'c-alc', name: 'Alcohol' },
];

const ITEMS = [
  { index: 0, label: 'Chleb', ruleKey: 'Chleb', amount: 5 },
  { index: 1, label: 'Piwo Żywiec', ruleKey: 'Piwo Żywiec', amount: 8 },
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
    const { service, create } = makeService({ rules: new Map([['chleb', 'c-food'], ['piwozywiec', 'c-alc']]) });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.assignments.get(1)).toBe('c-alc');
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model only about lines the rules did not cover', async () => {
    const { service, create, cache } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      completion: { assignments: [{ line: 1, category: 'Alcohol' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(1)).toBe('c-alc');
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Piwo Żywiec');
    expect(prompt).not.toContain('Chleb');
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

    expect(result.assignments.size).toBe(0);
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

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.assignments.has(1)).toBe(false);
    expect(result.assignments.size).toBe(1);
  });

  it('keeps the valid assignments when one entry is bad', async () => {
    const { service } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }, { line: 2, category: 'Nope' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.assignments.has(1)).toBe(false);
  });

  it('falls back to rules only when the daily quota is spent', async () => {
    const { service, create } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      quotaUsed: 999,
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns rule hits and never throws when the model call fails, and leaves the quota counter untouched', async () => {
    const { service, create, cache } = makeService({ rules: new Map([['chleb', 'c-food']]) });
    create.mockRejectedValueOnce(new Error('openai down'));

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.assignments.has(1)).toBe(false);
    // A failed call must not spend the daily quota it never got value from —
    // only a model call that actually returns increments the counter.
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('matches category names case-insensitively', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 2, category: 'alcohol' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(1)).toBe('c-alc');
  });
});

describe('ReceiptCategorySplitService proposals', () => {
  it('returns a validated proposal alongside assignments', async () => {
    const { service } = makeService({
      completion: {
        assignments: [{ line: 1, category: 'Groceries' }],
        newCategories: [{ name: 'Chemia', lines: [2] }],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.proposals).toEqual([{ name: 'Chemia', itemIndexes: [1] }]);
  });

  it('drops a proposal that restates an existing category, whatever its casing', async () => {
    const { service } = makeService({
      completion: { assignments: [], newCategories: [{ name: '  aLCohol ', lines: [1, 2] }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toEqual([]);
  });

  it('drops a second proposal repeating the first name, and keeps at most three', async () => {
    const { service } = makeService({
      completion: {
        assignments: [],
        newCategories: [
          { name: 'Chemia', lines: [1] },
          { name: 'chemia', lines: [2] },
        ],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].itemIndexes).toEqual([0]);
  });

  // The test above never actually exercises the MAX_PROPOSED_CATEGORIES cap:
  // its second entry is a same-name duplicate, so validateProposals drops it
  // for a different reason (already-taken name) before the length check ever
  // has a fourth entry to truncate. This one feeds four DISTINCT, individually
  // valid proposals — each with its own unclaimed line — so the only thing
  // that can drop the fourth is the cap itself. ITEMS only has two lines, so
  // the items list is extended here rather than reusing indexes (a line
  // already claimed by an earlier proposal is skipped, which would silently
  // turn this into the same non-test as above).
  it('keeps at most three proposals when the model returns four distinct, valid ones', async () => {
    const items = [
      { index: 0, label: 'Chleb', ruleKey: 'Chleb', amount: 5 },
      { index: 1, label: 'Piwo Żywiec', ruleKey: 'Piwo Żywiec', amount: 8 },
      { index: 2, label: 'Płyn do naczyń', ruleKey: 'Płyn do naczyń', amount: 3 },
      { index: 3, label: 'Baterie AA', ruleKey: 'Baterie AA', amount: 4 },
    ];
    const { service } = makeService({
      completion: {
        assignments: [],
        newCategories: [
          { name: 'Chemia', lines: [1] },
          { name: 'Elektronika', lines: [2] },
          { name: 'Zdrowie', lines: [3] },
          { name: 'Zabawki', lines: [4] },
        ],
      },
    });

    const result = await service.classify({ accountId: 'a1', items, categories: CATEGORIES });

    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.map((p) => p.name)).toEqual(['Chemia', 'Elektronika', 'Zdrowie']);
  });

  it('lets an assignment win a line the model also claimed for a proposal', async () => {
    const { service } = makeService({
      completion: {
        assignments: [{ line: 1, category: 'Groceries' }],
        newCategories: [{ name: 'Chemia', lines: [1, 2] }],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.assignments.get(0)).toBe('c-food');
    expect(result.proposals[0].itemIndexes).toEqual([1]);
  });

  it('rejects malformed names and out-of-range lines', async () => {
    const { service } = makeService({
      completion: {
        assignments: [],
        newCategories: [
          { name: 'X', lines: [1] },
          { name: '12345', lines: [1] },
          { name: 'A'.repeat(31), lines: [1] },
          { name: 'Chemia', lines: [99] },
          { name: 'Chemia', lines: [] },
        ],
      },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.proposals).toEqual([]);
  });

  it('names the account language in the prompt', async () => {
    const { service, create } = makeService({ completion: { assignments: [] } });

    await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES, language: 'pl' });

    expect(create.mock.calls[0][0].messages[0].content).toContain('Polish');
  });

  it('never writes a product rule — learning belongs to the save path', async () => {
    const { service, productRules } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }] },
    });

    await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(productRules.upsertRules).not.toHaveBeenCalled();
  });
});
