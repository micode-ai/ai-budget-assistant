import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { PrismaService } from '../../../database/prisma.service';

const mockEmbedCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: { create: mockEmbedCreate },
    })),
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let prisma: {
    category: { findMany: jest.Mock; update: jest.Mock };
    tag: { findMany: jest.Mock; update: jest.Mock };
    project: { findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    mockEmbedCreate.mockReset();
    prisma = {
      category: { findMany: jest.fn(), update: jest.fn() },
      tag: { findMany: jest.fn(), update: jest.fn() },
      project: { findMany: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(EmbeddingService);
  });

  describe('embed', () => {
    it('calls openai with text-embedding-3-small and trimmed input', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
      const v = await service.embed('  coffee  ');
      expect(mockEmbedCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'coffee',
      });
      expect(v).toEqual([0.1, 0.2, 0.3]);
    });

    it('truncates input over 1000 chars', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [0] }] });
      const long = 'a'.repeat(2000);
      await service.embed(long);
      const call = mockEmbedCreate.mock.calls[0][0];
      expect(call.input.length).toBe(1000);
    });
  });

  describe('embedBatch', () => {
    it('returns empty array on empty input without calling api', async () => {
      const r = await service.embedBatch([]);
      expect(r).toEqual([]);
      expect(mockEmbedCreate).not.toHaveBeenCalled();
    });

    it('passes all texts to one openai call', async () => {
      mockEmbedCreate.mockResolvedValueOnce({
        data: [{ embedding: [1] }, { embedding: [2] }, { embedding: [3] }],
      });
      const r = await service.embedBatch(['a', 'b', 'c']);
      expect(r).toEqual([[1], [2], [3]]);
      expect(mockEmbedCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('matchCategory', () => {
    it('returns the category above threshold with highest similarity', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
      prisma.category.findMany.mockResolvedValueOnce([
        { id: 'a', name: 'Food', embedding: [0.85, 0.15, 0] },
        { id: 'b', name: 'Transport', embedding: [0, 1, 0] },
        { id: 'c', name: 'Coffee', embedding: [0.99, 0.01, 0] },
      ]);
      const r = await service.matchCategory('account-1', 'lunch at cafe', 0.7);
      expect(r?.categoryId).toBe('c');
      expect(r?.categoryName).toBe('Coffee');
      expect(r?.similarity).toBeGreaterThan(0.99);
    });

    it('returns null when nothing crosses threshold', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
      prisma.category.findMany.mockResolvedValueOnce([
        { id: 'b', name: 'Transport', embedding: [0, 1, 0] },
      ]);
      expect(await service.matchCategory('account-1', 'bus', 0.7)).toBeNull();
    });

    it('ignores categories with null embedding', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
      prisma.category.findMany.mockResolvedValueOnce([
        { id: 'a', name: 'Food', embedding: null },
        { id: 'c', name: 'Coffee', embedding: [0.95, 0.05, 0] },
      ]);
      const r = await service.matchCategory('account-1', 'latte', 0.7);
      expect(r?.categoryId).toBe('c');
    });

    it('ignores categories with empty-array embedding', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
      prisma.category.findMany.mockResolvedValueOnce([
        { id: 'a', name: 'Food', embedding: [] },
      ]);
      expect(await service.matchCategory('account-1', 'x', 0.7)).toBeNull();
    });
  });

  describe('matchTag', () => {
    it('returns matching tag', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0] }] });
      prisma.tag.findMany.mockResolvedValueOnce([
        { id: 't1', name: 'work', embedding: [0.95, 0.05] },
        { id: 't2', name: 'home', embedding: [0, 1] },
      ]);
      const r = await service.matchTag('account-1', 'office', 0.7);
      expect(r?.tagId).toBe('t1');
      expect(r?.tagName).toBe('work');
    });
  });

  describe('matchProject', () => {
    it('returns matching project, excludes archived', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0] }] });
      prisma.project.findMany.mockResolvedValueOnce([
        { id: 'p1', name: 'kitchen-renovation', embedding: [0.95, 0.05] },
      ]);
      const r = await service.matchProject('account-1', 'tile install', 0.7);
      expect(r?.projectId).toBe('p1');
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false, isDeleted: false }),
        }),
      );
    });
  });

  describe('embedAndStore', () => {
    it('writes embedding back to category', async () => {
      mockEmbedCreate.mockResolvedValueOnce({ data: [{ embedding: [0.5, 0.5] }] });
      await service.embedAndStore('category', 'cat-1', 'Food');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { embedding: [0.5, 0.5] },
      });
    });

    it('swallows errors instead of throwing', async () => {
      mockEmbedCreate.mockRejectedValueOnce(new Error('rate limit'));
      await expect(service.embedAndStore('tag', 'tag-1', 'work')).resolves.toBeUndefined();
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });
});
