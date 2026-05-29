import { Controller, Get, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  async exportBackup(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const { jsonStr, fileName } = await this.backupsService.exportBackup(req.accountId, req.user.id);
    // Stream the pre-serialized JSON straight to the body (no Nest
    // re-serialization). The filename travels in a header the client reads.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Backup-Filename', fileName);
    res.send(jsonStr);
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
