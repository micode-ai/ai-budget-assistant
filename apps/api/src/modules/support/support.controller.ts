import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { SupportMessageView, SupportThreadView } from '@budget/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';
import { SupportService } from './support.service';
import { SendSupportMessageDto, SupportThreadQueryDto, UpdateSupportThreadDto } from './dto';

/** User-scoped: JwtAuthGuard only, never AccountContextGuard. Every query filters by userId. */
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Get('thread')
  getThread(@Req() req: AuthenticatedRequest, @Query() query: SupportThreadQueryDto): Promise<SupportThreadView> {
    return this.service.getThreadForUser(req.user.id, query.before, query.limit);
  }

  @Post('messages')
  send(@Req() req: AuthenticatedRequest, @Body() dto: SendSupportMessageDto): Promise<SupportMessageView> {
    return this.service.sendUserMessage(req.user.id, dto);
  }

  @Post('thread/read')
  @HttpCode(204)
  async markRead(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.service.markReadByUser(req.user.id);
  }

  @Patch('thread')
  async update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSupportThreadDto): Promise<void> {
    await this.service.setAutoTranslate(req.user.id, dto.autoTranslate);
  }
}
