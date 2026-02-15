import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import {
  AccountRoleGuard,
  RequireRole,
} from '../accounts/guards/account-role.guard';
import {
  SetupEncryptionDto,
  EnableAccountEncryptionDto,
  GrantKeyDto,
  RotateAccountKeyDto,
  SetupRecoveryDto,
  RecoverEncryptionDto,
} from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('encryption')
@UseGuards(JwtAuthGuard)
export class EncryptionController {
  constructor(private readonly encryptionService: EncryptionService) {}

  // ---- User Encryption Profile ----

  @Post('setup')
  async setupEncryption(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetupEncryptionDto,
  ) {
    return this.encryptionService.setupEncryption(req.user.id, dto);
  }

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.encryptionService.getProfile(req.user.id);
  }

  @Delete('profile')
  async resetProfile(@Req() req: AuthenticatedRequest) {
    return this.encryptionService.resetProfile(req.user.id);
  }

  // ---- Account Encryption ----

  @Post('account/:accountId/enable')
  @UseGuards(AccountContextGuard, AccountRoleGuard)
  @RequireRole('owner')
  async enableAccountEncryption(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: EnableAccountEncryptionDto,
  ) {
    return this.encryptionService.enableAccountEncryption(
      accountId,
      req.user.id,
      dto,
    );
  }

  @Get('account/:accountId/key')
  @UseGuards(AccountContextGuard)
  async getAccountKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
  ) {
    return this.encryptionService.getAccountKey(accountId, req.user.id);
  }

  @Get('account/:accountId/status')
  @UseGuards(AccountContextGuard)
  async getAccountEncryptionStatus(
    @Param('accountId') accountId: string,
  ) {
    return this.encryptionService.getAccountEncryptionStatus(accountId);
  }

  @Post('account/:accountId/grant-key')
  @UseGuards(AccountContextGuard, AccountRoleGuard)
  @RequireRole('owner')
  async grantKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: GrantKeyDto,
  ) {
    return this.encryptionService.grantKey(accountId, req.user.id, dto);
  }

  @Get('account/:accountId/pending-grants')
  @UseGuards(AccountContextGuard, AccountRoleGuard)
  @RequireRole('owner')
  async getPendingGrants(
    @Param('accountId') accountId: string,
  ) {
    return this.encryptionService.getPendingGrants(accountId);
  }

  @Post('account/:accountId/rotate-key')
  @UseGuards(AccountContextGuard, AccountRoleGuard)
  @RequireRole('owner')
  async rotateAccountKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: RotateAccountKeyDto,
  ) {
    return this.encryptionService.rotateAccountKey(accountId, req.user.id, dto);
  }

  // ---- Member Public Keys ----

  @Get('members/:accountId/public-keys')
  @UseGuards(AccountContextGuard)
  async getMemberPublicKeys(
    @Param('accountId') accountId: string,
  ) {
    return this.encryptionService.getMemberPublicKeys(accountId);
  }

  // ---- Recovery ----

  @Post('recovery/setup')
  async setupRecovery(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetupRecoveryDto,
  ) {
    return this.encryptionService.setupRecovery(req.user.id, dto);
  }

  @Post('recovery/recover')
  async recover(@Body() dto: RecoverEncryptionDto) {
    return this.encryptionService.recover(dto);
  }
}
