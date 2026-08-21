import { Module } from '@nestjs/common';
import { WalletCurrencyService } from './wallet-currency.service';

/**
 * Deliberately tiny: any module whose writes can introduce a new currency
 * imports this instead of `WalletModule`, which keeps the graph cycle-free.
 */
@Module({
  providers: [WalletCurrencyService],
  exports: [WalletCurrencyService],
})
export class WalletCurrencyModule {}
