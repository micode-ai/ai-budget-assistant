import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountInvitationsService } from './account-invitations.service';
import { AccountMembersService } from './account-members.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountInvitationsService, AccountMembersService],
  exports: [AccountsService],
})
export class AccountsModule {}
