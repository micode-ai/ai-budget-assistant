import { Module } from '@nestjs/common';
import { AccountTransferController } from './account-transfer.controller';
import { AccountTransferService } from './account-transfer.service';

@Module({
  controllers: [AccountTransferController],
  providers: [AccountTransferService],
  exports: [AccountTransferService],
})
export class AccountTransferModule {}
