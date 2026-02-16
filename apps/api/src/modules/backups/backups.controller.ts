import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { RestoreBackupDto } from './dto';

@Controller('backups')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post('export')
  async exportBackup(@Req() req: AuthenticatedRequest) {
    return this.backupsService.exportBackup(req.accountId, req.user.id);
  }

  @Post('restore')
  async restoreBackup(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RestoreBackupDto,
  ) {
    return this.backupsService.restoreBackup(req.accountId, req.user.id, dto);
  }

  @Get('history')
  async getHistory(@Req() req: AuthenticatedRequest) {
    return this.backupsService.getHistory(req.accountId, req.user.id);
  }
}
