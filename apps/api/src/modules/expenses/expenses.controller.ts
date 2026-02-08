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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, SaveReceiptImageDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('expenses')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ExpensesController {
  private readonly logger = new Logger(ExpensesController.name);

  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseDto) {
    this.logger.debug(`[CREATE] raw body: ${JSON.stringify(req.body)}`);
    this.logger.debug(`[CREATE] dto: ${JSON.stringify(dto)}`);
    return this.expensesService.create(req.accountId, req.user.id, dto);
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
    return this.expensesService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.remove(req.accountId, id);
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
    return this.expensesService.saveReceiptImage(req.accountId, id, dto.imageBase64);
  }

  @Delete(':id/receipt-image')
  async deleteReceiptImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.deleteReceiptImage(req.accountId, id);
  }
}
