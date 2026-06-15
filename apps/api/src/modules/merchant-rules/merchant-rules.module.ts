import { Module } from '@nestjs/common';
import { MerchantRulesController } from './merchant-rules.controller';
import { MerchantRulesService } from './merchant-rules.service';

@Module({
  controllers: [MerchantRulesController],
  providers: [MerchantRulesService],
  exports: [MerchantRulesService],
})
export class MerchantRulesModule {}
