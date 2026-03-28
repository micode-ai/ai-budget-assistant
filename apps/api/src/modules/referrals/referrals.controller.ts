import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('my-code')
  async getMyCode(@Request() req: AuthenticatedRequest) {
    const code = await this.referralsService.generateCode(req.user.id);
    return { code };
  }

  @Get('stats')
  async getStats(@Request() req: AuthenticatedRequest) {
    return this.referralsService.getStats(req.user.id);
  }

  @Get('list')
  async getList(@Request() req: AuthenticatedRequest) {
    return this.referralsService.getList(req.user.id);
  }
}
