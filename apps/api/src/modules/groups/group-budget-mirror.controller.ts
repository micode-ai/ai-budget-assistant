import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';
import { GroupMemberGuard, type GroupRequest } from './guards';
import { CreateGroupCashLinkDto, SetGroupBudgetMirrorDto } from './dto';

/**
 * "Count my share in my budget" (ABA-660). Groups are NOT account-scoped (no AccountContextGuard /
 * ViewerBlockGuard; X-Account-Id is ignored): `GroupMemberGuard` proves the caller is a live member
 * (404 otherwise) and the SERVICE re-checks the target account on every write (a live member of it,
 * owner or editor, end-to-end encryption off), because that account is chosen in the body. Every
 * expense, income, settlement, suggestion and link id is re-scoped there too.
 *
 * `ThrottlerGuard` is per route: there is no APP_GUARD, so a bare `@Throttle` would be inert. No
 * `GroupActiveGuard`: the mirror is the caller's own bookkeeping and an archived group can still be
 * turned off, linked or unlinked.
 */
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupBudgetMirrorController {
  constructor(private readonly mirror: GroupBudgetMirrorService) {}

  @Get(':groupId/budget-mirror')
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  get(@Req() req: GroupRequest) {
    return this.mirror.getMirror(req.groupId, req.groupMember.id, req.user.id);
  }

  @Put(':groupId/budget-mirror')
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  enable(@Req() req: GroupRequest, @Body() dto: SetGroupBudgetMirrorDto) {
    return this.mirror.enable(req.groupId, req.groupMember.id, req.user.id, dto);
  }

  @Delete(':groupId/budget-mirror')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async disable(@Req() req: GroupRequest): Promise<void> {
    await this.mirror.disable(req.groupId, req.groupMember.id, req.user.id);
  }

  @Get(':groupId/budget-links')
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  links(@Req() req: GroupRequest) {
    return this.mirror.getLinks(req.groupId, req.groupMember.id, req.user.id);
  }

  @Post(':groupId/budget-links')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  link(@Req() req: GroupRequest, @Body() dto: CreateGroupCashLinkDto) {
    return this.mirror.createLink(req.groupId, req.groupMember.id, req.user.id, dto);
  }

  @Post(':groupId/budget-links/suggestions/:suggestionId/accept')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  accept(@Req() req: GroupRequest, @Param('suggestionId', ParseUUIDPipe) suggestionId: string) {
    return this.mirror.acceptSuggestion(req.groupId, req.groupMember.id, req.user.id, suggestionId);
  }

  @Post(':groupId/budget-links/suggestions/:suggestionId/reject')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  reject(@Req() req: GroupRequest, @Param('suggestionId', ParseUUIDPipe) suggestionId: string) {
    return this.mirror.rejectSuggestion(req.groupId, req.groupMember.id, req.user.id, suggestionId);
  }

  @Delete(':groupId/budget-links/:linkId')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, GroupMemberGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  unlink(@Req() req: GroupRequest, @Param('linkId', ParseUUIDPipe) linkId: string) {
    return this.mirror.unlink(req.groupId, req.groupMember.id, req.user.id, linkId);
  }
}
