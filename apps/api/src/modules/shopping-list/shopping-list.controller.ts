import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { ShoppingListService } from './shopping-list.service';
import { CreateListDto, UpdateListDto, CreateItemDto, UpdateItemDto } from './dto';

@Controller('shopping-list')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ShoppingListController {
  constructor(private readonly service: ShoppingListService) {}

  // GET /shopping-list
  @Get()
  getLists(@Req() req: AuthenticatedRequest) {
    return this.service.getLists(req.accountId, req.user.id);
  }

  // POST /shopping-list
  @Post()
  createList(@Req() req: AuthenticatedRequest, @Body() dto: CreateListDto) {
    return this.service.createList(req.accountId, req.user.id, dto);
  }

  // GET /shopping-list/suggestions — declared before dynamic :id GET routes (ABA-166 route-order pattern)
  @Get('suggestions')
  getSuggestions(@Req() req: AuthenticatedRequest) {
    return this.service.getRestockSuggestions(req.accountId);
  }

  // --- item routes declared before dynamic :id so /items/:itemId never resolves as :id ---

  // PATCH /shopping-list/items/:itemId
  @Patch('items/:itemId')
  updateItem(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string, @Body() dto: UpdateItemDto) {
    return this.service.updateItem(req.accountId, itemId, dto);
  }

  // DELETE /shopping-list/items/:itemId
  @Delete('items/:itemId')
  deleteItem(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string) {
    return this.service.deleteItem(req.accountId, itemId);
  }

  // POST /shopping-list/:id/items
  @Post(':id/items')
  addItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateItemDto) {
    return this.service.addItem(req.accountId, req.user.id, id, dto);
  }

  // POST /shopping-list/:id/clear-checked
  @Post(':id/clear-checked')
  clearChecked(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.clearChecked(req.accountId, id);
  }

  // PATCH /shopping-list/:id
  @Patch(':id')
  updateList(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateListDto) {
    return this.service.updateList(req.accountId, id, dto);
  }

  // DELETE /shopping-list/:id
  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  deleteList(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.deleteList(req.accountId, id);
  }
}
