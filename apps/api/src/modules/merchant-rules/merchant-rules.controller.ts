import { Controller, Get, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { MerchantRulesService } from './merchant-rules.service';

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
}
