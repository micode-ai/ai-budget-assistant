import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { BudgetAlertService } from '../budgets/budget-alert.service';
import { SharedActivityService } from '../notifications/shared-activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, SaveReceiptImageDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('expenses')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ExpensesController {
  private readonly logger = new Logger(ExpensesController.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly budgetAlertService: BudgetAlertService,
    private readonly sharedActivityService: SharedActivityService,
  ) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseDto) {
    this.logger.debug(`[CREATE] raw body: ${JSON.stringify(req.body)}`);
    this.logger.debug(`[CREATE] dto: ${JSON.stringify(dto)}`);
    const { expense, isNew } = await this.expensesService.create(req.accountId, req.user.id, dto);

    // Fire-and-forget notifications (only for genuinely new expenses, not upsert updates)
    if (isNew) {
      this.budgetAlertService.checkBudgetsForAccount(req.accountId, dto.currencyCode)
        .catch(e => this.logger.error('Budget alert check failed', e));
      this.budgetAlertService.checkSpendingAnomalies(req.accountId, req.user.id)
        .catch(e => this.logger.error('Spending anomaly check failed', e));
      if (expense) {
        this.sharedActivityService.notifyExpenseCreated(
          req.accountId, req.user.id, expense.id, dto.amount, dto.currencyCode, dto.description,
        ).catch(e => this.logger.error('Shared activity notification failed', e));
      }
    }

    return expense;
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: ExpenseFiltersDto) {
    return this.expensesService.findAll(req.accountId, filters);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.findOne(req.accountId, id);
  }

  @Patch(':id')
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    this.logger.debug(`[UPDATE] id=${id} raw body: ${JSON.stringify(req.body)}`);
    this.logger.debug(`[UPDATE] dto: ${JSON.stringify(dto)}`);
    const expense = await this.expensesService.update(req.accountId, id, dto);

    // Re-check budget alerts if amount or currency changed
    if (expense && (dto.amount !== undefined || dto.currencyCode !== undefined)) {
      this.budgetAlertService.checkBudgetsForAccount(req.accountId, expense.currencyCode)
        .catch(e => this.logger.error('Budget alert check failed', e));
    }

    return expense;
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.remove(req.accountId, id);
  }

  @Patch(':id/stop-recurring')
  async stopRecurring(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.stopRecurring(req.accountId, id);
  }

  // ---- Expense Items ----

  @Get(':id/items')
  async getItems(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.getItems(req.accountId, id);
  }

  @Post(':id/items')
  async createItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateExpenseItemDto,
  ) {
    return this.expensesService.createItem(req.accountId, id, dto);
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateExpenseItemDto,
  ) {
    return this.expensesService.updateItem(req.accountId, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.expensesService.removeItem(req.accountId, id, itemId);
  }

  // ---- Receipt Image ----

  @Get(':id/receipt-image')
  async getReceiptImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.getReceiptImage(req.accountId, id);
  }

  @Put(':id/receipt-image')
  async saveReceiptImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveReceiptImageDto,
  ) {
    return this.expensesService.saveReceiptImage(req.accountId, id, dto.imageBase64, dto.mimeType);
  }

  @Delete(':id/receipt-image')
  async deleteReceiptImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.deleteReceiptImage(req.accountId, id);
  }

  // ---- Category Splits ----

  @Post(':id/splits')
  async setSplits(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { splits: Array<{ categoryId: string; amount: number; percentage: number; notes?: string }> },
  ) {
    return this.expensesService.setSplits(req.accountId, id, body.splits);
  }

  @Delete(':id/splits')
  async removeSplits(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.expensesService.removeSplits(req.accountId, id);
  }
}
