import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { AccountRoleGuard, RequireRole } from '../accounts/guards/account-role.guard';
import { CacheService } from '../../common/cache/cache.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly cache: CacheService,
  ) {}

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
    const result = await this.categoriesService.update(req.accountId, id, dto);
    // real-salary weights read coicopDivision — its cached answer is now stale
    if (dto.coicopDivision !== undefined) {
      await this.cache.delByPrefix(`rs:${req.accountId}:`);
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(AccountRoleGuard)
  @RequireRole('editor')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.categoriesService.remove(req.accountId, id);
  }
}
