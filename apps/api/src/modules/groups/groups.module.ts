import { Module } from '@nestjs/common';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupGuestController } from './group-guest.controller';
import { GroupGuestService } from './group-guest.service';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupOwnerGuard } from './guards/group-owner.guard';
import { GroupActiveGuard } from './guards/group-active.guard';
import { GroupOwnershipService } from './group-ownership.service';
import { GroupReminderCron } from './group-reminder.cron';
import { GroupItemsService } from './group-items.service';
import { GroupMergeService } from './group-merge.service';
import { GroupBotService } from './group-bot.service';
import { GroupBudgetMirrorModule } from './group-budget-mirror.module';
import { GroupBudgetMirrorController } from './group-budget-mirror.controller';

// PrismaService, CacheService and NotificationsService are @Global().
@Module({
  // ABA-654: the existing singleton ExchangeRateService for write-time conversion; never a second one.
  // ABA-660: the budget mirror (ledger-write hooks, its routes); the module has no path back here.
  imports: [CurrencyExchangeModule, GroupBudgetMirrorModule],
  controllers: [GroupsController, GroupGuestController, GroupBudgetMirrorController],
  providers: [GroupsService, GroupItemsService, GroupMergeService, GroupBotService, GroupGuestService, GroupOwnershipService, GroupReminderCron, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard],
  // GroupOwnershipService: UsersService / AdminService hand groups on before an account goes away.
  // GroupBotService: the Telegram / WhatsApp / Slack `group` command (ABA-658).
  exports: [GroupsService, GroupOwnershipService, GroupBotService],
})
export class GroupsModule {}
