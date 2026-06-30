import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { FamilyFeedService } from './family-feed.service';
import { ReactToFeedEventApiDto } from './dto';
import type { AuthenticatedRequest } from '../../common/types/index';

@Controller('family-feed')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class FamilyFeedController {
  constructor(private readonly svc: FamilyFeedService) {}

  @Get()
  getFeed(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getFeed(req.accountId, req.user.id, limit ? Number(limit) : 100);
  }

  @Post(':eventId/react')
  react(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: ReactToFeedEventApiDto,
  ) {
    return this.svc.react(req.accountId, req.user.id, eventId, dto.emoji);
  }

  @Delete(':eventId/react')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeReaction(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
  ) {
    return this.svc.removeReaction(req.accountId, req.user.id, eventId);
  }
}
