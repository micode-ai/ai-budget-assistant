import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AppVersionsService } from './app-versions.service';
import { CreateAppVersionDto, UpdateAppVersionDto } from './dto';

@Controller('admin/app-versions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AppVersionsAdminController {
  constructor(private readonly service: AppVersionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateAppVersionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppVersionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
