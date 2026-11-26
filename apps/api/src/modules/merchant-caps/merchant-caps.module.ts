import { Module } from '@nestjs/common';
import { MerchantCapsController } from './merchant-caps.controller';
import { MerchantCapsService } from './merchant-caps.service';

@Module({
  controllers: [MerchantCapsController],
  providers: [MerchantCapsService],
  exports: [MerchantCapsService],
})
export class MerchantCapsModule {}
