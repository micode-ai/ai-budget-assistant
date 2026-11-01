import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminOAuthClientsService } from './admin-oauth-clients.service';
import type { UpdateAdminOAuthClientDto } from '@budget/shared-types';

interface AdminRequest extends Request {
  user: { id: string; email: string; name: string };
}

@Controller('admin/oauth-clients')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOAuthClientsController {
  constructor(
    private readonly service: AdminOAuthClientsService,
    private readonly adminService: AdminService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAdminOAuthClientDto,
    @Req() req: AdminRequest,
  ) {
    const changed = await this.service.update(id, body);
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    await this.adminService.logAction(req.user.id, 'oauth_client.update', 'oauth_client', id, changed, ip);
    return { ok: true };
  }
}
