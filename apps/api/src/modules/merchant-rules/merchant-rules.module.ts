import { Module } from '@nestjs/common';
import { MerchantRulesController } from './merchant-rules.controller';
import { MerchantRulesService } from './merchant-rules.service';
import { ProductRulesService } from './product-rules.service';

@Module({
  controllers: [MerchantRulesController],
  providers: [MerchantRulesService, ProductRulesService],
  exports: [MerchantRulesService, ProductRulesService],
})
export class MerchantRulesModule {}
