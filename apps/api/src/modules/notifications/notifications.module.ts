import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { HeldPushReleaseCron } from './held-push-release.cron';
import { SharedActivityService } from './shared-activity.service';

@Global()
@Module({
  providers: [NotificationsService, SharedActivityService, HeldPushReleaseCron],
  exports: [NotificationsService, SharedActivityService],
})
export class NotificationsModule {}
