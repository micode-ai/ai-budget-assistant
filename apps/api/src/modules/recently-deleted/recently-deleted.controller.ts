import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { RecentlyDeletedService } from './recently-deleted.service';
import { RestoreDeletedDto } from './dto';

@Controller('recently-deleted')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class RecentlyDeletedController {
  constructor(private readonly service: RecentlyDeletedService) {}

  // Viewers may read the list (read-only), never restore.
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.service.list(req.accountId, limit ? Number(limit) || 100 : 100);
  }

  @Post('restore')
  @UseGuards(new ViewerBlockGuard())
  restore(@Req() req: AuthenticatedRequest, @Body() dto: RestoreDeletedDto) {
    return this.service.restore(req.accountId, dto.items);
  }
}
