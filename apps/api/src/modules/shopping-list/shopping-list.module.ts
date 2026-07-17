import { Module } from '@nestjs/common';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

@Module({
  controllers: [ShoppingListController],
  providers: [ShoppingListService, ShoppingReminderCron, ShoppingNotificationLedger],
  exports: [ShoppingListService],
})
export class ShoppingListModule {}
