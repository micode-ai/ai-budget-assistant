import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { MerchantRulesService } from './merchant-rules.service';
import { ReapplyMerchantRuleDto } from './dto';

@Controller('merchant-rules')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class MerchantRulesController {
  constructor(private readonly merchantRules: MerchantRulesService) {}

  @Get()
  listRules(@Req() req: any) {
    return this.merchantRules.listRules(req.accountId);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  deleteRule(@Req() req: any, @Param('id') id: string) {
    return this.merchantRules.deleteRule(req.accountId, id);
  }

  @Get(':id/reapply-preview')
  previewReapply(@Req() req: any, @Param('id') id: string) {
    return this.merchantRules.previewReapply(req.accountId, id);
  }

  @Post(':id/reapply')
  @UseGuards(new ViewerBlockGuard())
  reapply(@Req() req: any, @Param('id') id: string, @Body() dto: ReapplyMerchantRuleDto) {
    return this.merchantRules.reapply(req.accountId, id, dto.categoryIds);
  }
}
