import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SharedActivityService } from './shared-activity.service';

@Global()
@Module({
  providers: [NotificationsService, SharedActivityService],
  exports: [NotificationsService, SharedActivityService],
})
export class NotificationsModule {}
