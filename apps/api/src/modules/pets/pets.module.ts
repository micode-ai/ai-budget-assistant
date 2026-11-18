import { Module } from '@nestjs/common';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [PetsController],
  providers: [PetsService],
})
export class PetsModule {}
