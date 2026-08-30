import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin ioredis wrapper for opportunistic caching. Failures are logged and
 * swallowed — cache is best-effort, never on the critical path. Kept simple:
 * get/set/del/delByPrefix/ping. Values are JSON-serialized.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    this.redis.on('error', (err) => this.logger.warn(`redis: ${err.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      this.logger.warn(`cache set failed for ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Atomic `SET key 1 EX ttl NX`. Returns true only when THIS caller created the
   * key — i.e. the previous window had expired (or never existed). Use it as a
   * "do this at most once per window" throttle where two concurrent requests must
   * not both win.
   *
   * Returns false when Redis is unavailable: callers are opportunistic side
   * effects, and skipping one is always safer than doing it on every request.
   */
  async setIfAbsent(key: string, ttlSec: number): Promise<boolean> {
    try {
      const res = await this.redis.set(key, '1', 'EX', ttlSec, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.warn(`cache setIfAbsent failed for ${key}: ${(err as Error).message}`);
      return false;
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`cache del failed: ${(err as Error).message}`);
    }
  }

  /**
   * Atomically read a key and delete it (`GETDEL`, requires Redis >= 6.2 —
   * production runs `redis:7-alpine`, so this is safe here). Used for
   * single-use values such as one-shot challenges, where a get-then-del pair
   * would leave a window in which two concurrent callers both observe the
   * value as present.
   *
   * `null` is overloaded: it means the key is genuinely absent, OR its value
   * failed to `JSON.parse`, OR Redis itself is unavailable — this method
   * cannot tell those apart, and does not try to. Only use it where "treat
   * absence as deny" is the correct behavior for ALL THREE cases (e.g. a
   * challenge lookup, where "I can't prove this challenge was issued" should
   * always reject). Do not use it where a Redis outage must fail *open*, or
   * where a caller needs to distinguish "never existed" from "existed but
   * something went wrong reading it".
   */
  async getAndDelete<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.getdel(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache getAndDelete failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const pattern = `${prefix}*`;
      let cursor = '0';
      const toDelete: string[] = [];
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        toDelete.push(...keys);
      } while (cursor !== '0');
      if (toDelete.length > 0) await this.redis.del(...toDelete);
    } catch (err) {
      this.logger.warn(`cache delByPrefix failed for ${prefix}: ${(err as Error).message}`);
    }
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  /**
   * Atomic fixed-window counter (`INCR` + `PEXPIRE … NX`), mirroring
   * `RedisThrottlerStorage`. Returns the hit count for the current window.
   *
   * Unlike every other method here, this does NOT swallow Redis errors: it
   * exists to gate abuse-prone security actions (e.g. brute-force limits on
   * account recovery), and silently returning "no hits yet" on a Redis error
   * would disable the limit precisely when it matters. Callers must decide
   * how to fail (typically: deny the action).
   */
  async incrementWindow(key: string, windowMs: number): Promise<number> {
    const results = (await this.redis
      .pipeline()
      .incr(key)
      .pexpire(key, windowMs, 'NX')
      .exec()) as [Error | null, unknown][];

    const [incrErr, totalHits] = results[0];
    if (incrErr) throw incrErr;
    return totalHits as number;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
