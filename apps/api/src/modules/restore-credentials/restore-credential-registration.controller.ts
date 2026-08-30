import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';
import { RestoreCredentialsService } from './restore-credentials.service';
import { VerifyRestoreRegistrationDto } from './dto';

@Controller('auth/restore')
@UseGuards(JwtAuthGuard)
export class RestoreCredentialRegistrationController {
  constructor(private readonly service: RestoreCredentialsService) {}

  @Get('register/options')
  getOptions(@Req() req: AuthenticatedRequest) {
    return this.service.getRegistrationOptions(req.user.id, req.user.email);
  }

  @Post('register')
  register(@Req() req: AuthenticatedRequest, @Body() dto: VerifyRestoreRegistrationDto) {
    return this.service.verifyRegistration(req.user.id, dto.response);
  }

  @Delete()
  remove(@Req() req: AuthenticatedRequest) {
    return this.service.deleteForUser(req.user.id);
  }
}
