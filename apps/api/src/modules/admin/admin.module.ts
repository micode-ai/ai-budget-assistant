import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminGateway } from './admin.gateway';

@Module({
  imports: [
    JwtModule.register({}),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminGateway],
  exports: [AdminService, AdminGateway],
})
export class AdminModule {}
