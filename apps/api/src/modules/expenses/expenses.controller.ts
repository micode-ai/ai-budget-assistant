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
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, SaveReceiptImageDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: ExpenseFiltersDto) {
    return this.expensesService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.remove(req.user.id, id);
  }

  // ---- Expense Items ----

  @Get(':id/items')
  async getItems(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.getItems(req.user.id, id);
  }

  @Post(':id/items')
  async createItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateExpenseItemDto,
  ) {
    return this.expensesService.createItem(req.user.id, id, dto);
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateExpenseItemDto,
  ) {
    return this.expensesService.updateItem(req.user.id, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.expensesService.removeItem(req.user.id, id, itemId);
  }

  // ---- Receipt Image ----

  @Get(':id/receipt-image')
  async getReceiptImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.getReceiptImage(req.user.id, id);
  }

  @Put(':id/receipt-image')
  async saveReceiptImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveReceiptImageDto,
  ) {
    return this.expensesService.saveReceiptImage(req.user.id, id, dto.imageBase64);
  }

  @Delete(':id/receipt-image')
  async deleteReceiptImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.expensesService.deleteReceiptImage(req.user.id, id);
  }
}
