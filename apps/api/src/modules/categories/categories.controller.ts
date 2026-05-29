import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { AccountRoleGuard, RequireRole } from '../accounts/guards/account-role.guard';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.categoriesService.findAll(req.accountId);
  }

  @Post()
  @UseGuards(AccountRoleGuard)
  @RequireRole('editor')
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(req.accountId, req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(AccountRoleGuard)
  @RequireRole('editor')
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(AccountRoleGuard)
  @RequireRole('editor')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.categoriesService.remove(req.accountId, id);
  }
}
