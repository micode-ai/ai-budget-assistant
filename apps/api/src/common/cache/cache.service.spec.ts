import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

const mockGet = jest.fn();
const mockGetdel = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockScan = jest.fn();
const mockPing = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();
const mockPipelineIncr = jest.fn();
const mockPipelinePexpire = jest.fn();
const mockPipelinePttl = jest.fn();
const mockPipelineExec = jest.fn();
const mockPipeline = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockGet,
    getdel: mockGetdel,
    set: mockSet,
    del: mockDel,
    scan: mockScan,
    ping: mockPing,
    quit: mockQuit,
    on: mockOn,
    pipeline: mockPipeline,
  })),
}));

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    [
      mockGet,
      mockGetdel,
      mockSet,
      mockDel,
      mockScan,
      mockPing,
      mockQuit,
      mockOn,
      mockPipeline,
      mockPipelineIncr,
      mockPipelinePexpire,
      mockPipelinePttl,
      mockPipelineExec,
    ].forEach((m) => m.mockReset());
    mockPipelineIncr.mockReturnThis();
    mockPipelinePexpire.mockReturnThis();
    mockPipelinePttl.mockReturnThis();
    mockPipeline.mockImplementation(() => ({
      incr: mockPipelineIncr,
      pexpire: mockPipelinePexpire,
      pttl: mockPipelinePttl,
      exec: mockPipelineExec,
    }));
    cache = new CacheService({ get: () => 'redis://localhost:6379' } as unknown as ConfigService);
  });

  describe('get', () => {
    it('parses json on hit', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      const r = await cache.get<{ a: number }>('foo');
      expect(r).toEqual({ a: 1 });
      expect(mockGet).toHaveBeenCalledWith('foo');
    });

    it('returns null on miss', async () => {
      mockGet.mockResolvedValueOnce(null);
      expect(await cache.get('foo')).toBeNull();
    });

    it('returns null when redis throws', async () => {
      mockGet.mockRejectedValueOnce(new Error('connection lost'));
      expect(await cache.get('foo')).toBeNull();
    });

    it('returns null when stored value is invalid json', async () => {
      mockGet.mockResolvedValueOnce('not-json{');
      expect(await cache.get('foo')).toBeNull();
    });
  });

  describe('getAndDelete', () => {
    it('parses json and returns it when the key existed', async () => {
      mockGetdel.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      const r = await cache.getAndDelete<{ a: number }>('foo');
      expect(r).toEqual({ a: 1 });
      expect(mockGetdel).toHaveBeenCalledWith('foo');
    });

    it('returns null on miss', async () => {
      mockGetdel.mockResolvedValueOnce(null);
      expect(await cache.getAndDelete('foo')).toBeNull();
    });

    it('returns null when redis throws', async () => {
      mockGetdel.mockRejectedValueOnce(new Error('connection lost'));
      expect(await cache.getAndDelete('foo')).toBeNull();
    });

    it('returns null when stored value is invalid json', async () => {
      mockGetdel.mockResolvedValueOnce('not-json{');
      expect(await cache.getAndDelete('foo')).toBeNull();
    });
  });

  describe('set', () => {
    it('serializes and writes with ttl', async () => {
      await cache.set('foo', { a: 1 }, 60);
      expect(mockSet).toHaveBeenCalledWith('foo', JSON.stringify({ a: 1 }), 'EX', 60);
    });

    it('swallows redis errors', async () => {
      mockSet.mockRejectedValueOnce(new Error('out of memory'));
      await expect(cache.set('foo', 1, 60)).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('passes keys to redis', async () => {
      await cache.del('a', 'b', 'c');
      expect(mockDel).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('is a no-op when no keys passed', async () => {
      await cache.del();
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe('delByPrefix', () => {
    it('scans keys + dels them', async () => {
      mockScan.mockResolvedValueOnce(['0', ['p:a', 'p:b']]);
      await cache.delByPrefix('p:');
      expect(mockScan).toHaveBeenCalledWith('0', 'MATCH', 'p:*', 'COUNT', 100);
      expect(mockDel).toHaveBeenCalledWith('p:a', 'p:b');
    });

    it('iterates across multiple scan pages', async () => {
      mockScan
        .mockResolvedValueOnce(['42', ['p:a']])
        .mockResolvedValueOnce(['0', ['p:b']]);
      await cache.delByPrefix('p:');
      expect(mockScan).toHaveBeenCalledTimes(2);
      expect(mockDel).toHaveBeenCalledWith('p:a', 'p:b');
    });

    it('is a no-op when no keys match', async () => {
      mockScan.mockResolvedValueOnce(['0', []]);
      await cache.delByPrefix('p:');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('swallows redis errors', async () => {
      mockScan.mockRejectedValueOnce(new Error('timeout'));
      await expect(cache.delByPrefix('p:')).resolves.toBeUndefined();
    });
  });

  describe('incrementWindow', () => {
    it('returns the incremented count and sets expiry only on new keys (NX)', async () => {
      mockPipelineExec.mockResolvedValueOnce([
        [null, 3],
        [null, 1],
      ]);

      const count = await cache.incrementWindow('k', 900000);

      expect(count).toBe(3);
      expect(mockPipelineIncr).toHaveBeenCalledWith('k');
      expect(mockPipelinePexpire).toHaveBeenCalledWith('k', 900000, 'NX');
    });

    it('throws when the incr command itself errors', async () => {
      mockPipelineExec.mockResolvedValueOnce([
        [new Error('boom'), null],
        [null, 1],
      ]);

      await expect(cache.incrementWindow('k', 900000)).rejects.toThrow('boom');
    });

    it('throws (does not swallow) when redis is unreachable', async () => {
      mockPipelineExec.mockRejectedValueOnce(new Error('connection lost'));

      await expect(cache.incrementWindow('k', 900000)).rejects.toThrow('connection lost');
    });
  });

  describe('incrementWindowWithTtl', () => {
    it('returns hits and the remaining window from PTTL', async () => {
      mockPipelineExec.mockResolvedValueOnce([
        [null, 7],
        [null, 0],
        [null, 41_500],
      ]);
      expect(await cache.incrementWindowWithTtl('k', 60_000)).toEqual({ hits: 7, ttlMs: 41_500 });
      expect(mockPipelinePexpire).toHaveBeenCalledWith('k', 60_000, 'NX');
      expect(mockPipelinePttl).toHaveBeenCalledWith('k');
    });

    it('falls back to the full window when redis reports no expiry', async () => {
      mockPipelineExec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
        [null, -1],
      ]);
      expect(await cache.incrementWindowWithTtl('k', 60_000)).toEqual({ hits: 1, ttlMs: 60_000 });
    });

    it('throws (does not swallow) on a redis error', async () => {
      mockPipelineExec.mockRejectedValueOnce(new Error('connection lost'));
      await expect(cache.incrementWindowWithTtl('k', 60_000)).rejects.toThrow('connection lost');
      mockPipelineExec.mockResolvedValueOnce([[new Error('boom'), null], [null, 1], [null, 5]]);
      await expect(cache.incrementWindowWithTtl('k', 60_000)).rejects.toThrow('boom');
    });
  });

  describe('takeOnce', () => {
    it('returns the parsed value, then null once consumed', async () => {
      mockGetdel.mockResolvedValueOnce(JSON.stringify({ a: 1 })).mockResolvedValueOnce(null);
      expect(await cache.takeOnce<{ a: number }>('k')).toEqual({ a: 1 });
      expect(await cache.takeOnce('k')).toBeNull();
    });

    it('rejects (does not swallow) when redis errors', async () => {
      mockGetdel.mockRejectedValueOnce(new Error('connection lost'));
      await expect(cache.takeOnce('k')).rejects.toThrow('connection lost');
    });
  });

  describe('setIfAbsentStrict', () => {
    it('true when the key was set (NX), false when it already existed', async () => {
      mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
      expect(await cache.setIfAbsentStrict('k', 60)).toBe(true);
      expect(await cache.setIfAbsentStrict('k', 60)).toBe(false);
      expect(mockSet).toHaveBeenCalledWith('k', '1', 'EX', 60, 'NX');
    });

    it('rejects (does not swallow) when redis errors, so the caller can tell an outage from "already set"', async () => {
      mockSet.mockRejectedValueOnce(new Error('connection lost'));
      await expect(cache.setIfAbsentStrict('k', 60)).rejects.toThrow('connection lost');
    });
  });

  describe('setStrict', () => {
    it('writes JSON with an EX ttl', async () => {
      mockSet.mockResolvedValueOnce('OK');
      await cache.setStrict('k', { a: 1 }, 600);
      expect(mockSet).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 600);
    });

    it('rejects (does not swallow) when redis errors', async () => {
      mockSet.mockRejectedValueOnce(new Error('connection lost'));
      await expect(cache.setStrict('k', 1, 600)).rejects.toThrow('connection lost');
    });
  });

  describe('ping', () => {
    it('returns redis response', async () => {
      mockPing.mockResolvedValueOnce('PONG');
      expect(await cache.ping()).toBe('PONG');
    });
  });

  describe('onModuleDestroy', () => {
    it('quits the redis client', async () => {
      mockQuit.mockResolvedValueOnce('OK');
      await cache.onModuleDestroy();
      expect(mockQuit).toHaveBeenCalled();
    });

    it('swallows quit errors', async () => {
      mockQuit.mockRejectedValueOnce(new Error('already closed'));
      await expect(cache.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
