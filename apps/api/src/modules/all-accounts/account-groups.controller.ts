import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { AccountGroupsService } from './account-groups.service';
import { AllAccountsService } from './all-accounts.service';
import { parsePeriod } from './all-accounts.controller';
import { UpsertAccountGroupBody } from './dto/account-groups.dto';

/**
 * Pro account groups for the all-accounts analytics. User-scoped on purpose
 * (no `AccountContextGuard`, no `req.accountId`): a group belongs to the user,
 * and every id in it is re-checked against their memberships.
 */
@Controller('account-groups')
@UseGuards(JwtAuthGuard)
export class AccountGroupsController {
  constructor(
    private readonly groups: AccountGroupsService,
    private readonly allAccounts: AllAccountsService,
  ) {}

  @Get()
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.groups.list(req.user.id);
  }

  @Post()
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: UpsertAccountGroupBody) {
    return this.groups.create(req.user.id, dto);
  }

  @Get(':id/analytics')
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard)
  async analytics(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const period = parsePeriod(start, end);
    const onlyAccountIds = await this.groups.resolveAccountIds(req.user.id, id);
    return this.allAccounts.getAnalytics(
      { id: req.user.id, currencyCode: req.user.currencyCode || 'USD' },
      { ...period, exclude: [], onlyAccountIds, groupId: id },
    );
  }

  @Patch(':id')
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard)
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpsertAccountGroupBody) {
    return this.groups.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.groups.remove(req.user.id, id);
  }
}
