import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { PurchaseRequestsService } from './purchase-requests.service';
import type { AuthenticatedRequest } from '../../common/types/index';
import {
  CreatePurchaseRequestApiDto,
  VotePurchaseRequestApiDto,
  UpdateApprovalRuleApiDto,
} from './dto';

@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PurchaseRequestsController {
  constructor(private readonly svc: PurchaseRequestsService) {}

  // CRITICAL: declare 'settings/approval-rule' and 'pending-count' BEFORE ':id'
  // routes — Express matches in declaration order, so a string like "settings"
  // or "pending-count" would be captured as `:id` if the param route came first.

  @Patch('settings/approval-rule')
  @UseGuards(new ViewerBlockGuard())
  async updateApprovalRule(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateApprovalRuleApiDto,
  ) {
    if (req.accountRole !== 'owner') {
      throw new ForbiddenException('Only the account owner can change the approval rule');
    }
    return this.svc.updateApprovalRule(req.accountId, dto.rule);
  }

  @Get('pending-count')
  getPendingCount(@Req() req: AuthenticatedRequest) {
    return this.svc.getPendingCount(req.accountId);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.svc.findAll(req.accountId, status);
  }

  @Post()
  @UseGuards(new ViewerBlockGuard())
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePurchaseRequestApiDto) {
    return this.svc.create(req.accountId, req.user.id, dto);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.findOne(id, req.accountId);
  }

  @Post(':id/vote')
  vote(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: VotePurchaseRequestApiDto,
  ) {
    return this.svc.vote(id, req.accountId, req.user.id, dto);
  }

  @Post(':id/convert')
  @UseGuards(new ViewerBlockGuard())
  convert(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.convert(id, req.accountId, req.user.id);
  }

  @Post(':id/mark-purchased')
  @UseGuards(new ViewerBlockGuard())
  markPurchased(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.markPurchased(id, req.accountId, req.user.id);
  }

  @Delete(':id')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.cancel(id, req.accountId, req.user.id, req.accountRole);
  }
}
