import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseBoolPipe,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectExpenseDto,
  AddProjectIncomeDto,
} from './dto';

@Controller('projects')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('archived', new ParseBoolPipe({ optional: true }))
    archived?: boolean,
  ) {
    return this.projectsService.findAll(req.accountId, archived);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.findOne(req.accountId, id);
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(req.accountId, req.user.id, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.remove(req.accountId, id);
  }

  @Post(':id/expenses')
  async addExpense(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddProjectExpenseDto,
  ) {
    return this.projectsService.addExpense(req.accountId, id, body.expenseId);
  }

  @Delete(':id/expenses/:expenseId')
  async removeExpense(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.projectsService.removeExpense(req.accountId, id, expenseId);
  }

  @Post(':id/incomes')
  async addIncome(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddProjectIncomeDto,
  ) {
    return this.projectsService.addIncome(req.accountId, id, body.incomeId);
  }

  @Delete(':id/incomes/:incomeId')
  async removeIncome(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('incomeId') incomeId: string,
  ) {
    return this.projectsService.removeIncome(req.accountId, id, incomeId);
  }

  @Get(':id/analytics')
  async getAnalytics(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.projectsService.getAnalytics(req.accountId, id);
  }
}
