import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { GamificationService } from './gamification.service';
import type { AuthenticatedRequest } from '../../common/types';

@Controller('gamification')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.getProfile(req.accountId, req.user.id);
  }

  @Post('check')
  async checkAchievements(@Req() req: AuthenticatedRequest) {
    return this.gamificationService.checkAchievements(req.accountId, req.user.id);
  }

  @Get('definitions')
  async getDefinitions() {
    return this.gamificationService.getDefinitions();
  }
}
