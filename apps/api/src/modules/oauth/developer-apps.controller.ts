import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { OAuthClientsService } from './oauth-clients.service';
import { CreateDeveloperAppDto, UpdateDeveloperAppDto } from './dto/developer-app.dto';

/**
 * Developer-app registry. Apps belong to a USER, not an account, so there is deliberately no
 * AccountContextGuard / ViewerBlockGuard here. Every query in the service filters by ownerUserId.
 */
@Controller('developer/apps')
@UseGuards(PublicApiEnabledGuard, JwtAuthGuard)
export class DeveloperAppsController {
  constructor(private readonly clients: OAuthClientsService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return { apps: await this.clients.listForOwner(req.user.id) };
  }

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDeveloperAppDto) {
    return this.clients.create(req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateDeveloperAppDto) {
    return this.clients.update(req.user.id, id, dto);
  }

  @Post(':id/rotate-secret')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  rotateSecret(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clients.rotateSecret(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.clients.remove(req.user.id, id);
  }
}
