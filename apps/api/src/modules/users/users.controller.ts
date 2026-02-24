import { Controller, Get, Patch, Delete, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      aiResponseMode: user.aiResponseMode,
      aiModel: user.aiModel,
      createdAt: user.createdAt,
      isAdmin: adminEmails.includes(user.email.toLowerCase()),
    };
  }

  @Patch('me')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() body: { name?: string; currencyCode?: string; timezone?: string; language?: string }) {
    const user = await this.usersService.update(req.user.id, body);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
    };
  }

  @Patch('me/ai-response-mode')
  async updateAiResponseMode(@Req() req: AuthenticatedRequest, @Body() body: { mode: string }) {
    await this.usersService.updateAiResponseMode(req.user.id, body.mode);
    return { success: true, mode: body.mode };
  }

  @Patch('me/ai-model')
  async updateAiModel(@Req() req: AuthenticatedRequest, @Body() body: { model: string }) {
    await this.usersService.updateAiModel(req.user.id, body.model);
    return { success: true, model: body.model };
  }

  @Patch('me/push-token')
  async updatePushToken(@Req() req: AuthenticatedRequest, @Body() body: { pushToken: string | null }) {
    await this.usersService.updatePushToken(req.user.id, body.pushToken);
    return { success: true };
  }

  @Get('me/notification-preferences')
  async getNotificationPreferences(@Req() req: AuthenticatedRequest) {
    return this.usersService.getNotificationPreferences(req.user.id);
  }

  @Patch('me/notification-preferences')
  async updateNotificationPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: { budgetAlerts?: boolean; sharedAccountActivity?: boolean },
  ) {
    return this.usersService.updateNotificationPreferences(req.user.id, body);
  }

  @Delete('me')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    await this.usersService.deactivate(req.user.id);
    return { success: true };
  }
}
