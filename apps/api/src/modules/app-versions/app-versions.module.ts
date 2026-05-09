import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppVersionsService } from './app-versions.service';
import { AppVersionsController } from './app-versions.controller';
import { AppVersionsAdminController } from './app-versions.admin.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AppVersionsController, AppVersionsAdminController],
  providers: [AppVersionsService, AdminGuard],
  exports: [AppVersionsService],
})
export class AppVersionsModule {}
