import { Global, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { GeocodingModule } from './geocoding.module';
import { GeocodingService } from './services/geocoding.service';

// Regression test for tech-debt `geocoding-service-duplicate-instance-breaks-throttle`:
// AiModule and CommunityPriceModule used to each `providers: [GeocodingService]`
// their own instance, splitting the Nominatim rate-limit throttle (instance-level
// `lastRequestAt`/`chain` in GeocodingService.throttled()) across two DI graphs.
// Both now import the standalone GeocodingModule instead — this test proves that
// gives them the SAME singleton, and that the shared throttle actually serializes
// calls made through two independent consumer modules.

const mockPrisma = {
  geocodeCache: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

// Stands in for the real (@Global) DatabaseModule so GeocodingService's
// PrismaService dependency resolves without pulling in the real database module.
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: mockPrisma }],
  exports: [PrismaService],
})
class MockDatabaseModule {}

@Injectable()
class ConsumerA {
  constructor(public readonly geocoding: GeocodingService) {}
}

@Injectable()
class ConsumerB {
  constructor(public readonly geocoding: GeocodingService) {}
}

// Mirrors AiModule importing GeocodingModule.
@Module({ imports: [GeocodingModule], providers: [ConsumerA], exports: [ConsumerA] })
class ConsumerModuleA {}

// Mirrors CommunityPriceModule importing GeocodingModule.
@Module({ imports: [GeocodingModule], providers: [ConsumerB], exports: [ConsumerB] })
class ConsumerModuleB {}

describe('GeocodingModule sharing across two consumer modules', () => {
  beforeEach(() => {
    mockPrisma.geocodeCache.findUnique.mockClear();
    mockPrisma.geocodeCache.upsert.mockClear();
  });

  it('resolves the SAME GeocodingService instance for two independent importing modules', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockDatabaseModule, ConsumerModuleA, ConsumerModuleB],
    }).compile();

    const a = moduleRef.get(ConsumerA);
    const b = moduleRef.get(ConsumerB);

    expect(a.geocoding).toBeInstanceOf(GeocodingService);
    expect(a.geocoding).toBe(b.geocoding);

    await moduleRef.close();
  });

  it('throttles Nominatim calls made through two different consumer modules as one aggregate stream', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockDatabaseModule, ConsumerModuleA, ConsumerModuleB],
    }).compile();

    const a = moduleRef.get(ConsumerA);
    const b = moduleRef.get(ConsumerB);

    const requestTimestamps: number[] = [];
    global.fetch = jest.fn().mockImplementation(async () => {
      requestTimestamps.push(Date.now());
      return {
        ok: true,
        json: async () => [{ lat: '52.23', lon: '21.01', display_name: 'Test Place' }],
      };
    }) as unknown as typeof fetch;

    // Two distinct queries (distinct cache keys) fired "at once" from two
    // separate consumers — the old per-instance throttle would let both
    // Nominatim requests fire back-to-back; the shared instance must not.
    await Promise.all([
      a.geocoding.geocode('Marszalkowska 10, Warszawa'),
      b.geocoding.geocode('Nowy Swiat 20, Warszawa'),
    ]);

    expect(requestTimestamps).toHaveLength(2);
    const gapMs = requestTimestamps[1] - requestTimestamps[0];
    expect(gapMs).toBeGreaterThanOrEqual(1000);

    await moduleRef.close();
  }, 10000);
});
