import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { SyncService, SyncResult } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';

@Controller('sync')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  async pushChanges(@Req() req: AuthenticatedRequest, @Body() body: { changes: any[] }) {
    const results = await this.syncService.pushChanges(req.accountId, req.user.id, body.changes);

    return {
      results,
      serverTimestamp: new Date().toISOString(),
      summary: {
        success: results.filter((r: SyncResult) => r.status === 'success').length,
        conflicts: results.filter((r: SyncResult) => r.status === 'conflict').length,
        errors: results.filter((r: SyncResult) => r.status === 'error').length,
      },
    };
  }

  @Get('pull')
  async pullChanges(@Req() req: AuthenticatedRequest, @Query('since') since: string) {
    const sinceDate = since ? new Date(since) : new Date(0);
    return this.syncService.pullChanges(req.accountId, req.user.id, sinceDate);
  }
}
