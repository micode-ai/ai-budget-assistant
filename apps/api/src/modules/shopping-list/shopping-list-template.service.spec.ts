import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShoppingListTemplateService, MAX_SHOPPING_LIST_TEMPLATES } from './shopping-list-template.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingListTemplateService', () => {
  let service: ShoppingListTemplateService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      shoppingListTemplate: {
        findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(),
        update: jest.fn(), delete: jest.fn(), count: jest.fn(),
      },
      shoppingList: { findFirst: jest.fn() },
      shoppingListItem: { findMany: jest.fn(), create: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [ShoppingListTemplateService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ShoppingListTemplateService);
  });

  describe('create', () => {
    it('creates a template with cleaned, trimmed items', async () => {
      prisma.shoppingListTemplate.count.mockResolvedValue(0);
      prisma.shoppingListTemplate.create.mockResolvedValue({
        id: 't1', accountId: 'a1', name: 'Weekly staples', sortOrder: 0, createdByUserId: 'u1',
        items: [{ id: 'i1', templateId: 't1', canonicalName: null, rawLabel: 'Milk', sortOrder: 0 }],
      });

      const result = await service.create('a1', 'u1', {
        name: '  Weekly staples  ',
        items: [{ rawLabel: '  Milk  ' }, { rawLabel: '' }],
      });

      expect(prisma.shoppingListTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'a1', name: 'Weekly staples', createdByUserId: 'u1',
            items: { create: [{ rawLabel: 'Milk', canonicalName: null, sortOrder: 0 }] },
          }),
        }),
      );
      expect(result.items).toHaveLength(1);
    });

    it('rejects when all items are blank after trimming', async () => {
      prisma.shoppingListTemplate.count.mockResolvedValue(0);
      await expect(
        service.create('a1', 'u1', { name: 'Empty', items: [{ rawLabel: '   ' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shoppingListTemplate.create).not.toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      prisma.shoppingListTemplate.count.mockResolvedValue(0);
      await expect(
        service.create('a1', 'u1', { name: '   ', items: [{ rawLabel: 'Milk' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creating past the per-account cap', async () => {
      prisma.shoppingListTemplate.count.mockResolvedValue(MAX_SHOPPING_LIST_TEMPLATES);
      await expect(
        service.create('a1', 'u1', { name: 'One more', items: [{ rawLabel: 'Milk' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shoppingListTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('renames an existing template', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({ id: 't1', accountId: 'a1' });
      prisma.shoppingListTemplate.update.mockResolvedValue({
        id: 't1', accountId: 'a1', name: 'New name', sortOrder: 0, createdByUserId: 'u1', items: [],
      });
      const result = await service.rename('a1', 't1', { name: '  New name  ' });
      expect(prisma.shoppingListTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: { name: 'New name' } }),
      );
      expect(result.name).toBe('New name');
    });

    it('404s on a template belonging to a different account', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue(null);
      await expect(service.rename('a1', 't1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('hard-deletes an existing template', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({ id: 't1', accountId: 'a1' });
      await service.remove('a1', 't1');
      expect(prisma.shoppingListTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('404s on a template belonging to a different account', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue(null);
      await expect(service.remove('a1', 't1')).rejects.toThrow(NotFoundException);
      expect(prisma.shoppingListTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe('apply', () => {
    it('adds every template item to an empty list', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({
        id: 't1', accountId: 'a1',
        items: [
          { rawLabel: 'Milk', canonicalName: 'Milk' },
          { rawLabel: 'Eggs', canonicalName: null },
        ],
      });
      prisma.shoppingList.findFirst.mockResolvedValue({ id: 'list-1', name: 'My List' });
      prisma.shoppingListItem.findMany.mockResolvedValue([]);
      prisma.shoppingListItem.create.mockResolvedValue({});

      const result = await service.apply('a1', 'u1', 't1', 'list-1');

      expect(prisma.shoppingListItem.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        listId: 'list-1', listName: 'My List',
        addedLabels: ['Milk', 'Eggs'], skippedLabels: [],
      });
    });

    it('skips items that already exist on the target list (normalized, case-insensitive)', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({
        id: 't1', accountId: 'a1',
        items: [
          { rawLabel: 'milk', canonicalName: null },
          { rawLabel: 'Bread', canonicalName: null },
        ],
      });
      prisma.shoppingList.findFirst.mockResolvedValue({ id: 'list-1', name: 'My List' });
      prisma.shoppingListItem.findMany.mockResolvedValue([
        { rawLabel: 'MILK', canonicalName: null },
      ]);
      prisma.shoppingListItem.create.mockResolvedValue({});

      const result = await service.apply('a1', 'u1', 't1', 'list-1');

      expect(prisma.shoppingListItem.create).toHaveBeenCalledTimes(1);
      expect(result.addedLabels).toEqual(['Bread']);
      expect(result.skippedLabels).toEqual(['milk']);
    });

    it('does not add the same template item twice in one apply (intra-template dedup)', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({
        id: 't1', accountId: 'a1',
        items: [
          { rawLabel: 'Milk', canonicalName: null },
          { rawLabel: 'milk', canonicalName: null },
        ],
      });
      prisma.shoppingList.findFirst.mockResolvedValue({ id: 'list-1', name: 'My List' });
      prisma.shoppingListItem.findMany.mockResolvedValue([]);
      prisma.shoppingListItem.create.mockResolvedValue({});

      const result = await service.apply('a1', 'u1', 't1', 'list-1');

      expect(prisma.shoppingListItem.create).toHaveBeenCalledTimes(1);
      expect(result.addedLabels).toEqual(['Milk']);
      expect(result.skippedLabels).toEqual(['milk']);
    });

    it('404s when the template does not belong to the account', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue(null);
      await expect(service.apply('a1', 'u1', 't1', 'list-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the list is not resolvable (matches the ABA-166 OR id/clientId convention)', async () => {
      prisma.shoppingListTemplate.findFirst.mockResolvedValue({ id: 't1', accountId: 'a1', items: [] });
      prisma.shoppingList.findFirst.mockResolvedValue(null);
      await expect(service.apply('a1', 'u1', 't1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
