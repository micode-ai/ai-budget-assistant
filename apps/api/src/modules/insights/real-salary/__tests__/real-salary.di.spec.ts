import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../common/cache/cache.service';
import { ExchangeRateService } from '../../../currency-exchange/exchange-rate.service';
import { PriceHistoryService } from '../../../price-history/price-history.service';
import { RealSalaryService } from '../real-salary.service';
import { RealSalaryBriefPdf } from '../real-salary-brief.pdf';
import { OfficialInflationService } from '../official-inflation.service';
import { CoicopClassifierService } from '../coicop-classifier.service';
import { EurostatClient } from '../eurostat.client';

/**
 * Nest boot smoke test: proves every real-salary provider resolves through
 * the actual DI container (not just constructed by hand in unit tests).
 * CoicopClassifierService's third constructor param is a TYPE ALIAS
 * (`OpenAILike`), which TypeScript emits as `Object` in design:paramtypes —
 * if that trips up Nest's DI, this is where it would surface.
 * OfficialInflationService implements OnApplicationBootstrap — we deliberately
 * only `compile()` the module, never `init()`/`createNestApplication()`, so
 * its bootstrap hook never fires here.
 */
describe('real-salary module DI wiring', () => {
  it('resolves RealSalaryService and CoicopClassifierService from the container', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealSalaryService,
        RealSalaryBriefPdf,
        OfficialInflationService,
        CoicopClassifierService,
        EurostatClient,
        { provide: PrismaService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ExchangeRateService, useValue: {} },
        { provide: PriceHistoryService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    expect(moduleRef.get(RealSalaryService)).toBeDefined();
    expect(moduleRef.get(CoicopClassifierService)).toBeDefined();
  });
});
