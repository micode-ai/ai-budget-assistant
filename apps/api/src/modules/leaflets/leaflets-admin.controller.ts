import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type {
  AdminLeafletDetail,
  AdminLeafletItem,
  AdminLeafletPublishResult,
  AdminLeafletStats,
  AdminLeafletSummary,
} from '@budget/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AuthenticatedRequest } from '../../common/types';
import { LeafletsAdminService, LEAFLET_ADMIN_MAX_MB, LEAFLET_ADMIN_MAX_PAGES } from './leaflets-admin.service';
import { AdminLeafletItemUpdateSchema, AdminLeafletUpdateSchema, parseBody } from './dto';

/**
 * Gazetka match admin routes. A controller of its own (not routes on `LeafletsController`) so the
 * user-facing `JwtAuthGuard + AccountContextGuard` set and this `JwtAuthGuard + AdminGuard` set can
 * never leak into each other. No account context: admin leaflets have `accountId: null`.
 *
 * The interceptor's file count and per-file size are the hard ceiling (the defaults); the env caps
 * `LEAFLET_ADMIN_MAX_PAGES` / `LEAFLET_ADMIN_MAX_MB` are applied by the service within it. The shared
 * nginx body limit must also allow the upload (ops note, not code).
 */
@Controller('admin/leaflets')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LeafletsAdminController {
  constructor(private readonly service: LeafletsAdminService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(
    FilesInterceptor('files', LEAFLET_ADMIN_MAX_PAGES, { limits: { fileSize: LEAFLET_ADMIN_MAX_MB * 1024 * 1024 } }),
  )
  upload(@Req() req: AuthenticatedRequest, @UploadedFiles() files: Express.Multer.File[]): Promise<{ id: string }> {
    return this.service.upload(req.user.id, files ?? []);
  }

  @Get()
  list(): Promise<AdminLeafletSummary[]> {
    return this.service.list();
  }

  // Static segments before ':id'.
  @Get('stats')
  stats(@Query('days') days?: string): Promise<AdminLeafletStats> {
    return this.service.stats(days === undefined || days === '' ? 30 : Number(days));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminLeafletDetail> {
    return this.service.findOne(id);
  }

  @Get(':id/recipients')
  recipients(@Param('id') id: string): Promise<{ users: number }> {
    return this.service.recipients(id);
  }

  @Patch(':id')
  async updateLeaflet(@Param('id') id: string, @Body() body: unknown): Promise<AdminLeafletDetail> {
    return this.service.updateLeaflet(id, parseBody(AdminLeafletUpdateSchema, body));
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<AdminLeafletItem> {
    return this.service.updateItem(id, itemId, parseBody(AdminLeafletItemUpdateSchema, body));
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  async deleteItem(@Param('id') id: string, @Param('itemId') itemId: string): Promise<void> {
    await this.service.deleteItem(id, itemId);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<AdminLeafletPublishResult> {
    return this.service.publish(id, req.user.id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id') id: string): Promise<AdminLeafletDetail> {
    return this.service.unpublish(id);
  }
}
