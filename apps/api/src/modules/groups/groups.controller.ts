import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';
import { GroupsService } from './groups.service';
import { GroupOwnershipService } from './group-ownership.service';
import { GroupActiveGuard, GroupMemberGuard, GroupOwnerGuard, type GroupRequest } from './guards';
import {
  AddGroupMemberDto,
  ArchiveGroupDto,
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
  GroupActivityQueryDto,
  GroupFxPreviewQueryDto,
  JoinGroupDto,
  LinkGuestDto,
  TransferGroupOwnerDto,
  UpdateGroupDto,
  UpdateGroupExpenseDto,
  UpdateGroupMemberDto,
} from './dto';

// Groups are NOT account-scoped: no AccountContextGuard / ViewerBlockGuard here. Membership guards
// (GroupMemberGuard -> 404 for non-members) replace them. X-Account-Id is ignored.
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly service: GroupsService,
    private readonly ownership: GroupOwnershipService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.listGroups(req.user.id);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateGroupDto) {
    return this.service.createGroup(req.user.id, req.user.name, dto);
  }

  // Declared before ':groupId' so 'preview' is not captured as an id.
  @Get('preview')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  preview(@Req() req: AuthenticatedRequest, @Query('guestToken') guestToken: string) {
    return this.service.preview(req.user.id, guestToken);
  }

  // ThrottlerGuard is applied per route: @Throttle alone is inert (no APP_GUARD is registered), and a
  // class-level guard would start rate-limiting every other route here with the default limit.
  @Post('join')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  join(@Req() req: AuthenticatedRequest, @Body() dto: JoinGroupDto) {
    return this.service.join(req.user.id, dto);
  }

  // Single-use code from POST /g/:token/link; binds the caller to that guest member.
  @Post('link-guest')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  linkGuest(@Req() req: AuthenticatedRequest, @Body() dto: LinkGuestDto) {
    return this.service.linkGuest(req.user.id, dto.code);
  }

  @Get(':groupId')
  @UseGuards(GroupMemberGuard)
  detail(@Req() req: GroupRequest) {
    return this.service.getDetail(req.groupId, req.groupMember.id);
  }

  @Get(':groupId/activity')
  @UseGuards(GroupMemberGuard)
  activity(@Req() req: GroupRequest, @Query() q: GroupActivityQueryDto) {
    return this.service.getActivity(req.groupId, q.before, q.limit);
  }

  // ABA-654: the provider rate the expense form shows for a foreign currency. Member-only; throttled
  // per route because it can reach the external rate provider (cached for an hour there).
  @Get(':groupId/fx-preview')
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  fxPreview(@Req() req: GroupRequest, @Query() q: GroupFxPreviewQueryDto) {
    return this.service.fxPreview(req.groupId, q.currency);
  }

  @Patch(':groupId')
  @UseGuards(GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard)
  update(@Req() req: GroupRequest, @Body() dto: UpdateGroupDto) {
    return this.service.updateGroup(req.groupId, req.groupMember.id, dto);
  }

  @Post(':groupId/rotate-link')
  @UseGuards(GroupMemberGuard, GroupOwnerGuard)
  rotateLink(@Req() req: GroupRequest) {
    return this.service.rotateLink(req.groupId);
  }

  // ABA-650. The caller is the guard-derived owner; the target id is re-scoped to the group in the
  // service. Throttled per route (no APP_GUARD exists, a bare @Throttle would be inert).
  @Post(':groupId/owner')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async transferOwner(@Req() req: GroupRequest, @Body() dto: TransferGroupOwnerDto) {
    await this.ownership.transfer(req.groupId, { memberId: req.groupMember.id, userId: req.user.id }, dto.memberId);
    return this.service.getDetail(req.groupId, req.groupMember.id);
  }

  // ABA-650. Any live member (the guard proves an app user) takes over an ORPHANED group; a group
  // with an owner answers 409 GROUP_HAS_OWNER.
  @Post(':groupId/adopt')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard, GroupActiveGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async adopt(@Req() req: GroupRequest) {
    await this.ownership.adopt(req.groupId, req.groupMember.id, req.user.id);
    return this.service.getDetail(req.groupId, req.groupMember.id);
  }

  @Post(':groupId/archive')
  @HttpCode(200)
  @UseGuards(GroupMemberGuard, GroupOwnerGuard)
  archive(@Req() req: GroupRequest, @Body() dto: ArchiveGroupDto) {
    return this.service.archive(req.groupId, req.groupMember.id, dto.force === true);
  }

  @Delete(':groupId')
  @HttpCode(204)
  @UseGuards(GroupMemberGuard, GroupOwnerGuard)
  async remove(@Req() req: GroupRequest): Promise<void> {
    await this.service.deleteGroup(req.groupId);
  }

  @Post(':groupId/members')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  addMember(@Req() req: GroupRequest, @Body() dto: AddGroupMemberDto) {
    return this.service.addMember(req.groupId, req.groupMember.id, dto);
  }

  @Patch(':groupId/members/:memberId')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  updateMember(@Req() req: GroupRequest, @Param('memberId') memberId: string, @Body() dto: UpdateGroupMemberDto) {
    return this.service.updateMember(req.groupId, req.groupMember.id, memberId, dto);
  }

  @Delete(':groupId/members/:memberId')
  @HttpCode(204)
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  async removeMember(@Req() req: GroupRequest, @Param('memberId') memberId: string): Promise<void> {
    await this.service.removeMember(req.groupId, req.groupMember.id, memberId);
  }

  // ABA-651. The owner frees one guest's browser claim. Owner-only (an orphaned group passes nobody),
  // the target re-scoped to the group in the service; throttled per route (no APP_GUARD exists).
  @Post(':groupId/members/:memberId/reset-claim')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  resetClaim(@Req() req: GroupRequest, @Param('memberId') memberId: string) {
    return this.service.resetClaim(req.groupId, req.groupMember.id, memberId);
  }

  @Post(':groupId/expenses')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  createExpense(@Req() req: GroupRequest, @Body() dto: CreateGroupExpenseDto) {
    return this.service.createExpense(req.groupId, req.groupMember.id, dto);
  }

  @Patch(':groupId/expenses/:expenseId')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  updateExpense(@Req() req: GroupRequest, @Param('expenseId') expenseId: string, @Body() dto: UpdateGroupExpenseDto) {
    return this.service.updateExpense(req.groupId, req.groupMember.id, expenseId, dto);
  }

  @Delete(':groupId/expenses/:expenseId')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  deleteExpense(@Req() req: GroupRequest, @Param('expenseId') expenseId: string) {
    return this.service.deleteExpense(req.groupId, req.groupMember.id, expenseId);
  }

  @Post(':groupId/settlements')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  createSettlement(@Req() req: GroupRequest, @Body() dto: CreateGroupSettlementDto) {
    return this.service.createSettlement(req.groupId, req.groupMember.id, dto);
  }

  @Delete(':groupId/settlements/:settlementId')
  @UseGuards(GroupMemberGuard, GroupActiveGuard)
  voidSettlement(@Req() req: GroupRequest, @Param('settlementId') settlementId: string) {
    return this.service.voidSettlement(req.groupId, req.groupMember.id, settlementId);
  }
}
