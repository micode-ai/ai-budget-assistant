import { Module } from '@nestjs/common';
import { ReceiptSplitController } from './receipt-split.controller';
import { GuestController } from './guest.controller';
import { ReceiptSplitService } from './receipt-split.service';
import { DebtsModule } from '../debts/debts.module';

// Module-cycle check (per the task brief): DebtsModule declares no `imports` at
// all (see debts.module.ts) — it only wires DebtsController/DebtsService/
// DebtReminderCron off the global PrismaService. So ReceiptSplitModule -> DebtsModule
// is a one-way edge into a leaf module; there is no cycle to guard with forwardRef.
//
// GuestController (the public `/s/:token` guest page, Task 6) needs only PrismaService
// and NotificationsService, both @Global() (database.module.ts, notifications.module.ts)
// — no extra `imports` entry required for it to resolve.
@Module({
  imports: [DebtsModule],
  controllers: [ReceiptSplitController, GuestController],
  providers: [ReceiptSplitService],
  exports: [ReceiptSplitService],
})
export class ReceiptSplitModule {}
