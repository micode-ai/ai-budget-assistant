import { Module } from '@nestjs/common';
import { IncomesController } from './incomes.controller';
import { IncomesService } from './incomes.service';
import { GamificationModule } from '../gamification/gamification.module';
import { FamilyFeedModule } from '../family-feed/family-feed.module';
import { WalletCurrencyModule } from '../wallet/wallet-currency.module';

@Module({
  imports: [WalletCurrencyModule, GamificationModule, FamilyFeedModule],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
