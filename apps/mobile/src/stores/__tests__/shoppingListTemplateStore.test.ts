// Server-only store (no SQLite mirror) — mirrors merchantRulesStore's own
// "in-memory, loads from API on demand" shape, so these tests just exercise
// the store against a mocked `api`, with no local-DB fakes needed.

jest.mock('@/services/api', () => ({
  api: {
    getShoppingListTemplates: jest.fn(),
    createShoppingListTemplate: jest.fn(),
    renameShoppingListTemplate: jest.fn(),
    deleteShoppingListTemplate: jest.fn(),
    applyShoppingListTemplate: jest.fn(),
  },
}));

import { api } from '@/services/api';
import { useShoppingListTemplateStore } from '../shoppingListTemplateStore';

const mockApi = api as unknown as {
  getShoppingListTemplates: jest.Mock;
  createShoppingListTemplate: jest.Mock;
  renameShoppingListTemplate: jest.Mock;
  deleteShoppingListTemplate: jest.Mock;
  applyShoppingListTemplate: jest.Mock;
};

function template(over: Partial<any> = {}) {
  return {
    id: 't1', accountId: 'a1', name: 'Weekly staples', sortOrder: 0, createdByUserId: 'u1',
    items: [{ id: 'i1', templateId: 't1', canonicalName: null, rawLabel: 'Milk', sortOrder: 0 }],
    ...over,
  };
}

describe('shoppingListTemplateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShoppingListTemplateStore.setState({ templates: [], isLoading: false });
  });

  describe('loadTemplates', () => {
    it('populates templates from the server', async () => {
      mockApi.getShoppingListTemplates.mockResolvedValue([template()]);
      await useShoppingListTemplateStore.getState().loadTemplates();
      expect(useShoppingListTemplateStore.getState().templates).toHaveLength(1);
      expect(useShoppingListTemplateStore.getState().isLoading).toBe(false);
    });

    it('fails silently and leaves the previous list on a server error', async () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: false });
      mockApi.getShoppingListTemplates.mockRejectedValue(new Error('offline'));
      await useShoppingListTemplateStore.getState().loadTemplates();
      expect(useShoppingListTemplateStore.getState().templates).toHaveLength(1);
      expect(useShoppingListTemplateStore.getState().isLoading).toBe(false);
    });
  });

  describe('saveAsTemplate', () => {
    it('appends the created template on success', async () => {
      const created = template();
      mockApi.createShoppingListTemplate.mockResolvedValue(created);
      const result = await useShoppingListTemplateStore
        .getState()
        .saveAsTemplate('Weekly staples', [{ rawLabel: 'Milk', canonicalName: null }]);
      expect(mockApi.createShoppingListTemplate).toHaveBeenCalledWith({
        name: 'Weekly staples',
        items: [{ rawLabel: 'Milk', canonicalName: null }],
      });
      expect(result).toEqual(created);
      expect(useShoppingListTemplateStore.getState().templates).toEqual([created]);
    });

    it('returns null and leaves state unchanged on failure', async () => {
      mockApi.createShoppingListTemplate.mockRejectedValue(new Error('cap reached'));
      const result = await useShoppingListTemplateStore
        .getState()
        .saveAsTemplate('One more', [{ rawLabel: 'Milk', canonicalName: null }]);
      expect(result).toBeNull();
      expect(useShoppingListTemplateStore.getState().templates).toEqual([]);
    });
  });

  describe('renameTemplate', () => {
    it('optimistically renames and keeps the change on success', async () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: false });
      mockApi.renameShoppingListTemplate.mockResolvedValue(template({ name: 'New name' }));
      const ok = await useShoppingListTemplateStore.getState().renameTemplate('t1', 'New name');
      expect(ok).toBe(true);
      expect(useShoppingListTemplateStore.getState().templates[0].name).toBe('New name');
    });

    it('rolls back the optimistic rename on failure', async () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: false });
      mockApi.renameShoppingListTemplate.mockRejectedValue(new Error('offline'));
      const ok = await useShoppingListTemplateStore.getState().renameTemplate('t1', 'New name');
      expect(ok).toBe(false);
      expect(useShoppingListTemplateStore.getState().templates[0].name).toBe('Weekly staples');
    });
  });

  describe('deleteTemplate', () => {
    it('optimistically removes and keeps it gone on success', async () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: false });
      mockApi.deleteShoppingListTemplate.mockResolvedValue(undefined);
      const ok = await useShoppingListTemplateStore.getState().deleteTemplate('t1');
      expect(ok).toBe(true);
      expect(useShoppingListTemplateStore.getState().templates).toEqual([]);
    });

    it('rolls back the optimistic delete on failure', async () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: false });
      mockApi.deleteShoppingListTemplate.mockRejectedValue(new Error('offline'));
      const ok = await useShoppingListTemplateStore.getState().deleteTemplate('t1');
      expect(ok).toBe(false);
      expect(useShoppingListTemplateStore.getState().templates).toHaveLength(1);
    });
  });

  describe('applyTemplate', () => {
    it('reports added/skipped counts from the server response', async () => {
      mockApi.applyShoppingListTemplate.mockResolvedValue({
        listId: 'list-1', listName: 'My List',
        addedLabels: ['Milk', 'Eggs'], skippedLabels: ['Bread'],
      });
      const result = await useShoppingListTemplateStore.getState().applyTemplate('t1', 'list-1');
      expect(mockApi.applyShoppingListTemplate).toHaveBeenCalledWith('t1', 'list-1');
      expect(result).toEqual({ addedCount: 2, skippedCount: 1 });
    });

    it('returns null on failure', async () => {
      mockApi.applyShoppingListTemplate.mockRejectedValue(new Error('offline'));
      const result = await useShoppingListTemplateStore.getState().applyTemplate('t1', 'list-1');
      expect(result).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears templates — used on account switch and sign-out', () => {
      useShoppingListTemplateStore.setState({ templates: [template()], isLoading: true });
      useShoppingListTemplateStore.getState().reset();
      expect(useShoppingListTemplateStore.getState().templates).toEqual([]);
      expect(useShoppingListTemplateStore.getState().isLoading).toBe(false);
    });
  });
});
