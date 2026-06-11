import { Controller, Get, Patch, Delete, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('alerts')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AnomalyController {
  constructor(private readonly service: AnomalyService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('unread') unread?: string) {
    return this.service.findAll(req.accountId, unread === 'true');
  }

  // `read-all` MUST be declared before the `:id` routes below — Express matches
  // in declaration order (same lesson as /expenses/bulk, ABA-166).
  @Patch('read-all')
  @UseGuards(new ViewerBlockGuard())
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.service.markAllRead(req.accountId);
  }

  @Patch(':id/read')
  @UseGuards(new ViewerBlockGuard())
  markRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.markRead(req.accountId, id);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  dismiss(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.dismiss(req.accountId, id);
  }
}
