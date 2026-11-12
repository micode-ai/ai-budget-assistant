import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { ChildrenService } from './children.service';
import { ChildStatementService } from './child-statement.service';
import {
  ChildStatementDto,
  ChildSuggestionsDto,
  CreateChildDto,
  SetExpenseChildrenDto,
  SetItemChildDto,
  UpdateChildDto,
} from './dto';

/** Children of the current account (child costs). Viewers read; writes are viewer-blocked. */
@Controller('children')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ChildrenController {
  constructor(
    private readonly childrenService: ChildrenService,
    private readonly statementService: ChildStatementService,
  ) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('includeArchived') includeArchived?: string) {
    return this.childrenService.findAll(req.accountId, includeArchived === 'true');
  }

  @Post()
  @UseGuards(new ViewerBlockGuard())
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateChildDto) {
    return this.childrenService.create(req.accountId, req.user.id, dto);
  }

  // A read (no state change), so viewers may ask for suggestions too.
  // Declared before `:id` routes by convention; it is a POST, so no PATCH/GET can capture it.
  @Post('suggestions')
  @HttpCode(200)
  suggestions(@Req() req: AuthenticatedRequest, @Body() dto: ChildSuggestionsDto) {
    return this.childrenService.suggestions(req.accountId, dto.names);
  }

  /**
   * The Pro statement PDF. Editors and owners only (decision 11); 403
   * `ENCRYPTED_ACCOUNT` unless `encryptionTier === 0`. Sent once through
   * `@Res()` (the backups-export rule): a Buffer handed back to Nest would be
   * serialised again. Never logs the child's name.
   */
  @Post(':id/statement')
  @RequireTier('pro')
  @UseGuards(SubscriptionTierGuard, new ViewerBlockGuard())
  async statement(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChildStatementDto,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.statementService.generate(
      req.accountId,
      id,
      dto.from,
      dto.to,
      req.user.currencyCode || dto.currencyCode || 'USD',
      dto.locale || 'en',
    );
    const fileName = `child-statement_${dto.from}_${dto.to}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateChildDto) {
    return this.childrenService.update(req.accountId, req.user.id, id, dto);
  }
}

/**
 * The attribution routes under `/expenses`, kept in the children module so
 * `ExpensesController` stays untouched. Neither collides with an existing
 * expenses route: `PUT :id/children` has no sibling, and
 * `PATCH :id/items/:itemId` (ExpensesController) is one segment shorter than
 * `PATCH :expenseId/items/:itemId/child`.
 */
@Controller('expenses')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ExpenseChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Put(':id/children')
  @UseGuards(new ViewerBlockGuard())
  setExpenseChildren(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetExpenseChildrenDto,
  ) {
    return this.childrenService.setExpenseChildren(req.accountId, req.user.id, id, dto);
  }

  @Patch(':expenseId/items/:itemId/child')
  @HttpCode(204)
  @UseGuards(new ViewerBlockGuard())
  async setItemChild(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId') expenseId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetItemChildDto,
  ): Promise<void> {
    await this.childrenService.setItemChild(req.accountId, req.user.id, expenseId, itemId, dto.childId);
  }
}
