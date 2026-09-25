import { CategorizeBotService } from './categorize-bot.service';

describe('CategorizeBotService', () => {
  function setup(suggestResponse: any, categories: Array<{ id: string; name: string }>) {
    const categorizeSuggestions = { suggest: jest.fn().mockResolvedValue(suggestResponse) };
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue(categories),
      create: jest.fn(),
    };
    const expenseBulk = { bulkUpdate: jest.fn() };
    const service = new CategorizeBotService(
      categorizeSuggestions as any,
      categoriesService as any,
      expenseBulk as any,
    );
    return { service, categorizeSuggestions, categoriesService, expenseBulk };
  }

  describe('buildPlan', () => {
    it('builds steps with resolved category names and totals', async () => {
      const { service } = setup(
        {
          expenses: [],
          groups: [
            { categoryId: 'cat-1', proposedName: null, expenseIds: ['e1', 'e2'] },
            { categoryId: null, proposedName: 'Hardware', expenseIds: ['e3'] },
          ],
          unassigned: ['e4'],
          skippedEncrypted: 0,
          remainingToday: 4,
          limitReached: false,
        },
        [{ id: 'cat-1', name: 'Groceries' }],
      );

      const plan = await service.buildPlan('acc-1');

      expect(plan.steps).toEqual([
        { categoryId: 'cat-1', name: 'Groceries', isNew: false, expenseIds: ['e1', 'e2'] },
        { categoryId: null, name: 'Hardware', isNew: true, expenseIds: ['e3'] },
      ]);
      expect(plan.totalCandidates).toBe(3);
      expect(plan.unassignedCount).toBe(1);
      expect(plan.limitReached).toBe(false);
    });
  });

  describe('applyStep', () => {
    it('bulk-updates directly for an existing-category step', async () => {
      const { service, categoriesService, expenseBulk } = setup({}, []);
      expenseBulk.bulkUpdate.mockResolvedValue({ updated: 2 });

      const result = await service.applyStep('acc-1', 'user-1', {
        categoryId: 'cat-1',
        name: 'Groceries',
        isNew: false,
        expenseIds: ['e1', 'e2'],
      });

      expect(categoriesService.create).not.toHaveBeenCalled();
      expect(expenseBulk.bulkUpdate).toHaveBeenCalledWith('acc-1', {
        ids: ['e1', 'e2'],
        categoryId: 'cat-1',
      });
      expect(result).toEqual({ categoryName: 'Groceries', count: 2 });
    });

    it('creates the category first for a new step, using the created row\'s own id/name', async () => {
      const { service, categoriesService, expenseBulk } = setup({}, []);
      // CategoriesService.create is idempotent and may return an EXISTING row
      // with different casing than what was proposed — the resolved PK/name
      // must be used, never the raw step values.
      categoriesService.create.mockResolvedValue({ id: 'cat-new', name: 'hardware' });
      expenseBulk.bulkUpdate.mockResolvedValue({ updated: 1 });

      const result = await service.applyStep('acc-1', 'user-1', {
        categoryId: null,
        name: 'Hardware',
        isNew: true,
        expenseIds: ['e3'],
      });

      expect(categoriesService.create).toHaveBeenCalledWith('acc-1', 'user-1', {
        name: 'Hardware',
        type: 'expense',
      });
      expect(expenseBulk.bulkUpdate).toHaveBeenCalledWith('acc-1', {
        ids: ['e3'],
        categoryId: 'cat-new',
      });
      expect(result).toEqual({ categoryName: 'hardware', count: 1 });
    });
  });
});
