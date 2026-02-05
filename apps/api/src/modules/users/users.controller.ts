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
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      createdAt: user.createdAt,
    };
  }

  @Patch('me')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() body: { name?: string; currencyCode?: string; timezone?: string }) {
    const user = await this.usersService.update(req.user.id, body);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
    };
  }

  @Patch('me/push-token')
  async updatePushToken(@Req() req: AuthenticatedRequest, @Body() body: { pushToken: string }) {
    await this.usersService.updatePushToken(req.user.id, body.pushToken);
    return { success: true };
  }

  @Delete('me')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    await this.usersService.deactivate(req.user.id);
    return { success: true };
  }
}
