import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AdminSupportMessageView, AdminSupportThreadSummary } from '@budget/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SupportAdminService } from './support-admin.service';
import { AdminSupportReplyBodyDto, AdminSupportThreadsQueryDto, AdminUpdateSupportThreadBodyDto } from './dto';

/** Developer-only (ADMIN_EMAILS). Not account-scoped: support is user-scoped. */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SupportAdminController {
  constructor(private readonly service: SupportAdminService) {}

  @Get('unread-count')
  async unreadCount(): Promise<{ total: number }> {
    return { total: await this.service.unreadTotal() };
  }

  @Get('threads')
  listThreads(@Query() query: AdminSupportThreadsQueryDto): Promise<AdminSupportThreadSummary[]> {
    return this.service.listThreads(query.filter ?? 'open');
  }

  @Get('threads/:id')
  getThread(@Param('id') id: string): Promise<{ summary: AdminSupportThreadSummary; messages: AdminSupportMessageView[] }> {
    return this.service.getThread(id);
  }

  @Post('threads/:id/reply')
  reply(@Param('id') id: string, @Body() dto: AdminSupportReplyBodyDto): Promise<AdminSupportMessageView> {
    return this.service.reply(id, dto.body, 'admin');
  }

  @Patch('threads/:id')
  updateThread(@Param('id') id: string, @Body() dto: AdminUpdateSupportThreadBodyDto): Promise<AdminSupportThreadSummary> {
    return this.service.updateThread(id, dto);
  }

  @Post('messages/:id/translate')
  retranslate(@Param('id') id: string): Promise<AdminSupportMessageView> {
    return this.service.retranslate(id);
  }
}
