import { Module } from '@nestjs/common';
import { TransactionRevisionsService } from './transaction-revisions.service';

@Module({
  providers: [TransactionRevisionsService],
  exports: [TransactionRevisionsService],
})
export class TransactionRevisionsModule {}
