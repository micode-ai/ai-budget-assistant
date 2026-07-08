import { Module } from '@nestjs/common';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingReminderCron } from './shopping-reminder.cron';

@Module({
  controllers: [ShoppingListController],
  providers: [ShoppingListService, ShoppingReminderCron],
  exports: [ShoppingListService],
})
export class ShoppingListModule {}
