import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminGateway } from './admin.gateway';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    JwtModule.register({}),
    forwardRef(() => ReferralsModule),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminGateway],
  exports: [AdminService, AdminGateway],
})
export class AdminModule {}
