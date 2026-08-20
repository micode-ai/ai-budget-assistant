import {
  Controller, Post, Get, Delete, Param, Body, UseGuards, Req,
  UseInterceptors, UploadedFile, Query, HttpCode,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportBankService } from './import-bank.service';
import { ImportBankAiPreviewService } from './ai-preview.service';
import { MappingService } from './mapping/mapping.service';
import { BankImportCommitBodyDto, CreateMappingBodyDto, RequestBankBodyDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import type { AuthenticatedRequest } from '../../common/types';
import type { BankParserDescriptor } from '@budget/shared-types';

@Controller('import/bank')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ImportBankController {
  constructor(
    private readonly service: ImportBankService,
    private readonly mapping: MappingService,
    private readonly aiPreview: ImportBankAiPreviewService,
  ) {}

  @Post('preview')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      mapping?: string;
      delimiter?: string;
      amountFormat?: 'polish' | 'standard';
      dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
    } = {},
    @Query('bankId') bankId?: BankParserDescriptor['id'],
    @Query('mappingId') mappingId?: string,
    @Query('encoding') encoding?: 'auto' | 'utf-8' | 'windows-1250',
  ) {
    let inlineMapping: import('@budget/shared-types').ColumnMapping | undefined;
    if (body.mapping) {
      try { inlineMapping = JSON.parse(body.mapping); } catch { /* ignore malformed JSON */ }
    }
    // Preview never grants AI-import consent itself — only the dedicated,
    // ViewerBlockGuard-protected POST /import/bank/ai-consent does (see
    // ImportBankService.resolveAiConsent / grantAiConsent). The client flow
    // is: preview -> needs_ai_consent -> user accepts -> POST /ai-consent ->
    // re-request preview.
    return this.service.parsePreview(req.accountId, req.user.id, file.buffer, {
      bankId, mappingId, encoding,
      inlineMapping,
      delimiter: body.delimiter,
      amountFormat: body.amountFormat,
      dateFormat: body.dateFormat,
    });
  }

  /**
   * Record the account's one-time consent to send statement fragments to the
   * AI provider. Writes account-wide state, so viewers are blocked.
   */
  @Post('ai-consent')
  @UseGuards(new ViewerBlockGuard(), ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  aiConsent(@Req() req: AuthenticatedRequest) {
    return this.aiPreview.grantAiConsent(req.accountId);
  }

  @Post('commit')
  commit(@Req() req: AuthenticatedRequest, @Body() dto: BankImportCommitBodyDto) {
    return this.service.commit(req.accountId, req.user.id, dto);
  }

  @Get('mappings')
  listMappings(@Req() req: AuthenticatedRequest) {
    return this.mapping.list(req.accountId);
  }

  @Post('mappings')
  createMapping(@Req() req: AuthenticatedRequest, @Body() dto: CreateMappingBodyDto) {
    return this.mapping.create(req.accountId, dto);
  }

  @Delete('mappings/:id')
  @HttpCode(204)
  deleteMapping(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.mapping.delete(req.accountId, id);
  }

  // Lets users ask us to support a new bank by sending the bank name + an
  // example statement. The request is delivered to the ops Telegram chat
  // (the app owner), never to the requesting user.
  @Post('request-bank')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  requestBank(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: RequestBankBodyDto,
  ) {
    return this.service.requestBank(
      { name: req.user.name, email: req.user.email },
      dto,
      file,
    );
  }
}
