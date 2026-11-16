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
  // Every route below acts on the account in the PATH, so it checks the caller's
  // membership (and the owner role where needed) of THAT account — not the
  // X-Account-Id header the account guards read, which can name a different
  // account (ABA-807).

  @Post('account/:accountId/enable')
  async enableAccountEncryption(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: EnableAccountEncryptionDto,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id, 'owner');
    return this.encryptionService.enableAccountEncryption(
      accountId,
      req.user.id,
      dto,
    );
  }

  @Get('account/:accountId/key')
  async getAccountKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id);
    return this.encryptionService.getAccountKey(accountId, req.user.id);
  }

  @Get('account/:accountId/status')
  async getAccountEncryptionStatus(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id);
    return this.encryptionService.getAccountEncryptionStatus(accountId);
  }

  @Post('account/:accountId/grant-key')
  async grantKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: GrantKeyDto,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id, 'owner');
    return this.encryptionService.grantKey(accountId, req.user.id, dto);
  }

  @Get('account/:accountId/pending-grants')
  async getPendingGrants(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id, 'owner');
    return this.encryptionService.getPendingGrants(accountId);
  }

  @Post('account/:accountId/rotate-key')
  async rotateAccountKey(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Body() dto: RotateAccountKeyDto,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id, 'owner');
    return this.encryptionService.rotateAccountKey(accountId, req.user.id, dto);
  }

  // ---- Member Public Keys ----

  @Get('members/:accountId/public-keys')
  async getMemberPublicKeys(
    @Req() req: AuthenticatedRequest,
    @Param('accountId') accountId: string,
  ) {
    await this.encryptionService.assertAccountAccess(accountId, req.user.id);
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
