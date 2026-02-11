import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';

@Controller('tags')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.tagsService.findAll(req.accountId);
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() createTagDto: CreateTagDto,
  ) {
    return this.tagsService.create(req.accountId, req.user.id, createTagDto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.tagsService.update(req.accountId, id, updateTagDto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tagsService.remove(req.accountId, id);
  }

  @Post(':id/expenses/:expenseId')
  async addToExpense(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.tagsService.addToExpense(req.accountId, id, expenseId);
  }

  @Delete(':id/expenses/:expenseId')
  async removeFromExpense(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.tagsService.removeFromExpense(req.accountId, id, expenseId);
  }
}
