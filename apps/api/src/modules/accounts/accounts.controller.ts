import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountInvitationsService } from './account-invitations.service';
import { AccountMembersService } from './account-members.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountLimitGuard } from '../subscriptions/guards/account-limit.guard';
import { UsageTrackingService } from '../subscriptions/usage-tracking.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  RespondToInvitationDto,
  UpdateMemberRoleDto,
  AccountMemberPaymentInfoDto,
  SetCategoryFixedDto,
} from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly invitationsService: AccountInvitationsService,
    private readonly membersService: AccountMembersService,
    private readonly subscriptionsService: UsageTrackingService,
  ) {}

  @Post()
  @UseGuards(AccountLimitGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.accountsService.findAllForUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, req.user.id, dto);
  }

  @Put(':id/fixed-categories')
  async setCategoryFixed(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetCategoryFixedDto,
  ) {
    return this.accountsService.setCategoryFixed(id, req.user.id, dto.categoryId, dto.fixed);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.remove(id, req.user.id);
  }

  // ---- Invitations ----

  @Post(':id/invitations')
  async createInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateInvitationDto,
  ) {
    await this.subscriptionsService.checkMemberLimit(req.user.id, id);
    return this.invitationsService.createInvitation(id, req.user.id, dto);
  }

  @Get(':id/invitations')
  async getInvitations(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.invitationsService.getInvitations(id, req.user.id);
  }

  @Get('invitations/mine')
  async getMyInvitations(@Req() req: AuthenticatedRequest) {
    return this.invitationsService.getMyInvitations(req.user.id);
  }

  @Patch('invitations/:id/respond')
  async respondToInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RespondToInvitationDto,
  ) {
    return this.invitationsService.respondToInvitation(id, req.user.id, dto.action);
  }

  @Delete(':id/invitations/:invitationId')
  async cancelInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.cancelInvitation(id, invitationId, req.user.id);
  }

  @Post('invitations/accept')
  async acceptInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.acceptInvitation(req.user.id, dto.inviteCode);
  }

  @Post('invitations/decline')
  async declineInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.declineInvitation(req.user.id, dto.inviteCode);
  }

  // ---- Members ----

  @Get(':id/members')
  async getMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.membersService.getMembers(id, req.user.id);
  }

  @Patch(':id/members/me/payment-info')
  async updatePaymentInfo(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AccountMemberPaymentInfoDto,
  ) {
    return this.membersService.updatePaymentInfo(id, req.user.id, dto);
  }

  @Patch(':id/members/:memberId')
  async updateMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateMemberRole(id, memberId, req.user.id, dto);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.membersService.removeMember(id, memberId, req.user.id);
  }

  @Post(':id/leave')
  async leaveAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.membersService.leaveAccount(id, req.user.id);
  }

  // ---- Trip lifecycle ----

  @Patch(':id/archive-trip')
  async archiveTrip(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { force?: boolean },
  ) {
    return this.accountsService.archiveTrip(id, req.user.id, body.force);
  }
}
