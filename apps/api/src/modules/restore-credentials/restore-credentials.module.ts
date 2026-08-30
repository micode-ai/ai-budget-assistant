import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RestoreCredentialsService } from './restore-credentials.service';
import { RestoreCredentialAuthController } from './restore-credential-auth.controller';
import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';

@Module({
  imports: [AuthModule],
  controllers: [RestoreCredentialRegistrationController, RestoreCredentialAuthController],
  providers: [RestoreCredentialsService],
  exports: [RestoreCredentialsService],
})
export class RestoreCredentialsModule {}
