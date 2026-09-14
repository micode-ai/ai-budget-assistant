import { Module } from '@nestjs/common';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingListTemplateService } from './shopping-list-template.service';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

@Module({
  controllers: [ShoppingListController],
  providers: [
    ShoppingListService,
    ShoppingListTemplateService,
    ShoppingReminderCron,
    ShoppingNotificationLedger,
  ],
  exports: [ShoppingListService, ShoppingListTemplateService],
})
export class ShoppingListModule {}
